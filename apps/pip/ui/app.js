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
  snipClear: document.getElementById("snip-clear"),
  lensTask: document.getElementById("lens-task"),
  lensTaskTitle: document.getElementById("lens-task-title"),
  lensTaskSource: document.getElementById("lens-task-source"),
  lensTaskOutcome: document.getElementById("lens-task-outcome"),
  lensOpen: document.getElementById("lens-open"),
  lensDone: document.getElementById("lens-done"),
  lensDismiss: document.getElementById("lens-dismiss"),
  modelPill: document.getElementById("model-pill"),
  modelName: document.getElementById("model-name"),
  btnMic: document.getElementById("btn-mic"),
  btnSpeak: document.getElementById("btn-speak"),
};

let pendingNudge = null;
let mood = "rest";
let snipActive = false;
let pendingSnipPath = null;
let pendingSnipPreviewUrl = null;
let panelSizes = {
  minW: 390,
  minH: 116,
  maxW: 676,
  maxH: 540,
  defaultW: 520,
  compactH: 118,
  tallH: 196,
  snipH: 280,
};
let lastPanelW = 0;
let lastPanelH = 0;
let layoutRaf = null;
let layoutPaused = false;
let askInFlight = false;
let workingTimer = null;
let workingStartedAt = 0;
const PIP_TRANSITION_MS = 280;
// A real click has a little jitter; keep this generous so a slightly-shaky click still opens Pip
// instead of being misread as a drag (which was the "have to click 3 times" bug).
const DRAG_THRESHOLD = 11;

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
    // Pressing Pip immediately wakes it and pulls it back from an idle peek, so the target is stable
    // under the cursor for the click that follows.
    ping();
    try {
      el.setPointerCapture(pointerId);
    } catch {
      /* capture not supported here — tap still works via pointerup */
    }
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
    const didDrag = dragging;
    if (!didDrag && onTap) onTap(e);
    dragging = false;
    if (didDrag) void w.snapDock?.(); // magnetic snap to the nearest edge on drop
  };

  el.addEventListener("pointerup", finish);
  el.addEventListener("pointercancel", finish);
}

let personality = { motion: true, gaze: true, greet: true, celebrate: true, sleepy: true, sleepyIdleSeconds: 45 };
let voiceCfg = { enabled: false, autoSend: true, speakReplies: false };

// ── Voice: mic capture in renderer + on-device Whisper WASM ──
let recognition = null;
let listening = false;
let mediaStream = null;
let mediaRecorder = null;
let audioChunks = [];
let whisperPipelinePromise = null;
let voiceAudioCtx = null;
let voiceAnalyser = null;
let voiceVadFrame = null;
let voiceMaxTimer = null;
let voiceFinishing = false;

const VAD_SPEECH_RMS = 0.016;
const VAD_SILENCE_MS = 1300;
const VAD_MAX_MS = 45000;
const VAD_START_TIMEOUT_MS = 9000;

function reflectVoiceOut(on) {
  document.body.classList.toggle("voice-on", !!on);
  if (els.btnSpeak) {
    els.btnSpeak.setAttribute("aria-pressed", on ? "true" : "false");
    els.btnSpeak.title = on ? "Speak replies aloud — on (Pip reads answers)" : "Speak replies aloud — off";
  }
}

async function loadWhisperPipeline() {
  if (!whisperPipelinePromise) {
    whisperPipelinePromise = import(
      "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm"
    ).then(({ pipeline }) => pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en"));
  }
  return whisperPipelinePromise;
}

async function blobToMono16k(blob) {
  const ctx = new AudioContext({ sampleRate: 16000 });
  try {
    const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
    const n = audio.length;
    const out = new Float32Array(n);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const data = audio.getChannelData(c);
      for (let i = 0; i < n; i++) out[i] += data[i] / audio.numberOfChannels;
    }
    return out;
  } finally {
    await ctx.close();
  }
}

async function transcribeBlob(blob) {
  const pipe = await loadWhisperPipeline();
  const audio = await blobToMono16k(blob);
  const out = await pipe(audio, { sampling_rate: 16000 });
  return String(out?.text ?? "").trim();
}

async function finishVoiceCapture() {
  if (voiceFinishing) return;
  voiceFinishing = true;
  clearVoiceVad();
  document.body.classList.remove("pip-listening");
  mediaStream?.getTracks().forEach((t) => t.stop());
  mediaStream = null;
  listening = false;
  const blob = new Blob(audioChunks, { type: mediaRecorder?.mimeType || "audio/webm" });
  mediaRecorder = null;
  audioChunks = [];
  if (blob.size < 800) {
    voiceFinishing = false;
    els.askInput.placeholder = "Ask Pip…";
    showTranscriptHint("Didn't catch that — try Talk again.");
    return;
  }
  els.askInput.placeholder = "Transcribing…";
  try {
    const text = await transcribeBlob(blob);
    els.askInput.value = text;
    autoResizeAskInput();
    els.askInput.placeholder = "Ask Pip…";
    if (voiceCfg.autoSend && text.trim()) els.askForm.requestSubmit();
    else els.askInput?.focus();
  } catch (err) {
    console.error("[voice] transcribe failed:", err);
    els.askInput.placeholder = "Ask Pip…";
    showTranscriptHint("Couldn't transcribe — check your connection for the first-run model download, or type instead.");
  } finally {
    voiceFinishing = false;
  }
}

function clearVoiceVad() {
  if (voiceVadFrame) cancelAnimationFrame(voiceVadFrame);
  voiceVadFrame = null;
  if (voiceMaxTimer) clearTimeout(voiceMaxTimer);
  voiceMaxTimer = null;
  voiceAnalyser = null;
  if (voiceAudioCtx) {
    void voiceAudioCtx.close().catch(() => {});
    voiceAudioCtx = null;
  }
}

/** Auto-stop when the user pauses after speaking (no second click). */
function startVoiceVad(stream) {
  clearVoiceVad();
  voiceAudioCtx = new AudioContext();
  const source = voiceAudioCtx.createMediaStreamSource(stream);
  voiceAnalyser = voiceAudioCtx.createAnalyser();
  voiceAnalyser.fftSize = 512;
  source.connect(voiceAnalyser);
  const samples = new Uint8Array(voiceAnalyser.fftSize);
  let heardSpeech = false;
  let silenceAt = 0;
  const startedAt = Date.now();

  voiceMaxTimer = setTimeout(() => {
    if (listening) stopVoiceCapture();
  }, VAD_MAX_MS);

  const tick = () => {
    if (!listening || !voiceAnalyser) return;
    voiceAnalyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      const v = (samples[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / samples.length);
    const now = Date.now();

    if (rms >= VAD_SPEECH_RMS) {
      heardSpeech = true;
      silenceAt = 0;
    } else if (heardSpeech) {
      if (!silenceAt) silenceAt = now;
      else if (now - silenceAt >= VAD_SILENCE_MS) {
        stopVoiceCapture();
        return;
      }
    } else if (now - startedAt >= VAD_START_TIMEOUT_MS) {
      stopVoiceCapture();
      return;
    }

    voiceVadFrame = requestAnimationFrame(tick);
  };
  voiceVadFrame = requestAnimationFrame(tick);
}

function stopVoiceCapture() {
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    return;
  }
  if (listening) void finishVoiceCapture();
}

async function beginVoiceInput() {
  if (listening) {
    stopVoiceCapture();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    showTranscriptHint("Voice input isn't available — type your question instead.");
    els.askInput?.focus();
    return;
  }

  const micOk = await w.ensureMicAccess?.().catch(() => true);
  if (micOk === false) {
    showTranscriptHint("Mic access is blocked. Enable it in System Settings → Privacy & Security → Microphone.");
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(mediaStream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size) audioChunks.push(e.data);
    };
    mediaRecorder.onstop = () => void finishVoiceCapture();
    mediaRecorder.start(200);
    listening = true;
    document.body.classList.add("pip-listening");
    setMood("awake");
    els.askInput.placeholder = "Listening…";
    startVoiceVad(mediaStream);
  } catch {
    showTranscriptHint("Mic access denied. Allow Microphone for Electron/Pip in System Settings.");
    els.askInput?.focus();
  }
}

function initVoice() {
  w.onSpeaking?.(({ speaking }) => document.body.classList.toggle("pip-speaking", !!speaking));
  w.onVoiceOut?.(({ enabled }) => reflectVoiceOut(enabled));
  void w.getVoiceState?.().then((s) => reflectVoiceOut(!!s?.speakReplies));
  els.btnSpeak?.addEventListener("click", () => {
    ping();
    void w.toggleVoiceOut?.().then((on) => reflectVoiceOut(on));
  });

  if (!navigator.mediaDevices?.getUserMedia || !els.btnMic) return;
  els.btnMic.hidden = false;
  els.btnMic.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    ping();
    void beginVoiceInput();
  });
}

function startWebListening(SR) {
  try {
    recognition = new SR();
  } catch {
    return;
  }
  recognition.lang = navigator.language || "en-US";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onresult = (e) => {
    let text = "";
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    els.askInput.value = text;
    autoResizeAskInput();
    const final = e.results[e.results.length - 1]?.isFinal;
    if (final && voiceCfg.autoSend && text.trim()) {
      stopListening();
      els.askForm.requestSubmit();
    }
  };
  recognition.onerror = (e) => {
    stopListening();
    if (e?.error === "not-allowed") {
      showTranscriptHint("Mic access is blocked. Enable it in System Settings → Privacy → Microphone.");
    } else if (e?.error === "network" || e?.error === "service-not-allowed") {
      // The speech service isn't reachable in this runtime — hide the mic so it doesn't mislead.
      showTranscriptHint("Voice input isn't available here — you can still type, and 🔊 reads replies aloud.");
      if (els.btnMic) els.btnMic.hidden = true;
    }
  };
  recognition.onend = () => stopListening();

  try {
    recognition.start();
    listening = true;
    document.body.classList.add("pip-listening");
    setMood("awake");
    els.askInput.placeholder = "Listening…";
  } catch {
    stopListening();
  }
}

function stopListening() {
  stopVoiceCapture();
  listening = false;
  document.body.classList.remove("pip-listening");
  if (els.askInput.placeholder === "Listening…") els.askInput.placeholder = "Ask Pip…";
  if (recognition) {
    try {
      recognition.stop();
    } catch {
      /* already stopped */
    }
    recognition = null;
  }
}

function showTranscriptHint(msg) {
  if (!els.nudgeHint) return;
  els.nudgeHint.textContent = msg;
  els.nudgeHint.hidden = false;
  syncLayout();
  setTimeout(() => {
    if (els.nudgeHint) els.nudgeHint.hidden = true;
    syncLayout();
  }, 4200);
}

void w.getConfig?.().then((cfg) => {
  if (cfg?.panel) panelSizes = { ...panelSizes, ...cfg.panel };
  if (cfg?.personality) personality = { ...personality, ...cfg.personality };
  if (cfg?.model) setModelLabel(cfg.model);
  if (cfg?.voice) voiceCfg = { ...voiceCfg, ...cfg.voice };
  if (!personality.motion) document.body.classList.add("reduced-motion");
  initPersonality();
  initVoice();
});

function setModelLabel(model) {
  if (!model) return;
  if (els.modelName) els.modelName.textContent = model;
  if (els.modelPill) els.modelPill.title = `Model: ${model} — click to switch (Pip runs on any model)`;
}

function setMood(next) {
  mood = next;
  document.body.classList.remove("mood-rest", "mood-awake", "mood-alert", "mood-thinking");
  document.body.classList.add(`mood-${next}`);
}

function ping() {
  void w.pingActivity?.();
  wakeFromSleep();
}

// --- Personality: greet, celebrate, sleepy, pop, gaze --------------------
let sleepyTimer = null;
let greeted = false;

function initPersonality() {
  if (personality.greet && !greeted) {
    greeted = true;
    // Small delay so the wave plays after the window has settled on screen.
    setTimeout(() => playBodyOnce("pip-greet", 1100), 350);
  }
  scheduleSleepy();
}

/** Restart a one-shot body animation class, then clean it up. */
function playBodyOnce(cls, ms) {
  if (!personality.motion) return;
  document.body.classList.remove(cls);
  void document.body.offsetWidth; // force reflow so the animation restarts
  document.body.classList.add(cls);
  setTimeout(() => document.body.classList.remove(cls), ms);
}

function celebrate() {
  if (!personality.celebrate) return;
  playBodyOnce("pip-celebrate", 720);
}

function playPop() {
  if (!personality.motion) return;
  document.querySelectorAll(".buddy").forEach((b) => {
    b.classList.remove("pip-pop");
    void b.offsetWidth;
    b.classList.add("pip-pop");
    setTimeout(() => b.classList.remove("pip-pop"), 360);
  });
}

function wakeFromSleep() {
  if (document.body.classList.contains("pip-sleepy")) {
    document.body.classList.remove("pip-sleepy");
  }
  scheduleSleepy();
}

function scheduleSleepy() {
  if (sleepyTimer) clearTimeout(sleepyTimer);
  if (!personality.sleepy) return;
  const ms = Math.max(10, personality.sleepyIdleSeconds || 45) * 1000;
  sleepyTimer = setTimeout(() => {
    if (!askInFlight && !snipActive && !document.body.classList.contains("mode-expanded")) {
      document.body.classList.add("pip-sleepy");
    }
  }, ms);
}

function applyGaze(dx, dy) {
  if (!personality.motion || !personality.gaze) return;
  if (document.body.classList.contains("pip-sleepy")) return;
  document.documentElement.style.setProperty("--gaze-x", String(dx));
  document.documentElement.style.setProperty("--gaze-y", String(dy));
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
/**
 * Real height of Pip's always-present chrome (the ask-input row + the action toolbar). We measure it
 * instead of trusting a fixed compactH so the toolbar can never get clipped when docked at the bottom
 * (where the window grows upward and a too-short height would hide the toolbar above the input).
 */
function chromeHeight() {
  const row = els.expanded?.querySelector(".card-row");
  const toolbar = els.expanded?.querySelector(".pip-toolbar");
  if (!row) return null;
  const rowH = row.getBoundingClientRect().height;
  const tbH = toolbar ? toolbar.getBoundingClientRect().height : 0;
  // If the toolbar exists but hasn't laid out yet (height ~0), don't trust a partial measurement —
  // returning null makes callers fall back to the safe compact height so we never size the window
  // too short to show the toolbar (the "expanded panel with no buttons" bug).
  if (toolbar && tbH < 16) return null;
  if (rowH < 16) return null;
  const total = Math.ceil(rowH + tbH) + 4; // +4 safety so nothing clips at the edge
  return total > 8 ? total : null;
}

function desiredPanelHeight() {
  const measured = chromeHeight();
  const compact = Math.max(measured ?? panelSizes.compactH ?? panelSizes.defaultH ?? 75, panelSizes.minH ?? 0);
  const tall = Math.max(panelSizes.tallH ?? 0, compact + 76);
  const snip = Math.max(panelSizes.snipH ?? 0, tall + 84);
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
    celebrate();
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
      if (document.body.classList.contains("pip-speaking")) {
        void w.stopSpeaking?.(); // tap Pip to hush mid-reply
        return;
      }
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
  ping(); // also un-peeks Pip if it had slid to the edge
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

els.snipClear?.addEventListener("click", () => {
  ping();
  endSnipFlow();
  els.askInput.placeholder = "Ask Pip anything…";
});

els.modelPill?.addEventListener("click", () => {
  ping();
  void w?.openModelMenu?.();
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
  if (listening) stopListening();

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
      celebrate();
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
      wakeFromSleep();
      playPop();
      const path = getSnipPath();
      if (path) {
        els.snipPanel.hidden = false;
        document.body.classList.add("snip-waiting");
        setSnipPreview(path, pendingSnipPreviewUrl);
      }
      // Always re-measure from scratch on open so the toolbar-inclusive height is applied every time,
      // never blocked by a stale cached size from a previous expand.
      forceLayout();
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
    wakeFromSleep();
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
  w.onGaze?.(({ dx, dy }) => applyGaze(dx, dy));
  w.onModel?.(({ model }) => setModelLabel(model));
  w.onSummon?.((payload) => {
    wakeFromSleep();
    playBodyOnce("pip-warp", 340);
    setMood("awake");
    if (payload?.voice) beginVoiceInput();
    else els.askInput?.focus();
  });
  w.onPeek?.(({ peeking }) => {
    document.body.classList.toggle("pip-peeking", !!peeking);
    if (peeking) setMood("rest");
  });

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
