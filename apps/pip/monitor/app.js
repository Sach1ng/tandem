/** Pip monitor dashboard — live + historical Pip requests. */
const els = {
  stats: document.getElementById("stats"),
  activeList: document.getElementById("active-list"),
  historyList: document.getElementById("history-list"),
  filter: document.getElementById("filter"),
  detail: document.getElementById("detail"),
  detailBody: document.getElementById("detail-body"),
  detailClose: document.getElementById("detail-close"),
};

let requests = [];
let selectedId = null;
let filterText = "";

const kindLabel = {
  ask: "Ask",
  screenshot: "Screenshot",
  capture: "Capture",
  groom: "Groom",
  snip: "Snip",
};

function fmtTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtDuration(ms) {
  if (!ms && ms !== 0) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function matchesFilter(req) {
  if (!filterText) return true;
  const hay = `${req.question ?? ""} ${req.response ?? ""} ${req.error ?? ""} ${req.kind}`.toLowerCase();
  return hay.includes(filterText);
}

function upsertRequest(req) {
  const i = requests.findIndex((r) => r.id === req.id);
  if (i >= 0) requests[i] = req;
  else requests.unshift(req);
  requests.sort((a, b) => b.startedAt - a.startedAt);
  render();
}

function renderStats() {
  const active = requests.filter((r) => r.status === "running").length;
  const done = requests.filter((r) => r.status === "done").length;
  const err = requests.filter((r) => r.status === "error").length;
  els.stats.innerHTML = `
    <span class="stat"><strong>${active}</strong> active</span>
    <span class="stat"><strong>${done}</strong> done</span>
    <span class="stat"><strong>${err}</strong> errors</span>
    <span class="stat"><strong>${requests.length}</strong> total</span>
  `;
}

function cardHtml(req, { compact = false } = {}) {
  const q = req.question?.trim() || "(no question)";
  const dur = req.durationMs ? ` · ${fmtDuration(req.durationMs)}` : "";
  const shot = req.screenshotPath
    ? `<div class="preview-line">📷 screenshot attached</div>`
    : "";
  return `
    <article class="card ${req.status}${selectedId === req.id ? " selected" : ""}${req.status === "running" ? " pulse" : ""}" data-id="${req.id}">
      <div class="card-top">
        <span class="badge ${req.status}">${kindLabel[req.kind] ?? req.kind} · ${req.source}</span>
        <span class="time">${fmtTime(req.startedAt)}${dur}</span>
      </div>
      <div class="question">${escapeHtml(q)}</div>
      ${compact ? "" : shot}
    </article>
  `;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderLists() {
  const active = requests.filter((r) => r.status === "running");
  const history = requests.filter((r) => r.status !== "running" && matchesFilter(r));

  els.activeList.innerHTML = active.length
    ? active.map((r) => cardHtml(r, { compact: true })).join("")
    : `<div class="empty">No active requests</div>`;

  els.historyList.innerHTML = history.length
    ? history.map((r) => cardHtml(r)).join("")
    : `<div class="empty">No past requests yet</div>`;
}

function renderDetail() {
  const req = requests.find((r) => r.id === selectedId);
  if (!req) {
    els.detail.hidden = true;
    return;
  }
  els.detail.hidden = false;
  const imgPath = req.previewPath || req.screenshotPath;
  const img = imgPath
    ? `<img class="detail-img" src="/api/screenshot?path=${encodeURIComponent(imgPath)}" alt="Screenshot" />`
    : "";
  els.detailBody.innerHTML = `
    <div class="detail-meta">
      <div><strong>${kindLabel[req.kind] ?? req.kind}</strong> · ${req.status} · ${req.source}</div>
      <div>Started ${fmtTime(req.startedAt)}${req.finishedAt ? ` · finished ${fmtTime(req.finishedAt)}` : ""}</div>
      <div>Duration ${fmtDuration(req.durationMs) || "—"}${req.chatId ? ` · chat ${req.chatId}` : ""}</div>
    </div>
    ${img ? `<div class="detail-block">${img}</div>` : ""}
    <div class="detail-block">
      <h3>Question</h3>
      <pre>${escapeHtml(req.question?.trim() || "(none)")}</pre>
    </div>
    <div class="detail-block">
      <h3>${req.status === "error" ? "Error" : "Response"}</h3>
      <pre>${escapeHtml(req.error || req.response || (req.status === "running" ? "In progress…" : "(empty)"))}</pre>
    </div>
  `;
}

function render() {
  renderStats();
  renderLists();
  renderDetail();
  bindCards();
}

function bindCards() {
  for (const el of document.querySelectorAll(".card[data-id]")) {
    el.onclick = () => {
      selectedId = el.dataset.id;
      render();
    };
  }
}

async function loadInitial() {
  const res = await fetch("/api/requests?limit=200");
  const data = await res.json();
  requests = data.requests ?? [];
  render();
}

function connectSse() {
  const es = new EventSource("/api/events");
  es.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "hello") {
        requests = msg.requests ?? requests;
        render();
      } else if (msg.type === "update" && msg.request) {
        upsertRequest(msg.request);
      }
    } catch {
      /* ignore malformed */
    }
  };
  es.onerror = () => {
    es.close();
    setTimeout(connectSse, 3000);
  };
}

els.filter?.addEventListener("input", (e) => {
  filterText = e.target.value.trim().toLowerCase();
  renderLists();
  bindCards();
});

els.detailClose?.addEventListener("click", () => {
  selectedId = null;
  render();
});

void loadInitial();
connectSse();
