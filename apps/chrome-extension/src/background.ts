/** Service worker: a right-click entry point that stores the selection for the popup. */

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "tandem-ask",
    title: "Ask Pip about “%s”",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "tandem-assign",
    title: "Assign “%s” to Pip",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId !== "tandem-ask" && info.menuItemId !== "tandem-assign") return;
  await chrome.storage.session.set({
    pendingSelection: info.selectionText ?? "",
    pendingAction: info.menuItemId === "tandem-assign" ? "assign" : "ask",
  });
  // Best-effort: openPopup is available in newer Chrome; ignore if unsupported.
  try {
    await chrome.action.openPopup();
  } catch {
    /* user can click the toolbar icon */
  }
});
