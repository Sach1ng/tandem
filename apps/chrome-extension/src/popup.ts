/** Popup: shows page context + contextual suggestions, asks the local bridge. */

const BRIDGE = "http://127.0.0.1:8765";

interface PageContext {
  url: string;
  title: string;
  selection: string;
  excerpt: string;
  host: string;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const statusEl = $("status");
const contextEl = $("context");
const suggestionsEl = $("suggestions");
const qEl = $<HTMLTextAreaElement>("q");
const askBtn = $<HTMLButtonElement>("ask");
const answerEl = $("answer");

let ctx: PageContext | null = null;

/** Page-aware prompt suggestions. */
function suggestionsFor(c: PageContext): string[] {
  const h = c.host;
  if (/atlassian|jira/.test(h)) return ["Summarize this ticket and list the action items", "What's blocking this and who owns it?"];
  if (/github\.com/.test(h)) return ["Explain what this PR/issue is about", "What should I review most carefully here?"];
  if (/docs\.google|notion\.so|confluence/.test(h)) return ["Review this doc and flag risks or gaps", "Turn this into a crisp exec summary"];
  if (/figma\.com/.test(h)) return ["What PM questions should I ask about this design?"];
  if (c.selection) return ["Explain this selection", "Draft a reply to this"];
  return ["Summarize this page", "What should I do about this?"];
}

async function loadContext(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { pendingSelection } = await chrome.storage.session.get("pendingSelection");
  await chrome.storage.session.remove("pendingSelection");

  try {
    if (!tab?.id) throw new Error("no tab");
    ctx = await chrome.tabs.sendMessage(tab.id, { type: "getContext" });
  } catch {
    contextEl.textContent = "Can't read this page (browser-internal or blocked page).";
  }
  if (pendingSelection && ctx) ctx.selection = pendingSelection;

  if (ctx) {
    contextEl.innerHTML = `<div class="ctx-title">${escapeHtml(ctx.title)}</div><div class="ctx-host">${escapeHtml(ctx.host)}</div>` +
      (ctx.selection ? `<div class="ctx-sel">“${escapeHtml(ctx.selection.slice(0, 160))}${ctx.selection.length > 160 ? "…" : ""}”</div>` : "");
    renderSuggestions(suggestionsFor(ctx));
  }
}

function renderSuggestions(list: string[]): void {
  suggestionsEl.innerHTML = "";
  for (const s of list) {
    const b = document.createElement("button");
    b.className = "suggestion";
    b.textContent = s;
    b.onclick = () => {
      qEl.value = s;
      void ask();
    };
    suggestionsEl.appendChild(b);
  }
}

async function checkBridge(): Promise<void> {
  try {
    const res = await fetch(`${BRIDGE}/health`);
    const data = await res.json();
    statusEl.textContent = data.cli ? `● bridge up · ${data.model}` : "● bridge up · cursor-agent missing";
    statusEl.className = data.cli ? "status ok" : "status warn";
  } catch {
    statusEl.textContent = "● bridge offline — run: npm run bridge -w @tandem/chrome-extension";
    statusEl.className = "status err";
  }
}

async function ask(): Promise<void> {
  const question = qEl.value.trim();
  if (!ctx && !question) return;
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
  } catch (err) {
    answerEl.textContent = `Couldn't reach the bridge. Start it with: npm run bridge -w @tandem/chrome-extension`;
  } finally {
    askBtn.disabled = false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

askBtn.onclick = () => void ask();
qEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void ask();
});

void checkBridge();
void loadContext();
