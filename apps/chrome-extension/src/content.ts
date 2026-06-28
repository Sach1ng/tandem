/** Content script: extracts lightweight context from the current page on request. */

interface PageContext {
  url: string;
  title: string;
  selection: string;
  excerpt: string;
  host: string;
}

function extractContext(): PageContext {
  const selection = String(window.getSelection?.() ?? "").trim();
  // Prefer the main/article region; fall back to body innerText.
  const main =
    document.querySelector("main, article, [role='main']") ?? document.body;
  const excerpt = (main as HTMLElement)?.innerText?.replace(/\s+\n/g, "\n").trim().slice(0, 2500) ?? "";
  return {
    url: location.href,
    title: document.title,
    selection: selection.slice(0, 2500),
    excerpt,
    host: location.host,
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "getContext") {
    sendResponse(extractContext());
  }
  return true; // keep the channel open for the async response
});
