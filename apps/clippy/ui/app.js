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
  lensTask: document.getElementById("lens-task"),
  lensTaskTitle: document.getElementById("lens-task-title"),
  lensTaskSource: document.getElementById("lens-task-source"),
  lensTaskOutcome: document.getElementById("lens-task-outcome"),
  lensOpen: document.getElementById("lens-open"),
  lensDone: document.getElementById("lens-done"),
  lensDismiss: document.getElementById("lens-dismiss"),
};

let pendingNudge = null;
let mood = "rest";
let snipActive = false;
let pendingSnipPath = null;
let pendingSnipPreviewUrl = null;
let panelSizes = {
  minW: 390,
  minH: 73,
  maxW: 676,
  maxH: 520,
  defaultW: 520,
  compactH: 75,
  tallH: 148,
  snipH: 220,
};
let lastPanelW = 0;
let lastPanelH = 0;
let layoutRaf = null;
let layoutPaused = false;
let askInFlight = false;
let workingTimer = null;
let workingStartedAt = 0;
const PIP_TRANSITION_MS = 280;
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

function setWorking(active, label = "Working…") {
  if (active) {
    workingStartedAt = Date.now();
    document.body.classList.add("pip-working");
    setMood("thinking");
    if (els.snipStatusText) els.snipStatusText.textContent = label;
    if (workingTimer) clearInterval(workingTimer);
    workingTimer = setInterval(() => {
      const secs = Math.floor((Date.now() - workingStartedAt) / 1000);
      if (secs < 5) return;
      const base = label.replace(/…$/, "");
      if (els.snipProcessing && !els.snipProcessing.hidden) {
        els.snipStatusText.textContent = `${base}… ${secs}s`;
      }
      const replyEl = els.reply;
      if (replyEl && !replyEl.hidden && replyEl.classList.contains("thinking")) {
        replyEl.textContent = `${base}… ${secs}s`;
      }
    }, 1000);
    return;
  }
  document.body.classList.remove("pip-working");
  if (workingTimer) {
    clearInterval(workingTimer);
    workingTimer = null;
  }
}

/** Height for the expanded window — don't measure inside a clipped absolute layer. */
function desiredPanelHeight() {
  const compact = panelSizes.compactH ?? panelSizes.defaultH ?? 75;
  const tall = panelSizes.tallH ?? compact + 72;
  const snip = panelSizes.snipH ?? tall + 72;
  const maxH = panelSizes.maxH ?? 520;

  const hasSnip = !els.snipPanel.hidden;
  const hasReply = !els.reply.hidden;
  const hasHint = !els.nudgeHint.hidden;
  const hasLens = !els.lensTask.hidden;
  els.cardExtras.hidden = !hasSnip && !hasReply && !hasHint && !hasLens;

  if (!hasSnip && !hasReply && !hasHint && !hasLens) return compact;

  let h = hasSnip ? snip : tall;

  // Snip preview alone fits in snipH; stack reply/hint below it when analyzing or answering.
  if (hasSnip && hasReply) {
    const replyNeed = Math.max(44, Math.min(Math.ceil(els.reply.scrollHeight) + 20, 160));
    h += replyNeed;
  }
  if (hasHint) {
    h = Math.max(h, (hasSnip ? snip : compact) + Math.ceil(els.nudgeHint.scrollHeight) + 24);
  }
  if (!hasSnip && hasReply) {
    const replyNeed = Math.ceil(els.reply.scrollHeight) + 28;
    h = Math.max(tall, compact + replyNeed);
  }
  if (hasLens) {
    h = Math.max(h, compact + Math.ceil(els.lensTask.scrollHeight) + 24);
  }

  return Math.min(h, maxH);
}

function forceLayout() {
  lastPanelW = 0;
  lastPanelH = 0;
  syncLayout();
}

function syncLayout() {
  if (layoutPaused) return;
  if (layoutRaf) cancelAnimationFrame(layoutRaf);
  layoutRaf = requestAnimationFrame(() => {
    layoutRaf = null;
    if (!document.body.classList.contains("mode-expanded") || !w?.setPanelSize) return;

    const measured = desiredPanelHeight();
    const minH = panelSizes.minH ?? panelSizes.compactH ?? 75;
    const maxH = panelSizes.maxH ?? 520;
    const minW = panelSizes.minW ?? 390;
    const maxW = panelSizes.maxW ?? 676;
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
          // Refine once the window has room to lay out reply text.
          const refined = desiredPanelHeight();
          if (Math.abs(refined - lastPanelH) >= 4) syncLayout();
        });
      });
  });
}

function showReply(text, thinking = false) {
  els.reply.hidden = false;
  els.reply.classList.toggle("thinking", thinking);
  els.reply.textContent = text;
  if (thinking) forceLayout();
  else syncLayout();
}

function clearReply() {
  els.reply.hidden = true;
  els.reply.textContent = "";
  syncLayout();
}

// --- Live streaming of the assistant's answer -----------------------------
let streamingText = "";
let streamLayoutQueued = false;

/** Coalesce the ~30ms delta updates into one layout pass per animation frame. */
function syncLayoutSoon() {
  if (streamLayoutQueued) return;
  streamLayoutQueued = true;
  requestAnimationFrame(() => {
    streamLayoutQueued = false;
    syncLayout();
  });
}

function beginStream() {
  streamingText = "";
}

function appendStreamDelta(delta) {
  if (!askInFlight || !delta) return;
  // First token: drop the "Thinking…" placeholder and start showing the answer.
  if (els.reply.classList.contains("thinking")) {
    els.reply.classList.remove("thinking");
    els.reply.textContent = "";
    setWorking(true, "Answering…");
  }
  streamingText += delta;
  els.reply.hidden = false;
  els.reply.textContent = streamingText;
  setMood("thinking");
  syncLayoutSoon();
}

let lensTaskId = null;

function showLensTask(payload) {
  if (!payload) return;
  lensTaskId = payload.id ?? null;
  els.lensTaskTitle.textContent = payload.title || "New task from the web";
  if (payload.source) {
    els.lensTaskSource.hidden = false;
    els.lensTaskSource.textContent = payload.page || payload.source;
    els.lensTaskSource.href = payload.source;
  } else {
    els.lensTaskSource.hidden = true;
    els.lensTaskSource.removeAttribute("href");
  }
  els.lensTaskOutcome.textContent = payload.outcome || "(no output)";
  els.lensTask.hidden = false;
  clearReply();
  showHint(null);
  setMood("alert");
  syncLayout();
}

function hideLensTask() {
  lensTaskId = null;
  els.lensTask.hidden = true;
  els.lensTaskOutcome.textContent = "";
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

function setSnipContext(path, previewUrl) {
  pendingSnipPath = path || null;
  pendingSnipPreviewUrl = previewUrl || null;
  if (els.snipPanel && path) els.snipPanel.dataset.snipPath = path;
  else if (els.snipPanel) delete els.snipPanel.dataset.snipPath;
}

function getSnipPath() {
  return pendingSnipPath || els.snipPanel?.dataset?.snipPath || null;
}

function hasSnipPreview() {
  return !els.snipPanel.hidden && Boolean(els.snipPreview.getAttribute("src"));
}

function clearSnipContext() {
  pendingSnipPath = null;
  pendingSnipPreviewUrl = null;
  if (els.snipPanel) delete els.snipPanel.dataset.snipPath;
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
  clearSnipContext();
  document.body.classList.remove("snip-active", "snip-waiting", "snip-analyzing");
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
  setSnipContext(path, previewUrl);
  snipActive = false;
  document.body.classList.remove("snip-active");
  document.body.classList.add("snip-waiting", "snip-analyzing");
  els.snipPanel.hidden = false;
  setSnipPreview(path, previewUrl);
  setSnipProcessing(true, message);
  els.askInput.placeholder = message;
  showReply("Thinking…", true);
  setWorking(true, message);
  forceLayout();
}

function finishJobUi() {
  askInFlight = false;
  els.askInput.disabled = false;
  els.askInput.placeholder = "Ask Pip…";
  document.body.classList.remove("snip-analyzing");
  setSnipProcessing(false);
  setWorking(false);
  autoResizeAskInput();
  forceLayout();
}

function setSnipProcessing(active, message = "Analyzing…") {
  els.snipProcessing.hidden = !active;
  els.snipStatusText.textContent = message;
}

function handleSnipState(payload) {
  const { status, path, previewUrl, text } = payload;

  // Always accept a fresh capture — never drop path while preview is showing.
  if (status === "captured") {
    setSnipContext(path, previewUrl);
    snipActive = false;
    document.body.classList.remove("snip-active", "snip-analyzing");
    document.body.classList.add("snip-waiting");
    els.snipPanel.hidden = false;
    setSnipPreview(path, previewUrl);
    setSnipProcessing(false);
    els.askInput.placeholder = "Ask about this screenshot…";
    showHint("Screenshot ready — press Enter to ask.");
    setMood("awake");
    forceLayout();
    els.askInput.focus();
    return;
  }

  if (askInFlight && status === "loading") return;

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

  if (status === "loading") {
    setSnipContext(path, previewUrl);
    snipActive = false;
    document.body.classList.remove("snip-active");
    document.body.classList.add("snip-waiting", "snip-analyzing");
    els.snipPanel.hidden = false;
    setSnipPreview(path, previewUrl);
    setSnipProcessing(true, "Looking at your screen…");
    setWorking(true, "Looking at your screen…");
    els.askInput.placeholder = "Looking at your screen…";
    showReply("Thinking…", true);
    forceLayout();
    return;
  }

  if (status === "done") {
    setSnipProcessing(false);
    setWorking(false);
    clearSnipContext();
    els.snipPanel.hidden = true;
    snipActive = false;
    document.body.classList.remove("snip-active", "snip-waiting", "snip-analyzing");
    els.snipPreview.removeAttribute("src");
    showReply(text || "(no response)");
    setMood("awake");
    forceLayout();
    return;
  }

  if (status === "error") {
    setSnipProcessing(false);
    setWorking(false);
    clearSnipContext();
    els.snipPanel.hidden = true;
    snipActive = false;
    document.body.classList.remove("snip-active", "snip-waiting", "snip-analyzing");
    els.snipPreview.removeAttribute("src");
    showReply(text || "Snip failed");
    setMood("awake");
    forceLayout();
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
els.expanded?.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  ping();
  w?.showContextMenu();
});

document.getElementById("btn-snip")?.addEventListener("click", () => {
  if (!w) return;
  ping();
  void runSnip();
});

document.getElementById("btn-collapse")?.addEventListener("click", () => {
  ping();
  void w?.setExpanded(false);
});

els.lensOpen?.addEventListener("click", () => {
  ping();
  void w?.openTasksFile?.();
});
els.lensDone?.addEventListener("click", () => {
  ping();
  if (lensTaskId) void w?.toggleDone?.(lensTaskId);
  hideLensTask();
  setMood("awake");
});
els.lensDismiss?.addEventListener("click", () => {
  ping();
  hideLensTask();
  setMood("awake");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.body.classList.contains("mode-expanded")) {
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
  const snipPath = getSnipPath();
  const snipVisible = hasSnipPreview();

  if (!q && !snipPath && !snipVisible) return;
  if (snipVisible && !snipPath) {
    showReply("Screenshot path lost — please snip again.");
    return;
  }

  const useScreenshot = Boolean(snipPath);
  const question = q || "What's on my screen? If there's an error, tell me how to fix it.";
  const previewUrl =
    pendingSnipPreviewUrl ||
    (snipPath ? w.screenshotPreviewUrl?.(snipPath) : null);

  askInFlight = true;
  els.askInput.disabled = true;
  showHint(null);

  if (useScreenshot) {
    showSnipAnalyzing(snipPath, previewUrl, "Looking at your screenshot…");
  } else {
    setMood("thinking");
    setWorking(true, "Thinking…");
    showReply("Thinking…", true);
    forceLayout();
  }

  try {
    const { text } = useScreenshot
      ? await w.askScreenshot(snipPath, question)
      : await w.ask(question);
    if (useScreenshot) {
      handleSnipState({
        status: "done",
        path: snipPath,
        previewUrl,
        text,
      });
    } else {
      setWorking(false);
      showReply(text || "(no response)");
      setMood("awake");
    }
    els.askInput.value = "";
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (useScreenshot) {
      handleSnipState({ status: "error", path: snipPath, previewUrl, text: msg });
    } else {
      setWorking(false);
      showReply(msg);
      setMood("awake");
    }
  } finally {
    finishJobUi();
    els.askInput.focus();
  }
}

async function runSnip() {
  if (askInFlight || !w) return;
  try {
    await w.setExpanded(true);
    handleSnipState({ status: "selecting" });
    const result = await w.snip();
    const path = typeof result === "string" ? result : result?.path;
    const previewUrl =
      (typeof result === "object" && result?.previewUrl) ||
      (path ? w.screenshotPreviewUrl?.(path) : null);
    if (!path) {
      handleSnipState({ status: "cancelled" });
      return;
    }
    handleSnipState({ status: "captured", path, previewUrl });
    els.askInput.focus();
  } catch (err) {
    handleSnipState({
      status: "error",
      text: String(err?.message ?? err),
    });
  }
}

if (w) {
  w.onDock?.(({ edge }) => {
    const bottom = edge === "bottom";
    document.body.classList.toggle("dock-bottom", bottom);
    document.body.classList.toggle("dock-top", !bottom);
    syncLayout();
  });
  w.onExpanded((open) => {
    document.body.classList.add("pip-transitioning");
    document.body.classList.toggle("mode-expanded", open);
    document.body.classList.toggle("mode-collapsed", !open);
    els.collapsed.setAttribute("aria-hidden", open ? "true" : "false");
    els.expanded.setAttribute("aria-hidden", open ? "false" : "true");
    window.setTimeout(() => {
      document.body.classList.remove("pip-transitioning");
    }, PIP_TRANSITION_MS);
    if (open) {
      const path = getSnipPath();
      if (path) {
        els.snipPanel.hidden = false;
        document.body.classList.add("snip-waiting");
        setSnipPreview(path, pendingSnipPreviewUrl);
        forceLayout();
      }
      syncLayout();
      if (snipActive) return;
      if (pendingNudge) showHint(pendingNudge);
      setMood(pendingNudge ? "alert" : "awake");
      autoResizeAskInput();
      els.askInput.focus();
    } else {
      const path = getSnipPath();
      if (path) {
        setSnipContext(path, pendingSnipPreviewUrl);
        els.snipPanel.hidden = true;
        snipActive = false;
        document.body.classList.remove("snip-active", "snip-waiting", "snip-analyzing");
      } else {
        endSnipFlow();
      }
      clearReply();
      hideLensTask();
      showHint(null);
      setMood("rest");
    }
  });
  w.onSnipResult(handleSnipState);
  w.onLensTask?.(showLensTask);
  w.onSnipReady?.(({ path, previewUrl }) => {
    handleSnipState({ status: "captured", path, previewUrl });
  });
  w.onNudge?.((payload) => {
    pendingNudge = payload?.message ?? null;
    setMood("alert");
  });
  w.onNudgeClear?.(() => {
    pendingNudge = null;
    if (!snipActive && !askInFlight) {
      showHint(null);
      setMood("rest");
    }
  });
  w.onWorking?.(({ active, label }) => {
    if (active) setWorking(true, label || "Working…");
    else if (!askInFlight) setWorking(false);
  });
  w.onAskStart?.(() => {
    if (askInFlight) beginStream();
  });
  w.onAskDelta?.(({ delta }) => appendStreamDelta(delta));
  // Final authoritative text is applied when w.ask() resolves in runAsk().

  const shell = els.expanded?.querySelector(".card-shell");
  if (shell && "ResizeObserver" in window) {
    let resizeTimer = null;
    new ResizeObserver(() => {
      if (layoutPaused) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => syncLayout(), 80);
    }).observe(shell);
  }
}
