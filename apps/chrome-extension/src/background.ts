/** Service worker: context menus + ⌘B summon Pip on the active tab. */

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
  try {
    await chrome.action.openPopup();
  } catch {
    /* user can click the toolbar icon */
  }
});

async function summonPipOnActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id && tab.url && !tab.url.startsWith("chrome://") && !tab.url.startsWith("chrome-extension://")) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "togglePip" });
      return;
    } catch {
      /* content script not ready — fall through to popup */
    }
  }
  try {
    await chrome.action.openPopup();
  } catch {
    /* user can click the toolbar icon */
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "summon-pip") void summonPipOnActiveTab();
});
