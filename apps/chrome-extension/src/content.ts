/** Content script: page context + ⌘B in-page Pip summon panel. */

const BRIDGE = "http://127.0.0.1:8765";

interface PageContext {
  url: string;
  title: string;
  selection: string;
  excerpt: string;
  host: string;
}

function extractContext(): PageContext {
  const selection = String(window.getSelection?.() ?? "").trim();
  const main =
    document.querySelector("main, article, [role='main']") ?? document.body;
  const excerpt =
    (main as HTMLElement)?.innerText?.replace(/\s+\n/g, "\n").trim().slice(0, 2500) ?? "";
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
  if (msg?.type === "togglePip") {
    togglePipPanel();
  }
  return true;
});

let pipHost: HTMLDivElement | null = null;
let pipOpen = false;
let pipKeyHandler: ((e: KeyboardEvent) => void) | null = null;

function closePipPanel(): void {
  if (pipKeyHandler) {
    document.removeEventListener("keydown", pipKeyHandler, true);
    pipKeyHandler = null;
  }
  pipHost?.remove();
  pipHost = null;
  pipOpen = false;
}

function togglePipPanel(): void {
  if (pipOpen) {
    closePipPanel();
    return;
  }
  openPipPanel();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function suggestionsFor(c: PageContext): string[] {
  const h = c.host;
  if (/atlassian|jira/.test(h)) return ["Summarize this ticket and list the action items", "What's blocking this and who owns it?"];
  if (/github\.com/.test(h)) return ["Explain what this PR/issue is about", "What should I review most carefully here?"];
  if (/docs\.google|notion\.so|confluence/.test(h)) return ["Review this doc and flag risks or gaps", "Turn this into a crisp exec summary"];
  if (/figma\.com/.test(h)) return ["What PM questions should I ask about this design?"];
  if (c.selection) return ["Explain this selection", "Draft a reply to this"];
  return ["Summarize this page", "What should I do about this?"];
}

function openPipPanel(): void {
  closePipPanel();
  const ctx = extractContext();

  pipHost = document.createElement("div");
  pipHost.id = "tandem-pip-host";
  pipHost.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none;";
  document.documentElement.appendChild(pipHost);

  const shadow = pipHost.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
<style>
  :host { all: initial; }
  .backdrop { pointer-events: auto; position: fixed; inset: 0; background: rgba(8,8,14,0.18); }
  .panel {
    pointer-events: auto;
    position: fixed;
    right: 20px;
    bottom: 20px;
    width: 380px;
    max-width: calc(100vw - 40px);
    background: #16161f;
    color: #e8e8f0;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 16px;
    box-shadow: 0 24px 80px rgba(0,0,0,0.45);
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 14px;
  }
  header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
  .brand { font-weight: 700; }
  .sub { font-size: 10px; color: #9a9ab0; text-transform: uppercase; letter-spacing: 0.04em; }
  .status { font-size: 11px; color: #9a9ab0; }
  .status.ok { color: #4ad295; }
  .status.err { color: #ff5c7c; }
  .ctx { background: rgba(255,255,255,0.06); border-radius: 9px; padding: 8px 10px; color: #9a9ab0; font-size: 12px; margin-bottom: 8px; }
  .ctx-title { color: #e8e8f0; font-weight: 600; }
  .suggestions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .chip {
    background: rgba(255,255,255,0.06);
    color: #e8e8f0;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    padding: 5px 9px;
    font-size: 11px;
    cursor: pointer;
  }
  .chip:hover { border-color: #c4a06a; }
  textarea {
    width: 100%;
    box-sizing: border-box;
    background: rgba(255,255,255,0.06);
    color: #e8e8f0;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 9px;
    padding: 8px 10px;
    font: 13px/1.35 inherit;
    resize: vertical;
    outline: none;
  }
  textarea:focus { border-color: #c4a06a; }
  .actions { display: flex; gap: 8px; margin-top: 8px; }
  button {
    flex: 1;
    border-radius: 9px;
    padding: 8px;
    font: 600 13px inherit;
    cursor: pointer;
  }
  .ask { background: #c4a06a; color: #fff; border: none; }
  .close {
    flex: 0;
    width: 28px;
    background: transparent;
    color: #9a9ab0;
    border: none;
    font-size: 18px;
    line-height: 1;
    padding: 0;
  }
  .answer { margin-top: 10px; white-space: pre-wrap; max-height: 220px; overflow: auto; }
  .hint { font-size: 11px; color: #9a9ab0; margin-top: 6px; }
</style>
<div class="backdrop" data-close></div>
<div class="panel" role="dialog" aria-label="Pip">
  <header>
    <div>
      <div class="brand">Pip</div>
      <div class="sub">by Tandem · ⌘B</div>
    </div>
    <button class="close" type="button" aria-label="Close">×</button>
  </header>
  <div class="ctx">
    <div class="ctx-title">${escapeHtml(ctx.title || "This page")}</div>
    <div>${escapeHtml(ctx.host)}</div>
    ${ctx.selection ? `<div style="margin-top:4px;font-style:italic">“${escapeHtml(ctx.selection.slice(0, 120))}${ctx.selection.length > 120 ? "…" : ""}”</div>` : ""}
  </div>
  <div class="suggestions"></div>
  <textarea rows="2" placeholder="Ask about this page… (⌘↵)"></textarea>
  <div class="actions">
    <button class="ask" type="button">Ask Pip</button>
  </div>
  <div class="status">● checking bridge…</div>
  <div class="answer"></div>
  <div class="hint">Esc to close · bridge must be running locally</div>
</div>`;

  const panel = shadow.querySelector(".panel") as HTMLDivElement;
  const backdrop = shadow.querySelector("[data-close]") as HTMLDivElement;
  const qEl = shadow.querySelector("textarea") as HTMLTextAreaElement;
  const askBtn = shadow.querySelector(".ask") as HTMLButtonElement;
  const closeBtn = shadow.querySelector(".close") as HTMLButtonElement;
  const statusEl = shadow.querySelector(".status") as HTMLDivElement;
  const answerEl = shadow.querySelector(".answer") as HTMLDivElement;
  const suggestionsEl = shadow.querySelector(".suggestions") as HTMLDivElement;

  for (const s of suggestionsFor(ctx)) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = s;
    chip.onclick = () => {
      qEl.value = s;
      void ask();
    };
    suggestionsEl.appendChild(chip);
  }

  pipKeyHandler = (e: KeyboardEvent) => {
    if (e.key === "Escape") closePipPanel();
    if (e.key === "Enter" && e.metaKey) void ask();
  };
  document.addEventListener("keydown", pipKeyHandler, true);

  backdrop.onclick = () => closePipPanel();
  closeBtn.onclick = () => closePipPanel();

  async function checkBridge(): Promise<void> {
    try {
      const res = await fetch(`${BRIDGE}/health`);
      const data = await res.json();
      statusEl.textContent = data.cli ? `● bridge up · ${data.model}` : "● bridge up · cursor-agent missing";
      statusEl.className = data.cli ? "status ok" : "status";
    } catch {
      statusEl.textContent = "● bridge offline — run: npm run bridge -w @tandem/chrome-extension";
      statusEl.className = "status err";
    }
  }

  async function ask(): Promise<void> {
    const question = qEl.value.trim();
    if (!question) return;
    askBtn.disabled = true;
    answerEl.textContent = "Thinking…";
    try {
      const res = await fetch(`${BRIDGE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ctx, question }),
      });
      const data = await res.json();
      answerEl.textContent = data.error ? `Error: ${data.error}` : data.text || "(no output)";
    } catch {
      answerEl.textContent = "Couldn't reach the bridge. Start it with: npm run bridge -w @tandem/chrome-extension";
    } finally {
      askBtn.disabled = false;
    }
  }

  askBtn.onclick = () => void ask();
  qEl.focus();
  void checkBridge();
  pipOpen = true;
}
