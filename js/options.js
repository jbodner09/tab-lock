// Put this at the top of every js file to enable cross-browser interop
window.browser = window.browser || window.chrome;

// When the options page loads, get the state of the toggles
document.addEventListener("DOMContentLoaded", function (event) {
browser.storage.local.get(["lockIcon", "blockOpen", "backgroundOpen", "autoLock"], 
function (result) {
	
	// Load the lock icon toggle state when the page opens (defaults to on)
	if (result && result.lockIcon) {
		if (result.lockIcon == "true") {
			changeLockIconToggle("true");
		}
	}
	else {
		changeLockIconToggle("true");
		browser.storage.local.set({"lockIcon": "true"});
	}
	
	// Load the block open toggle state when the page opens
	if (result && result.blockOpen) {
		if (result.blockOpen == "true") {
			changeBlockOpenToggle("true");
		}
	}
	else {
		browser.storage.local.set({"blockOpen": "false"});
	}
	
	// Load the background open toggle state when the page opens
	if (result && result.backgroundOpen) {
		if (result.backgroundOpen == "true") {
			changeBackgroundOpenToggle("true");
		}
	}
	else {
		browser.storage.local.set({"backgroundOpen": "false"});
	}
	
	// Load the auto lock toggle state when the page opens
	if (result && result.autoLock) {
		if (result.autoLock == "true") {
			changeAutoLockToggle("true");
		}
	}
	else {
		browser.storage.local.set({"autoLock": "false"});
	}
	
	// Changes lock icon toggle state
	function changeLockIconToggle (checked) {
		var lockIconToggle = document.getElementById("lockIconToggle");
		lockIconToggle.dataset["checked"] = checked;
		lockIconToggle.children[0].dataset["checked"] = checked;
		lockIconToggle.children[1].dataset["checked"] = checked;
	}
	
	// Changes block open toggle state
	function changeBlockOpenToggle (checked) {
		var blockOpenToggle = document.getElementById("blockOpenToggle");
		blockOpenToggle.dataset["checked"] = checked;
		blockOpenToggle.children[0].dataset["checked"] = checked;
		blockOpenToggle.children[1].dataset["checked"] = checked;
	}
	
	// Changes background open toggle state
	function changeBackgroundOpenToggle (checked) {
		var backgroundOpenToggle = document.getElementById("backgroundOpenToggle");
		backgroundOpenToggle.dataset["checked"] = checked;
		backgroundOpenToggle.children[0].dataset["checked"] = checked;
		backgroundOpenToggle.children[1].dataset["checked"] = checked;
	}
	
	// Changes auto lock toggle state
	function changeAutoLockToggle (checked) {
		var autoLockToggle = document.getElementById("autoLockToggle");
		autoLockToggle.dataset["checked"] = checked;
		autoLockToggle.children[0].dataset["checked"] = checked;
		autoLockToggle.children[1].dataset["checked"] = checked;
	}
	
	// Add the click handler for when the lock icon toggle is clicked
	document.getElementById("lockIconToggle").addEventListener("click", function (e) {
		if (document.getElementById("lockIconToggle").dataset["checked"] == "true") {
			changeLockIconToggle("false");
			browser.storage.local.set({"lockIcon": "false"});
			browser.runtime.sendMessage({lockIcon: "false"});
		}
		else {
			changeLockIconToggle("true");
			browser.storage.local.set({"lockIcon": "true"});
			browser.runtime.sendMessage({lockIcon: "true"});
		}
	});
	
	// Add the click handler for when the block open toggle is clicked
	document.getElementById("blockOpenToggle").addEventListener("click", function (e) {
		if (document.getElementById("blockOpenToggle").dataset["checked"] == "true") {
			changeBlockOpenToggle("false");
			browser.storage.local.set({"blockOpen": "false"});
			browser.runtime.sendMessage({blockOpen: "false"});
		}
		else {
			changeBlockOpenToggle("true");
			browser.storage.local.set({"blockOpen": "true"});
			browser.runtime.sendMessage({blockOpen: "true"});
		}
	});
	
	// Add the click handler for when the background open toggle is clicked
	document.getElementById("backgroundOpenToggle").addEventListener("click", function (e) {
		if (document.getElementById("backgroundOpenToggle").dataset["checked"] == "true") {
			changeBackgroundOpenToggle("false");
			browser.storage.local.set({"backgroundOpen": "false"});
			browser.runtime.sendMessage({backgroundOpen: "false"});
		}
		else {
			changeBackgroundOpenToggle("true");
			browser.storage.local.set({"backgroundOpen": "true"});
			browser.runtime.sendMessage({backgroundOpen: "true"});
		}
	});
	
	// Add the click handler for when the auto lock toggle is clicked
	document.getElementById("autoLockToggle").addEventListener("click", function (e) {
		if (document.getElementById("autoLockToggle").dataset["checked"] == "true") {
			changeAutoLockToggle("false");
			browser.storage.local.set({"autoLock": "false"});
			browser.runtime.sendMessage({autoLock: "false"});
		}
		else {
			changeAutoLockToggle("true");
			browser.storage.local.set({"autoLock": "true"});
			browser.runtime.sendMessage({autoLock: "true"});
		}
	});
});});
