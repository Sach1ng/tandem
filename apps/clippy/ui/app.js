/* Tandem — minimal assistant with expressive buddy moods */
const w = window.taskWidget;

const els = {
  collapsed: document.getElementById("collapsed"),
  expanded: document.getElementById("expanded"),
  askForm: document.getElementById("ask-form"),
  askInput: document.getElementById("ask-input"),
  reply: document.getElementById("reply"),
  nudgeHint: document.getElementById("nudge-hint"),
  snipPanel: document.getElementById("snip-panel"),
  snipPreview: document.getElementById("snip-preview"),
  snipProcessing: document.getElementById("snip-processing"),
  snipStatusText: document.getElementById("snip-status-text"),
};

let pendingNudge = null;
let mood = "rest";
let snipActive = false;

function setMood(next) {
  mood = next;
  document.body.classList.remove("mood-rest", "mood-awake", "mood-alert", "mood-thinking");
  document.body.classList.add(`mood-${next}`);
}

function ping() {
  void w.pingActivity?.();
}

function showReply(text, thinking = false) {
  els.reply.hidden = false;
  els.reply.classList.toggle("thinking", thinking);
  els.reply.textContent = text;
}

function clearReply() {
  els.reply.hidden = true;
  els.reply.textContent = "";
}

function showHint(msg) {
  if (!msg) {
    els.nudgeHint.hidden = true;
    return;
  }
  els.nudgeHint.hidden = false;
  els.nudgeHint.textContent = msg;
}

function beginSnipFlow() {
  snipActive = true;
  document.body.classList.add("snip-active");
  els.snipPanel.hidden = false;
  showHint(null);
  setMood("thinking");
}

function endSnipFlow() {
  snipActive = false;
  document.body.classList.remove("snip-active");
  els.snipPanel.hidden = true;
  els.snipPreview.removeAttribute("src");
  els.snipProcessing.hidden = true;
}

function setSnipPreview(path, previewUrl) {
  if (!path) {
    els.snipPreview.removeAttribute("src");
    return;
  }
  const url = previewUrl || w.screenshotPreviewUrl?.(path);
  if (url) els.snipPreview.src = url;
}

function setSnipProcessing(active, message = "Analyzing…") {
  els.snipProcessing.hidden = !active;
  els.snipStatusText.textContent = message;
}

function handleSnipState(payload) {
  const { status, path, previewUrl, text } = payload;

  if (status === "selecting") {
    beginSnipFlow();
    setSnipProcessing(true, "Select a region on your screen…");
    clearReply();
    return;
  }

  if (status === "cancelled") {
    endSnipFlow();
    clearReply();
    setMood("awake");
    return;
  }

  beginSnipFlow();

  if (status === "captured" || status === "loading") {
    setSnipPreview(path, previewUrl);
    setSnipProcessing(
      true,
      status === "loading" ? "Looking at your screen…" : "Got it — analyzing…",
    );
    clearReply();
    return;
  }

  if (status === "done") {
    setSnipPreview(path, previewUrl);
    setSnipProcessing(false);
    showReply(text || "(no response)");
    setMood("awake");
    snipActive = false;
    document.body.classList.remove("snip-active");
    return;
  }

  if (status === "error") {
    setSnipPreview(path, previewUrl);
    setSnipProcessing(false);
    showReply(text || "Snip failed");
    setMood("awake");
    snipActive = false;
    document.body.classList.remove("snip-active");
  }
}

/* Click orb to open — anchored top-center, no drag */
els.collapsed.addEventListener("click", () => {
  ping();
  w.toggleExpand();
});
els.collapsed.addEventListener("mouseenter", () => {
  if (mood === "rest") setMood("awake");
});
els.collapsed.addEventListener("mouseleave", () => {
  if (mood === "awake") setMood("rest");
});
els.collapsed.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  ping();
  w.showContextMenu();
});

document.getElementById("btn-close").onclick = () => {
  ping();
  w.setExpanded(false);
};
document.getElementById("btn-snip").onclick = () => {
  ping();
  void runSnip();
};

els.askInput.addEventListener("focus", () => {
  if (!snipActive) setMood("awake");
});
els.askInput.addEventListener("input", () => ping());

els.askForm.addEventListener("submit", (e) => {
  e.preventDefault();
  ping();
  void runAsk();
});

async function runAsk() {
  const q = els.askInput.value.trim();
  if (!q) return;
  els.askInput.disabled = true;
  setMood("thinking");
  showHint(null);
  showReply("Thinking…", true);
  try {
    const { text } = await w.ask(q);
    showReply(text || "(no response)");
    els.askInput.value = "";
  } catch (err) {
    showReply(String(err?.message ?? err));
  } finally {
    els.askInput.disabled = false;
    setMood("awake");
    els.askInput.focus();
  }
}

async function runSnip() {
  await w.setExpanded(true);
  handleSnipState({ status: "selecting" });
  const path = await w.snip();
  if (!path) {
    handleSnipState({ status: "cancelled" });
    return;
  }
  const previewUrl = w.screenshotPreviewUrl?.(path);
  handleSnipState({ status: "loading", path, previewUrl });
  try {
    const { text } = await w.askScreenshot(path, "");
    handleSnipState({ status: "done", path, previewUrl, text });
  } catch (err) {
    handleSnipState({
      status: "error",
      path,
      previewUrl,
      text: String(err?.message ?? err),
    });
  }
}

w.onExpanded((open) => {
  document.body.classList.toggle("mode-expanded", open);
  document.body.classList.toggle("mode-collapsed", !open);
  els.collapsed.hidden = open;
  els.expanded.hidden = !open;
  if (open) {
    if (snipActive) return;
    if (pendingNudge) showHint(pendingNudge);
    setMood(pendingNudge ? "alert" : "awake");
    els.askInput.focus();
  } else {
    endSnipFlow();
    clearReply();
    showHint(null);
    setMood("rest");
  }
});
w.onSnipResult(handleSnipState);
w.onNudge?.((payload) => {
  pendingNudge = payload?.message ?? null;
  setMood("alert");
});
w.onNudgeClear?.(() => {
  pendingNudge = null;
  if (!snipActive) {
    showHint(null);
    setMood("rest");
  }
});
