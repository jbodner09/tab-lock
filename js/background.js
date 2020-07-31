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
// [X]     Question:  Don't listen to other frames in case page has infinite load, ads, etc.?
// [ ]     Question:  Also necessary to listen to XHRs?
// [ ]   Stretch goal: create option to block navigation vs. opening all in new tabs 
// [ ]   Stretch goal: and associated option for activating those new tabs or not
// [ ]   Stretch goal: open new tab next to parent instead of at end of window
// [ ]   Stretch goal: temporary tooltip popup when clicking a link (with associated option)
// [ ]   Stretch goal: prevent cancelled navigation from throwing error page
// [X] Stretch goal: listen to tab pin/unpin events to automatically lock/unlock
// [X]   Restored pinned tabs should be locked unconditionally
// [ ]   Stretch goal: option to prevent auto lock/unlock upon pin/unpin
// [ ] Stretch goal: option to prevent closing a locked tab by setting an unload handler
// [ ]   Additional option to silently prevent vs. prompt (browser may prompt anyway)
// [ ] Stretch goal: changing favicon to add a lock icon
// [ ] Stretch goal: add a lock/unlock option to the context menu (only works on page...)
// [ ] Stretch goal: add a keyboard shortcut to lock/unlock the current tab
// [ ] Stretch goal: keep a history of closed tabs and re-lock them if they re-open
// [ ] Stretch goal: move to declarative web request if blocking behavior ever becomes deprecated

// Put this at the top of every js file to enable cross-browser interop
window.browser = window.browser || window.chrome;

// Protects the lock list against concurrent writes
var databaseLock = true;

// Special copy of the database only to be read by the navigation handler because it's synchronous
var navigationDatabase = [];

// Count of locked tabs without URLs, used when listening for tab updates
var unknownCount = 0;

// Constants
const noUrlString = "UNKNOWN";
const timeoutLength = 100;

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
function updateIconWrapper1 () {
	
	// Go through all tabs and automatically add any pinned tabs to lock list
	// The lock list is just an array, indexed by tab id
	// The value (if it exists) at that index is the url of the tab or UNKNOWN
	browser.tabs.query({}, function (currentTabs) {
		const lockList = [];
		for (tab of currentTabs) {
			if (tab.pinned === true) {
				
				// If the tab doesn't have an url, set it as UNKNOWN and update unknown count
				if (("url" in tab) && (tab.url !== "")) {
					lockList[tab.id] = tab.url;
				}
				else {
					lockList[tab.id] = noUrlString;
					unknownCount++;
				}
			}
		}
		
		// Once it's set, update the icon for the active tab
		browser.storage.local.set({"lockList": lockList}, function () {
			navigationDatabase = lockList;
			doActiveUpdate();
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

// Helper function to lock/unlock pinned tabs
function doUpdateCheck (tabId, tabInfo, currentTab) {
	browser.storage.local.get("lockList", function (result) {
		var newLockList = result.lockList;
		var changed = false;
		
		// It's a pin event, so add or remove the tab from the list as necessary
		if ("pinned" in tabInfo) {
			
			// The tab was pinned, so lock it
			// If it doesn't have an url, set it as UNKNOWN and update the unknown count
			if (tabInfo.pinned === true) {
				if (("url" in currentTab) && (currentTab.url !== "")) {
					newLockList[tabId] = currentTab.url;
				}
				else {
					newLockList[tabId] = noUrlString;
					unknownCount++;
				}
			}
			
			// The tab was unpinned, so unlock it
			else {
				newLockList[tabId] = null;
			}
			
			// Mark the database as dirty
			changed = true;
		}
		
		// If it's a change in url and the tab is done loading, check the unknown count
		// If necessary, update the lock entry if the url couldn't be set initially
		if (("url" in tabInfo) && ("status" in tabInfo)) {
			if ((tabInfo.status === "complete") && (currentTab.url !== "")) {
				if ((unknownCount > 0) && (newLockList[tabId] === noUrlString)) {
					newLockList[tabId] = currentTab.url;
					unknownCount--;
					changed = true;
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

// Callbacks to listen for various ways the active tab could change
browser.runtime.onStartup.addListener(updateIconWrapper1);
browser.runtime.onInstalled.addListener(updateIconWrapper1);
browser.tabs.onCreated.addListener(updateIconWrapper2);
browser.tabs.onActivated.addListener(updateIconWrapper3);
browser.tabs.onUpdated.addListener(updateIconWrapper4);
browser.tabs.onRemoved.addListener(updateLockListWrapper);
browser.windows.onFocusChanged.addListener(updateIconWrapper5);
browser.browserAction.onClicked.addListener(buttonToggleWrapper);

// Callback to do the navigation blocking
browser.webRequest.onBeforeRequest.addListener(tryBlock,
	{urls: ["<all_urls>"], types: ["main_frame"]}, ["blocking"]);

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

// Helper function to toggle the Browser Action button on demand
function doButtonToggle (currentTab) {
	browser.storage.local.get("lockList", function (result) {
		var newLockList = result.lockList;
		
		// The tab was unlocked, so lock it
		// If it doesn't have an url, set it as UNKNOWN and update the unknown count
		if (isValidString(newLockList[currentTab.id]) === false) {
			if (("url" in currentTab) && (currentTab.url !== "")) {
				newLockList[currentTab.id] = currentTab.url;
			}
			else {
				newLockList[currentTab.id] = noUrlString;
				unknownCount++;
			}
			
			// Update the icon directly since it's the active tab that's being toggled
			updateIcon(true);
		}
		
		// The tab was locked, so unlock it and update the icon
		else {
			newLockList[currentTab.id] = null;
			updateIcon(false);
		}
		
		// Save the changed database
		browser.storage.local.set({"lockList": newLockList}, function () {
			navigationDatabase = newLockList;
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
			browser.tabs.create({url: details.url});
			setTimeout(restorePage, timeoutLength, details.tabId);
			return {cancel: true};
		}
	}
	
	// If not, let the navigation continue
	return {};
}

// Helper function to restore the locked tab after a cancelled navigation
// The back-forward is to get around a quirk in the way the cancellation affects the back stack
function restorePage (tabId) {
	browser.tabs.goBack(tabId, function () {
		browser.tabs.goForward(tabId);
	});
}
