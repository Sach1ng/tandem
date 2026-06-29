/* Pip — horizontal assistant bar */
const w = window.taskWidget;
if (!w) console.error("Pip: taskWidget bridge missing — is preload loaded?");

const els = {
  collapsed: document.getElementById("collapsed"),
  expanded: document.getElementById("expanded"),
  askForm: document.getElementById("ask-form"),
  askInput: document.getElementById("ask-input"),
  reply: document.getElementById("reply"),
  nudgeHint: document.getElementById("nudge-hint"),
  cardExtras: document.getElementById("card-extras"),
  snipPanel: document.getElementById("snip-panel"),
  snipPreview: document.getElementById("snip-preview"),
  snipProcessing: document.getElementById("snip-processing"),
  snipStatusText: document.getElementById("snip-status-text"),
};

let pendingNudge = null;
let mood = "rest";
let snipActive = false;
let pendingSnipPath = null;
let panelSizes = {
  minW: 300,
  minH: 56,
  maxW: 520,
  maxH: 400,
  defaultW: 400,
  compactH: 58,
};
let lastPanelW = 0;
let lastPanelH = 0;
let layoutRaf = null;
let layoutPaused = false;
let askInFlight = false;
const DRAG_THRESHOLD = 6;

/** Drag with movement threshold so tap/click still works on the same surface. */
function bindDrag(el, { onTap } = {}) {
  if (!el || !w?.dragBy) return;

  let down = false;
  let dragging = false;
  let startScreenX = 0;
  let startScreenY = 0;
  let lastScreenX = 0;
  let lastScreenY = 0;
  let pointerId = null;

  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    down = true;
    dragging = false;
    pointerId = e.pointerId;
    startScreenX = lastScreenX = e.screenX;
    startScreenY = lastScreenY = e.screenY;
    el.setPointerCapture(pointerId);
  });

  el.addEventListener("pointermove", (e) => {
    if (!down || e.pointerId !== pointerId) return;
    const total = Math.hypot(e.screenX - startScreenX, e.screenY - startScreenY);
    if (!dragging) {
      if (total < DRAG_THRESHOLD) return;
      dragging = true;
      el.classList.add("is-dragging");
    }
    const dx = e.screenX - lastScreenX;
    const dy = e.screenY - lastScreenY;
    lastScreenX = e.screenX;
    lastScreenY = e.screenY;
    ping();
    void w.dragBy(dx, dy);
  });

  const finish = (e) => {
    if (!down || (e.pointerId != null && e.pointerId !== pointerId)) return;
    down = false;
    el.classList.remove("is-dragging");
    try {
      el.releasePointerCapture(pointerId);
    } catch {
      /* capture already released */
    }
    pointerId = null;
    if (!dragging && onTap) onTap(e);
    dragging = false;
  };

  el.addEventListener("pointerup", finish);
  el.addEventListener("pointercancel", finish);
}

void w.getConfig?.().then((cfg) => {
  if (cfg?.panel) panelSizes = { ...panelSizes, ...cfg.panel };
});

function setMood(next) {
  mood = next;
  document.body.classList.remove("mood-rest", "mood-awake", "mood-alert", "mood-thinking");
  document.body.classList.add(`mood-${next}`);
}

function ping() {
  void w.pingActivity?.();
}

function syncLayout() {
  if (layoutPaused) return;
  if (layoutRaf) cancelAnimationFrame(layoutRaf);
  layoutRaf = requestAnimationFrame(() => {
    layoutRaf = null;
    if (els.expanded.hidden || !w?.setPanelSize) return;

    const hasSnip = !els.snipPanel.hidden;
    const hasText = !els.reply.hidden || !els.nudgeHint.hidden;
    els.cardExtras.hidden = !hasSnip && !hasText;

    const shell = els.expanded.querySelector(".card-shell");
    if (!shell) return;

    const measured = Math.ceil(shell.scrollHeight);
    const minH = panelSizes.minH ?? panelSizes.compactH ?? 56;
    const maxH = panelSizes.maxH ?? 400;
    const minW = panelSizes.minW ?? 300;
    const maxW = panelSizes.maxW ?? 520;
    const h = Math.max(minH, Math.min(measured, maxH));
    const width = Math.max(minW, Math.min(panelSizes.defaultW, maxW));

    if (Math.abs(width - lastPanelW) < 2 && Math.abs(h - lastPanelH) < 2) return;
    lastPanelW = width;
    lastPanelH = h;

    layoutPaused = true;
    Promise.resolve(w.setPanelSize(width, h))
      .catch((err) => console.error("Pip: setPanelSize failed", err))
      .finally(() => {
        requestAnimationFrame(() => {
          layoutPaused = false;
        });
      });
  });
}

function showReply(text, thinking = false) {
  els.reply.hidden = false;
  els.reply.classList.toggle("thinking", thinking);
  els.reply.textContent = text;
  syncLayout();
}

function clearReply() {
  els.reply.hidden = true;
  els.reply.textContent = "";
  syncLayout();
}

function showHint(msg) {
  if (!msg) {
    els.nudgeHint.hidden = true;
    syncLayout();
    return;
  }
  els.nudgeHint.hidden = false;
  els.nudgeHint.textContent = msg;
  syncLayout();
}

function beginSnipFlow() {
  snipActive = true;
  document.body.classList.add("snip-active");
  els.snipPanel.hidden = false;
  showHint(null);
  setMood("thinking");
  syncLayout();
}

function endSnipFlow() {
  snipActive = false;
  pendingSnipPath = null;
  document.body.classList.remove("snip-active", "snip-waiting");
  els.snipPanel.hidden = true;
  els.snipPreview.removeAttribute("src");
  els.snipProcessing.hidden = true;
  syncLayout();
}

function setSnipPreview(path, previewUrl) {
  if (!path) {
    els.snipPreview.removeAttribute("src");
    els.snipPreview.style.width = "";
    els.snipPreview.style.height = "";
    syncLayout();
    return;
  }
  const url = previewUrl || w.screenshotPreviewUrl?.(path);
  if (!url) return;
  els.snipPreview.onload = () => {
    syncLayout();
  };
  els.snipPreview.src = url;
}

function showSnipAnalyzing(path, previewUrl, message = "Looking at your screenshot…") {
  pendingSnipPath = path;
  snipActive = true;
  document.body.classList.remove("snip-waiting");
  document.body.classList.add("snip-active");
  els.snipPanel.hidden = false;
  setSnipPreview(path, previewUrl);
  setSnipProcessing(true, message);
  clearReply();
  setMood("thinking");
  syncLayout();
}

function resetAskUi() {
  askInFlight = false;
  els.askInput.disabled = false;
  document.body.classList.remove("snip-active");
  setSnipProcessing(false);
  setMood("awake");
  autoResizeAskInput();
  syncLayout();
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

  if (status === "captured") {
    pendingSnipPath = path;
    snipActive = false;
    document.body.classList.remove("snip-active");
    document.body.classList.add("snip-waiting");
    els.snipPanel.hidden = false;
    setSnipPreview(path, previewUrl);
    setSnipProcessing(false);
    showHint("Screenshot ready — ask a question about it.");
    setMood("awake");
    syncLayout();
    return;
  }

  beginSnipFlow();

  if (status === "loading") {
    setSnipPreview(path, previewUrl);
    setSnipProcessing(true, "Looking at your screen…");
    clearReply();
    syncLayout();
    return;
  }

  if (status === "done") {
    setSnipProcessing(false);
    els.snipPanel.hidden = true;
    snipActive = false;
    pendingSnipPath = null;
    document.body.classList.remove("snip-active", "snip-waiting");
    showReply(text || "(no response)");
    setMood("awake");
    syncLayout();
    return;
  }

  if (status === "error") {
    setSnipProcessing(false);
    els.snipPanel.hidden = true;
    snipActive = false;
    pendingSnipPath = null;
    document.body.classList.remove("snip-active", "snip-waiting");
    showReply(text || "Snip failed");
    setMood("awake");
    syncLayout();
  }
}

if (w) {
  bindDrag(els.collapsed, {
    onTap: () => {
      ping();
      void w.toggleExpand();
    },
  });
  bindDrag(document.getElementById("btn-close"), {
    onTap: () => {
      ping();
      void w.setExpanded(false);
    },
  });
}

els.collapsed.addEventListener("mouseenter", () => {
  if (mood === "rest") setMood("awake");
});
els.collapsed.addEventListener("mouseleave", () => {
  if (mood === "awake") setMood("rest");
});
els.collapsed.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  ping();
  w?.showContextMenu();
});

document.getElementById("btn-snip")?.addEventListener("click", () => {
  if (!w) return;
  ping();
  void runSnip();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.collapsed.hidden) {
    ping();
    void w?.setExpanded(false);
  }
});

function autoResizeAskInput() {
  if (!els.askInput) return;
  els.askInput.style.height = "auto";
  const next = Math.min(72, Math.max(36, els.askInput.scrollHeight));
  els.askInput.style.height = `${next}px`;
  syncLayout();
}

els.askInput.addEventListener("focus", () => {
  if (!snipActive) setMood("awake");
});
els.askInput.addEventListener("input", () => {
  ping();
  autoResizeAskInput();
});
els.askInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    els.askForm.requestSubmit();
  }
});

els.askForm.addEventListener("submit", (e) => {
  e.preventDefault();
  ping();
  void runAsk();
});

async function runAsk() {
  if (askInFlight || !w) return;
  const q = els.askInput.value.trim();
  const snipPath = pendingSnipPath;
  if (!q && !snipPath) return;

  askInFlight = true;
  els.askInput.disabled = true;
  setMood("thinking");
  showHint(null);

  const previewUrl = snipPath ? w.screenshotPreviewUrl?.(snipPath) : null;
  if (snipPath) {
    showSnipAnalyzing(snipPath, previewUrl);
  } else {
    showReply("Thinking…", true);
  }

  try {
    const { text } = snipPath ? await w.askScreenshot(snipPath, q) : await w.ask(q);
    if (snipPath) {
      handleSnipState({
        status: "done",
        path: snipPath,
        previewUrl,
        text,
      });
    } else {
      showReply(text || "(no response)");
    }
    els.askInput.value = "";
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (snipPath) {
      handleSnipState({ status: "error", path: snipPath, previewUrl, text: msg });
    } else {
      showReply(msg);
    }
  } finally {
    resetAskUi();
    els.askInput.focus();
  }
}

async function runSnip() {
  if (askInFlight || !w) return;
  askInFlight = true;
  try {
    await w.setExpanded(true);
    handleSnipState({ status: "selecting" });
    const path = await w.snip();
    if (!path) {
      handleSnipState({ status: "cancelled" });
      return;
    }
    const previewUrl = w.screenshotPreviewUrl?.(path);
    showSnipAnalyzing(path, previewUrl);
    const { text } = await w.askScreenshot(path, "");
    handleSnipState({ status: "done", path, previewUrl, text });
  } catch (err) {
    handleSnipState({
      status: "error",
      text: String(err?.message ?? err),
    });
  } finally {
    resetAskUi();
  }
}

if (w) {
  w.onExpanded((open) => {
    document.body.classList.toggle("mode-expanded", open);
    document.body.classList.toggle("mode-collapsed", !open);
    els.collapsed.hidden = open;
    els.expanded.hidden = !open;
    if (open) {
      syncLayout();
      if (snipActive) return;
      if (pendingNudge) showHint(pendingNudge);
      setMood(pendingNudge ? "alert" : "awake");
      autoResizeAskInput();
      els.askInput.focus();
    } else {
      endSnipFlow();
      clearReply();
      showHint(null);
      setMood("rest");
    }
  });
  w.onSnipResult(handleSnipState);
  w.onSnipReady?.(({ path, previewUrl }) => {
    handleSnipState({ status: "captured", path, previewUrl });
  });
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

  const shell = els.expanded?.querySelector(".card-shell");
  if (shell && "ResizeObserver" in window) {
    let resizeTimer = null;
    new ResizeObserver(() => {
      if (layoutPaused || askInFlight) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => syncLayout(), 80);
    }).observe(shell);
  }
}
