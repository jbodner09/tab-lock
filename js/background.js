// TODO:
// [X] Browser action icon of a lock/unlock
// [X]   It's state dependent for each tab, so when you switch tabs its state updates
// [X]   If it shows a lock, clicking it becomes an unlock, and vice versa
// [X]     Don't forget to do/undo all the locking code when this happens!
// [X] Background list of all locked tabs and their URLs
// [X]   dictionary keyed on tab id, value is url (or UNKNOWN if it's not set yet)
// [ ]   Will be checked upon browser and extension startup to automatically lock any restored tabs
// [ ]     Permanently closed tabs will be removed from list at this time
// [X]     Will also be removed if a tab/window is closed but browser remains open
// [ ]     Stretch goal: restore all applicable tabs, not just pinned ones (how to dedupe?)
// [X] Navigation listener on locked webpages to prevent navigation
// [X]   Likely:  listen to all navigations to also prevent navigation from external UI 
// [X]     like address bar, back/forward buttons, opening a favorite, etc.
// [X]     Question: Don't listen to other frames in case page has infinite load, ads, etc.?
// [ ]     Question: Also necessary to listen to XHRs?
// [X]   Stretch goal: create option to block navigation vs. opening all in new tabs 
// [X]   Stretch goal: and associated option for activating those new tabs or not
// [ ]   Stretch goal: open new tab next to parent instead of at end of window
// [ ]   Stretch goal: temporary tooltip popup when clicking a link (with associated option)
// [X]   Stretch goal: prevent cancelled navigation from throwing error page
// [X]     Might be possible in sub-cases by listening to link clicks/js and preventing events
// [X]     from bubbling, resorting to webRequest only for address bar, back/forward, etc. 
// [X] Bug fix: navigating back/forward still possible if previous tab was blank/new tab page
// [X] Bug fix: manual refresh gets rid of lock scripts
// [X] Bug fix: prevent double script injection due to pin/unpin since it breaks script removal
// [ ] Bug fix: change title to include lock icon on non-http/s pages as well
// [ ] Bug fix: manually navigating to new tab page means you can use the forward button to it as well
// [ ] Bug fix: new tab page fix only works in Edge; how can we dynamically detect and use Chrome's?
// [ ] Bug fix: sometimes page restore still fails and leaves error page
// [ ] Bug fix: sometimes unlock fails (workaround will block links called by in-page script)
// [X] Stretch goal: listen to tab pin/unpin events to automatically lock/unlock
// [X]   Restored pinned tabs should be locked unconditionally
// [X]   Stretch goal: option to prevent auto lock/unlock upon pin/unpin and startup
// [ ] Stretch goal: option to prevent closing a locked tab by setting an unload handler
// [ ]   Additional option to silently prevent vs. prompt (browser may prompt anyway)
// [ ] Stretch goal: changing favicon to add a lock icon
// [ ] Stretch goal: add a lock/unlock option to the context menu (only works on page...)
// [ ] Stretch goal: add a keyboard shortcut to lock/unlock the current tab
// [ ] Stretch goal: keep a history of closed tabs and re-lock them if they re-open
// [ ] Stretch goal: move to declarative web request if blocking behavior ever becomes deprecated
// [ ] Stretch goal: prevent double locks to begin with instead of dealing with symptoms
// [ ] Feature request: configurable list of domains to always have open external links in new tabs
// [ ] Feature request: rate limiting of newly-opened tabs (also as an emergency brake)
// [ ] Feature request: auto lock EVERYTHING!

// Version History:
// 0.1:  MVP with locked tab navigation block and pinned tab auto lock/unlock
// 0.2:  Reduced the situations where locked pages reload after diverting a navigation
//       and increased the number of pages that are able to block navigations. Also 
//       added options for handling new tabs and whether to auto-lock pinned tabs

// Put this at the top of every js file to enable cross-browser interop
window.browser = window.browser || window.chrome;

// Protects the lock list against concurrent writes
var databaseLock = true;

// Special copy of the database only to be read by the navigation handler because it's synchronous
var navigationDatabase = [];

// Count of locked tabs without URLs, used when listening for tab updates
var unknownCount = 0;

// Extension options (lock icon defaults to on, all others to off)
var lockIcon = true;
var blockOpen = false;
var backgroundOpen = false;
var autoLock = false;

// Constants
const noUrlString = "UNKNOWN";
const ntpString = "edge://newtab/";
const timeoutLength = 100;
const lockScript = `
	window.browser = window.browser || window.chrome;
	window.addEventListener("click", preventClick, true);
	function preventClick (e) {
		const link = e.target.closest('a');
		if (link !== null) {
			e.stopImmediatePropagation();
			e.preventDefault();
			browser.runtime.sendMessage({url: link.href});
		}
	}
	`;
const unlockScript = `
	window.removeEventListener("click", preventClick, true);
	var oldTitle = document.title.split('\u2008');
	if (oldTitle.length > 1) {
		document.title = oldTitle[1];
	}`;

// Helper function to check if a string contains... something
function isValidString (inputString) {
	if (inputString === undefined) {
		return false;
	}
	if (inputString === null) {
		return false;
	}
	return true;
}

// Callbacks to listen for various ways the active tab could change
browser.runtime.onStartup.addListener(updateIconWrapper1);
browser.runtime.onInstalled.addListener(updateIconWrapper1);
browser.tabs.onCreated.addListener(updateIconWrapper2);
browser.tabs.onActivated.addListener(updateIconWrapper3);
browser.tabs.onUpdated.addListener(updateIconWrapper4);
browser.tabs.onRemoved.addListener(updateLockListWrapper);
browser.windows.onFocusChanged.addListener(updateIconWrapper5);
browser.browserAction.onClicked.addListener(buttonToggleWrapper);

// Callback to do the fallback navigation blocking
browser.webRequest.onBeforeRequest.addListener(tryBlock,
	{urls: ["<all_urls>"], types: ["main_frame"]}, ["blocking"]);
	
// Callback to listen for clicks from pages that need to be opened in new tabs
browser.runtime.onMessage.addListener(messageReceiptWrapper);

// Update the Browser Action button
function updateIcon (locked) {
	if (locked === true) {
		browser.browserAction.setIcon({path:{
			"16":  "/images/lock16.png",
			"24":  "/images/lock24.png",
			"32":  "/images/lock32.png",
			"48":  "/images/lock48.png",
			"64":  "/images/lock64.png"
		}});
	}
	else {
		browser.browserAction.setIcon({path:{
			"16":  "/images/unlock16.png",
			"24":  "/images/unlock24.png",
			"32":  "/images/unlock32.png",
			"48":  "/images/unlock48.png",
			"64":  "/images/unlock64.png"
		}});
	}
}

// As soon as possible upon startup of extension/browser, reset the lock list
// Note that the database is initially locked so this can access it first
// Otherwise, the caller locks it and the callee unlocks it
// Also read options from storage, in case auto-lock is turned off
function updateIconWrapper1 () {
	browser.storage.local.get(["lockIcon", "blockOpen", "backgroundOpen", "autoLock"], 
	function (result) {
		
		// Initialize the lock icon toggle state from storage
		if (result && result.lockIcon) {
			if (result.lockIcon == "false") {
				lockIcon = false;
			}
		}
		else {
			browser.storage.local.set({"lockIcon": "true"});
		}
		
		// Initialize the block open toggle state from storage
		if (result && result.blockOpen) {
			if (result.blockOpen == "true") {
				blockOpen = true;
			}
		}
		else {
			browser.storage.local.set({"blockOpen": "false"});
		}
		
		// Initialize the background open toggle state from storage
		if (result && result.backgroundOpen) {
			if (result.backgroundOpen == "true") {
				backgroundOpen = true;
			}
		}
		else {
			browser.storage.local.set({"backgroundOpen": "false"});
		}
		
		// Initialize the auto lock toggle state from storage
		if (result && result.autoLock) {
			if (result.autoLock == "true") {
				autoLock = true;
			}
		}
		else {
			browser.storage.local.set({"autoLock": "false"});
		}
		
		// Go through all tabs and automatically add any pinned tabs to lock list
		// The lock list is just an array, indexed by tab id
		// The value (if it exists) at that index is the url of the tab or UNKNOWN
		// Only auto-lock pinned tabs if the option to do so is enabled
		browser.tabs.query({}, function (currentTabs) {
			const lockList = [];
			if (autoLock === true) {
				for (tab of currentTabs) {
					if (tab.pinned === true) {
						
						// If the tab doesn't have an url, set it as UNKNOWN and update unknown count
						// If it is a webpage, also insert the locking scripts for immediate locking
						if (("url" in tab) && (tab.url !== "")) {
							lockList[tab.id] = tab.url;
							insertLockScript(tab.id, tab.url);
						}
						else {
							lockList[tab.id] = noUrlString;
							unknownCount++;
						}
					}
				}
			}
			
			// Once it's set, update the icon for the active tab
			browser.storage.local.set({"lockList": lockList}, function () {
				navigationDatabase = lockList;
				doActiveUpdate();
			});
		});
	});
}

// A new tab was created; if it's active, it will start unlocked
// If it's not active, the current tab hasn't changed, so do nothing
function updateIconWrapper2 (currentTab) {
	if (currentTab.active === true) {
		updateIcon(false);
	}
}

// The active tab was changed; update the Browser Action icon if necessary
// Note that we ignore the incoming parameter and just manually find the new active tab
function updateIconWrapper3 (tabInfo) {
	if (databaseLock === true) {
		setTimeout(updateIconWrapper3, timeoutLength, null);
	}
	else {
		databaseLock = true;
		doActiveUpdate();
	}
}

// Something in a tab somewhere has changed (possibly multiple things!)
// Note: tab multi-select could cause this to be fired in rapid succession
// Pinning the active tab could change the icon too, so update it if necessary
function updateIconWrapper4 (tabId, tabInfo, currentTab) {
	if (databaseLock === true) {
		setTimeout(updateIconWrapper4, timeoutLength, tabId, tabInfo, currentTab);
	}
	else {
		databaseLock = true;
		doUpdateCheck(tabId, tabInfo, currentTab);
	}
}

// Window focus changed, which may have changed the active tab, so update the icon if neccessary
// Note that we ignore the incoming parameter and just manually find the new active tab
function updateIconWrapper5 (currentWindow) {
	updateIconWrapper3(null);
}

// A tab was closed; remove it from the lock list
// If it was the active tab, its change will update the visual with its event
// Note: closing a window could cause this to be fired in rapid succession
function updateLockListWrapper (tabId, tabInfo) {
	if (databaseLock === true) {
		setTimeout(updateLockListWrapper, timeoutLength, tabId, tabInfo);
	}
	else {
		databaseLock = true;
		doRemoveTab(tabId);
	}
}

// Listen for clicks to the Browser Action button to change the lock state
function buttonToggleWrapper (currentTab) {
	if (databaseLock === true) {
		setTimeout(buttonToggleWrapper, timeoutLength, currentTab);
	}
	else {
		databaseLock = true;
		doButtonToggle(currentTab);
	}
}

// Listen for messages from webpages or the options page
function messageReceiptWrapper (message, sender, sendResponse) {
	if (message) {
		
		// If the message has an url, then it's from a webpage to open a tab
		if (message.url) {
			if (databaseLock === true) {
				setTimeout(messageReceiptWrapper, timeoutLength, message, null, null);
			}
			else {
				databaseLock = true;
				doTabOpen(message.url);
			}
		}
		
		// Otherwise, it's from the options page that an option has changed
		else {
			
			// This message is to change the lock icon option
			if (message.lockIcon) {
				if (message.lockIcon == "true") {
					lockIcon = true;
				}
				else {
					lockIcon = false;
				}
			}
			
			// This message is to change the block open option
			if (message.blockOpen) {
				if (message.blockOpen == "true") {
					blockOpen = true;
				}
				else {
					blockOpen = false;
				}
			}
			
			// This message is to change the background open option
			if (message.backgroundOpen) {
				if (message.backgroundOpen == "true") {
					backgroundOpen = true;
				}
				else {
					backgroundOpen = false;
				}
			}
			
			// This message is to change the auto lock option
			if (message.autoLock) {
				if (message.autoLock == "true") {
					autoLock = true;
				}
				else {
					autoLock = false;
				}
			}
		}
	}
};


// Function to insert lock scripts on eligible pages (only webpages are eligible)
// Scripts prevent navigation without resorting to listening to web requests
// This prevents the need for locked tabs to reload upon a blocked navigation
// This only applies to links clicked on the page, not the address bar, etc.
// Note that the link's parent chain must be checked since its children could be the click target
// Also, all other click handlers are suppressed since they could manually trigger navigation
function insertLockScript (tabId, tabUrl) {
	
	// Check to see if the option to add a lock to the tab title is turned on
	var lockText = "";
	if (lockIcon === true) {
		lockText = `document.title = "\uD83D\uDD12\u2008" + document.title;`;
	}
	
	// Insert lock script
	if (tabUrl.startsWith("http") === true) {
		browser.tabs.executeScript(tabId, {code: lockScript + lockText});
	}
}

// Function to insert unlock scripts on eligible pages (only webpages are eligible)
// Note that the lock icon in the title is always checked for
function insertUnlockScript (tabId, tabUrl) {
	if (tabUrl.startsWith("http") === true) {
		browser.tabs.executeScript(tabId, {code: unlockScript});
	}
}

// Helper function to lock/unlock pinned tabs
function doUpdateCheck (tabId, tabInfo, currentTab) {
	browser.storage.local.get("lockList", function (result) {
		var newLockList = result.lockList;
		var changed = false;
		
		// It's a pin event, so add or remove the tab from the list as necessary
		// Don't do this if the auto-lock option is turned off
		if (("pinned" in tabInfo) && (autoLock === true)) {
			
			// The tab was pinned, so lock it
			// If it doesn't have an url, set it as UNKNOWN and update the unknown count
			// If it is a webpage, also insert the locking scripts for immediate locking
			// Only lock the page if it wasn't locked prior to pinning
			if (tabInfo.pinned === true) {
				if (isValidString(newLockList[tabId]) === false) {
					if (("url" in currentTab) && (currentTab.url !== "")) {
						newLockList[tabId] = currentTab.url;
						insertLockScript(tabId, currentTab.url);
					}
					else {
						newLockList[tabId] = noUrlString;
						unknownCount++;
					}
					changed = true;
				}
			}
			
			// The tab was unpinned, so unlock it
			// If it had a lock script inserted, insert the unlock script
			// Only unlock the page if it was locked prior to unpinning
			else {
				if (isValidString(newLockList[tabId]) === true) {
					newLockList[tabId] = null;
					if (("url" in currentTab) && (currentTab.url !== "")) {
						insertUnlockScript(tabId, currentTab.url);
					}
					changed = true;
				}
			}
		}
		
		// This was a navigation event.  If URL is present, then it wasn't a refresh
		if ("status" in tabInfo) {
			if ("url" in tabInfo) {
				
				// If the navigation was to the new tab page via the back button, undo that
				// This does refresh the page though, and only fixes the back button (not forward)
				// Also set the instant lock scripts on eligible pages
				// Note that the new tab is intentionally never opened
				if (tabInfo.url === ntpString) {
					if (isValidString(newLockList[tabId]) === true) {
						browser.tabs.goForward(tabId, function () {
							if (("url" in currentTab) && (currentTab.url !== "")) {
								insertLockScript(tabId, currentTab.url);
							}
						});
					}
				}
				
				// If it's a change in url and the tab is done loading, check the unknown count
				// If necessary, update the lock entry if the url couldn't be set initially
				// Add the actual URL to the lock list if necessary
				// Also set the instant lock scripts on eligible pages
				if (tabInfo.status === "complete") {
					if (("url" in currentTab) && (currentTab.url !== "")) {
						if ((unknownCount > 0) && (newLockList[tabId] === noUrlString)) {
							newLockList[tabId] = currentTab.url;
							insertLockScript(tabId, currentTab.url);
							unknownCount--;
							changed = true;
						}
					}
				}
			}
			
			// Page refresh has completed, so re-insert lock scripts if necessary
			else {
				if (tabInfo.status === "complete") {
					if (isValidString(newLockList[tabId]) === true) {
						insertLockScript(tabId, newLockList[tabId]);
					}
				}
			}
		}
		
		// Save the database if necessary and unlock it
		// Also update the browser action icon if necessary
		if (changed === true) {
			browser.storage.local.set({"lockList": newLockList}, function () {
				navigationDatabase = newLockList;
				doActiveUpdate();
			});
		}
		else {
			databaseLock = false;
		}
	});
}

// Helper function to perform the Browser Action icon update for the active tab
function doActiveUpdate () {
	browser.storage.local.get("lockList", function (result) {
		browser.tabs.query({
			active: true, lastFocusedWindow: true, windowType: "normal"
		}, function (currentTabs) {
			if (currentTabs.length == 1) {
				
				// If the tab id isn't in the lock list, it will return undefined or null
				if (isValidString(result.lockList[currentTabs[0].id]) === true) {
					updateIcon(true);
				}
				else {
					updateIcon(false);
				}
			}
			databaseLock = false;
		});
	});
}

// Helper function to remove a closed tab from the lock list
function doRemoveTab (tabId) {
	browser.storage.local.get("lockList", function (result) {
		var newLockList = result.lockList;
		newLockList[tabId] = null;
		browser.storage.local.set({"lockList": newLockList}, function () {
			navigationDatabase = newLockList;
			databaseLock = false;
		});
	});
}

// Helper function to toggle the Browser Action button on demand
function doButtonToggle (currentTab) {
	browser.storage.local.get("lockList", function (result) {
		var newLockList = result.lockList;
		
		// The tab was unlocked, so lock it
		// If it doesn't have an url, set it as UNKNOWN and update the unknown count
		// If it is a webpage, also insert the locking scripts for immediate locking
		if (isValidString(newLockList[currentTab.id]) === false) {
			if (("url" in currentTab) && (currentTab.url !== "")) {
				newLockList[currentTab.id] = currentTab.url;
				insertLockScript(currentTab.id, currentTab.url);
			}
			else {
				newLockList[currentTab.id] = noUrlString;
				unknownCount++;
			}
			
			// Update the icon directly since it's the active tab that's being toggled
			updateIcon(true);
		}
		
		// The tab was locked, so unlock it and update the icon
		// If it had a lock script inserted, insert the unlock script
		else {
			newLockList[currentTab.id] = null;
			if (("url" in currentTab) && (currentTab.url !== "")) {
				insertUnlockScript(currentTab.id, currentTab.url);
			}
			updateIcon(false);
		}
		
		// Save the changed database
		browser.storage.local.set({"lockList": newLockList}, function () {
			navigationDatabase = newLockList;
			databaseLock = false;
		});
	});
}

// Open links from the currently active page as new tabs
// Do an extra database check in case the removal of the scripts failed during an unlock
// Note that this will just block the link altogether, as per bug above
function doTabOpen (tabUrl) {
	browser.storage.local.get("lockList", function (result) {
		browser.tabs.query({
			active: true, lastFocusedWindow: true, windowType: "normal"
		}, function (currentTabs) {
			if (currentTabs.length == 1) {
				
				// If the tab id isn't in the lock list, it will return undefined or null
				if ((isValidString(result.lockList[currentTabs[0].id]) === true) &&
					(result.lockList[currentTabs[0].id] !== noUrlString) &&
					(blockOpen === false)) {
					browser.tabs.create({url: tabUrl, active: backgroundOpen});
				}
			}
			databaseLock = false;
		});
	});
}

// Upon a navigation, decide if it should be blocked
// But first, short-circuit non-tab navigations to prevent unnecessary delays
// Because this callback is synchronous, it can't call itself to wait for the database to be free
// It also can't asynchronously read the database from storage
// Thus, it will be the only function to read from the in-memory database
// It also has a special return value, so it can't delegate anything to asynchronous functions
function tryBlock (details) {
	
	// Check if tab currently being navigated has an entry in the lock list
	// If so, open a new tab to the prospective URL and cancel the navigation
	// Don't do it if the current and prospective URL match though (like for a refresh)
	// Finally, set the cancelled tab to go back to the page it was just on
	// This is necessary because the cancelled navigation leaves it on an error page
	if (details.tabId >= 0) {
		if ((isValidString(navigationDatabase[details.tabId]) === true) && 
			(navigationDatabase[details.tabId] !== noUrlString) && 
			(navigationDatabase[details.tabId] !== details.url)) {
			if (blockOpen === false) {
				browser.tabs.create({url: details.url, active: backgroundOpen});
			}
			setTimeout(restorePage, timeoutLength, details.tabId, navigationDatabase[details.tabId]);
			return {cancel: true};
		}
	}
	
	// If not, let the navigation continue
	return {};
}

// Helper function to restore the locked tab after a cancelled navigation
function restorePage (tabId, url) {
	browser.tabs.goBack(tabId);
}
