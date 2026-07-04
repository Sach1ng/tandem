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
const hintEl = $("hint");
const suggestionsEl = $("suggestions");
const qEl = $<HTMLTextAreaElement>("q");
const askBtn = $<HTMLButtonElement>("ask");
const assignBtn = $<HTMLButtonElement>("assign");
const assignedEl = $("assigned");
const answerEl = $("answer");

let ctx: PageContext | null = null;
let inFlight = false;

/** Canvas-rendered editors expose little real DOM text — nudge the user to select. */
function isCanvasDoc(host: string): boolean {
  return /docs\.google|slides\.google/.test(host);
}

/** Page-aware prompt suggestions. */
function suggestionsFor(c: PageContext): string[] {
  const h = c.host;
  if (/atlassian|jira/.test(h)) return ["Summarize this ticket and list the action items", "What's blocking this and who owns it?"];
  if (/github\.com/.test(h)) return ["Explain what this PR/issue is about", "What should I review most carefully here?"];
  if (/docs\.google|notion\.so|confluence/.test(h)) return ["Review this doc and flag risks or gaps", "Turn this into a crisp exec summary"];
  if (/figma\.com/.test(h)) return ["What PM questions should I ask about this design?"];
  if (c.selection) return ["Explain this selection", "Draft a reply to this", "Research this topic deeply and assign to Pip"];
  return ["Summarize this page", "What should I do about this?", "Deep research on this topic — outline, investigate, report"];
}

async function loadContext(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { pendingSelection, pendingAction } = await chrome.storage.session.get([
    "pendingSelection",
    "pendingAction",
  ]);
  await chrome.storage.session.remove(["pendingSelection", "pendingAction"]);

  try {
    if (!tab?.id) throw new Error("no tab");
    ctx = await chrome.tabs.sendMessage(tab.id, { type: "getContext" });
  } catch {
    contextEl.textContent = "No page context (internal/blocked page) — you can still type a task and Assign.";
  }
  if (pendingSelection && ctx) ctx.selection = pendingSelection;

  if (ctx) {
    contextEl.innerHTML = `<div class="ctx-title">${escapeHtml(ctx.title)}</div><div class="ctx-host">${escapeHtml(ctx.host)}</div>` +
      (ctx.selection ? `<div class="ctx-sel">“${escapeHtml(ctx.selection.slice(0, 160))}${ctx.selection.length > 160 ? "…" : ""}”</div>` : "");
    renderSuggestions(suggestionsFor(ctx));

    if (isCanvasDoc(ctx.host) && !ctx.selection) {
      hintEl.hidden = false;
      hintEl.textContent =
        "Tip: select the text you care about first — Google Docs/Slides expose limited page text otherwise.";
    }

    // Came in via the "Assign to Pip" context menu → run it straight away.
    if (pendingAction === "assign") void assign();
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

function setBusy(busy: boolean): void {
  inFlight = busy;
  askBtn.disabled = busy;
  assignBtn.disabled = busy;
}

const BRIDGE_DOWN = "Couldn't reach the bridge. Start it with: npm run bridge -w @tandem/chrome-extension";

async function ask(): Promise<void> {
  if (inFlight) return;
  const question = qEl.value.trim();
  if (!question && !ctx) {
    answerEl.textContent = "Type a question, or open Lens on a page you want to ask about.";
    return;
  }
  setBusy(true);
  assignedEl.hidden = true;
  answerEl.textContent = "Thinking…";
  try {
    const res = await fetch(`${BRIDGE}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(ctx ?? {}), question }),
    });
    const data = await res.json();
    answerEl.textContent = data.error ? `Error: ${data.error}` : data.text || "(no output)";
  } catch {
    answerEl.textContent = BRIDGE_DOWN;
  } finally {
    setBusy(false);
  }
}

async function assign(): Promise<void> {
  if (inFlight) return;
  const instruction = qEl.value.trim();
  if (!instruction && !ctx) {
    answerEl.textContent = "Type what you want Pip to do, then Assign — page context is optional.";
    return;
  }
  setBusy(true);
  assignedEl.hidden = true;
  answerEl.textContent = "Assigning to Pip… capturing the task and running it now (may take several minutes for research).";
  try {
    const res = await fetch(`${BRIDGE}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(ctx ?? {}),
        instruction: instruction || "Review this page and tell me what I should do about it.",
      }),
    });
    const data = await res.json();
    if (data.error) {
      answerEl.textContent = `Error: ${data.error}`;
    } else {
      assignedEl.hidden = false;
      assignedEl.textContent = `Added to Pip's board · ${data.taskId ?? "task"} · check Pip on your desktop`;
      answerEl.textContent = data.text || "(no output)";
    }
  } catch {
    answerEl.textContent = BRIDGE_DOWN;
  } finally {
    setBusy(false);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

askBtn.onclick = () => void ask();
assignBtn.onclick = () => void assign();
qEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void ask();
});

void checkBridge();
void loadContext();
