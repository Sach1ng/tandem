/** Service worker: a right-click entry point that stores the selection for the popup. */

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "tandem-ask",
    title: "Ask Tandem about “%s”",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "tandem-ask") return;
  await chrome.storage.session.set({ pendingSelection: info.selectionText ?? "" });
  // Best-effort: openPopup is available in newer Chrome; ignore if unsupported.
  try {
    await chrome.action.openPopup();
  } catch {
    /* user can click the toolbar icon */
  }
});
