// TODO:
// [ ] Browser action icon of a lock/unlock
// [ ]   It's state dependent for each tab, so when you switch tabs its state updates
// [ ]   If it shows a lock, clicking it becomes an unlock, and vice versa
// [ ]     Don't forget to do/undo all the locking code when this happens!
// [ ] Background list of all locked tabs and their URLs
// [ ]   dictionary keyed on URL+tab id, value is pinned status
// [ ]   Will be checked upon browser and extension startup to automatically lock any restored tabs
// [ ]     Permanently closed tabs will be removed from list at this time
// [ ]     Will also be removed if a tab/window is closed but browser remains open
// [ ] Content script on locked webpages to prevent navigation
// [ ]   Naive:  listen to all clicks to prevent <a> and js navigations, right-clicks, etc.
// [ ]   Likely:  listen to all navigations to also prevent navigation from external UI 
// [ ]     like address bar, back/forward buttons, opening a favorite, etc.
// [ ]     Question:  Don't listen to other frames in case page has infinite load, ads, etc.?
// [ ]   Stretch goal: create an option to block navigation vs. opening all in new tabs
// [ ]   Stretch goal: temporary tooltip popup when clicking a link (with associated option)
// [ ] Stretch goal: listen to tab pin/unpin events to automatically lock/unlock
// [ ]   Restored pinned tabs should be locked unconditionally
// [ ]   Stretch goal: option to prevent auto lock/unlock
// [ ] Stretch goal: option to prevent closing a locked tab by setting an unload handler
// [ ]   Additional option to silently prevent vs. prompt (browser may prompt anyway)
// [ ] Stretch goal: changing favicon to add a lock icon
// [ ] Stretch goal: add a lock/unlock option to the context menu (only works on page...)
// [ ] Stretch goal: add a keyboard shortcut to lock/unlock the current tab

// Put this at the top of every js file to enable cross-browser interop
window.browser = window.browser || window.chrome;

// Listen for clicks to the Browser Action button
browser.browserAction.onClicked.addListener(function (currentTab) {
	
	
	
	
});


