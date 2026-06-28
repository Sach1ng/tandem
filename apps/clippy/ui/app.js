/* Renderer — vanilla JS over window.taskWidget (preload bridge). No node access. */
const w = window.taskWidget;

const els = {
  collapsed: document.getElementById("collapsed"),
  expanded: document.getElementById("expanded"),
  badge: document.getElementById("badge"),
  sections: document.getElementById("sections"),
  triageCount: document.getElementById("triage-count"),
  groomPanel: document.getElementById("groom-panel"),
  captureInput: document.getElementById("capture-input"),
};

const SECTION_LABELS = {
  active: "Active",
  scheduled: "Scheduled",
  waiting: "Waiting",
  needs_triage: "Needs triage",
};
const SECTION_ORDER = ["active", "scheduled", "waiting", "needs_triage"];

/* ---------- Collapsed: click vs drag ---------- */
let down = null;
let dragging = false;
const DRAG_THRESHOLD = 4;

els.collapsed.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  down = { x: e.screenX, y: e.screenY };
  dragging = false;
});
window.addEventListener("mousemove", (e) => {
  if (!down) return;
  const dx = e.screenX - down.x;
  const dy = e.screenY - down.y;
  if (!dragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) dragging = true;
  if (dragging) {
    w.dragBy(dx, dy);
    down = { x: e.screenX, y: e.screenY };
  }
});
window.addEventListener("mouseup", () => {
  if (down && !dragging) w.toggleExpand();
  down = null;
  dragging = false;
});
els.collapsed.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  w.showContextMenu();
});

/* ---------- Header buttons ---------- */
document.getElementById("btn-close").onclick = () => w.setExpanded(false);
document.getElementById("btn-refresh").onclick = () => w.refresh();
document.getElementById("btn-triage").onclick = () => scrollToSection("needs_triage");
document.getElementById("btn-groom").onclick = runGroom;
document.getElementById("btn-snip").onclick = runSnip;

els.captureInput.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const text = els.captureInput.value.trim();
  if (!text) return;
  els.captureInput.value = "";
  els.captureInput.placeholder = "Capturing…";
  els.captureInput.disabled = true;
  try {
    await w.capture(text);
  } finally {
    els.captureInput.disabled = false;
    els.captureInput.placeholder = "Capture a task… (↵)";
    els.captureInput.focus();
  }
});

/* ---------- Resize grip ---------- */
let resizeStart = null;
document.getElementById("resize-grip").addEventListener("mousedown", (e) => {
  e.preventDefault();
  resizeStart = { x: e.screenX, y: e.screenY };
});
window.addEventListener("mousemove", (e) => {
  if (!resizeStart) return;
  w.resizeBy(e.screenX - resizeStart.x, e.screenY - resizeStart.y);
  resizeStart = { x: e.screenX, y: e.screenY };
});
window.addEventListener("mouseup", () => (resizeStart = null));

/* ---------- Render ---------- */
function render(tasks) {
  const open = tasks.openCount ?? 0;
  els.badge.hidden = open === 0;
  els.badge.textContent = String(open);
  els.triageCount.textContent = String(tasks.sectionCounts?.needs_triage ?? 0);

  els.sections.innerHTML = "";
  for (const key of SECTION_ORDER) {
    const items = (tasks.bySection?.[key] ?? []).filter((t) => !t.done);
    const wrap = document.createElement("section");
    wrap.dataset.section = key;
    const h = document.createElement("div");
    h.className = "section-title";
    h.textContent = `${SECTION_LABELS[key]} · ${items.length}`;
    wrap.appendChild(h);
    if (items.length === 0) {
      const e = document.createElement("div");
      e.className = "empty";
      e.textContent = "—";
      wrap.appendChild(e);
    } else {
      for (const t of items) wrap.appendChild(taskRow(t));
    }
    els.sections.appendChild(wrap);
  }
}

function taskRow(t) {
  const row = document.createElement("div");
  row.className = "task" + (t.done ? " done" : "");

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = t.done;
  cb.onchange = () => w.toggleDone(t.id);
  row.appendChild(cb);

  const body = document.createElement("div");
  body.className = "body";

  const title = document.createElement("div");
  title.className = "titletext";
  title.textContent = t.title || t.rawTitle;
  body.appendChild(title);

  const chips = document.createElement("div");
  chips.className = "chips";
  if (t.priority) chips.appendChild(chip(t.priority.toUpperCase(), t.priority));
  for (const tag of t.tags || []) {
    if (tag === t.priority) continue;
    chips.appendChild(chip("#" + tag));
  }
  const sel = document.createElement("select");
  sel.title = "Move to…";
  for (const key of SECTION_ORDER) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = SECTION_LABELS[key];
    if (key === t.section) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.onchange = () => w.moveTask(t.id, sel.value);
  chips.appendChild(sel);
  body.appendChild(chips);

  const metaPairs = Object.entries(t.meta || {});
  if (metaPairs.length) {
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = metaPairs.map(([k, v]) => `${k}: ${v}`).join(" · ");
    body.appendChild(meta);
  }

  row.appendChild(body);
  return row;
}

function chip(text, cls) {
  const c = document.createElement("span");
  c.className = "chip" + (cls ? " " + cls : "");
  c.textContent = text;
  return c;
}

function scrollToSection(key) {
  const el = els.sections.querySelector(`[data-section="${key}"]`);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- Snip & ask (screenshot) ---------- */
async function runSnip() {
  els.groomPanel.hidden = false;
  els.groomPanel.innerHTML = "<div class='summary'>Select a region of your screen…</div>";
  const path = await w.snip();
  if (!path) {
    els.groomPanel.hidden = true;
    return;
  }
  els.groomPanel.innerHTML = "<div class='summary'>Screenshot captured. What do you want to know?</div>";
  const input = document.createElement("input");
  input.className = "snip-input";
  input.type = "text";
  input.placeholder = "e.g. what's causing this error? (↵, or blank for a general read)";
  const answer = document.createElement("div");
  answer.className = "snip-answer";
  els.groomPanel.append(input, answer);
  input.focus();

  input.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    const q = input.value.trim();
    input.disabled = true;
    answer.textContent = "Looking at your screen…";
    try {
      const { text } = await w.askScreenshot(path, q);
      answer.textContent = text || "(no output)";
    } catch (err) {
      answer.textContent = `Failed: ${String(err?.message ?? err)}`;
    } finally {
      input.disabled = false;
    }
  });
}

/* ---------- Groom ---------- */
async function runGroom() {
  els.groomPanel.hidden = false;
  els.groomPanel.innerHTML = "<div class='summary'>Grooming…</div>";
  try {
    const { raw } = await w.groom();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      els.groomPanel.innerHTML = `<div class='summary'>Groom returned unparseable output:</div><div class='meta'>${escapeHtml(raw.slice(0, 400))}</div>`;
      return;
    }
    renderGroom(data);
  } catch (err) {
    els.groomPanel.innerHTML = `<div class='summary'>Groom failed: ${escapeHtml(String(err?.message ?? err))}</div>`;
  }
}

function renderGroom(d) {
  const parts = [];
  if (d.summary) parts.push(`<div class='summary'>${escapeHtml(d.summary)}</div>`);
  if (Array.isArray(d.active) && d.active.length) {
    parts.push("<h4>Focus today</h4>");
    parts.push("<ul>" + d.active.map((a) => `<li>${escapeHtml(a)}</li>`).join("") + "</ul>");
  }
  els.groomPanel.innerHTML = parts.join("");

  if (Array.isArray(d.suggested_moves) && d.suggested_moves.length) {
    const h = document.createElement("h4");
    h.textContent = "Suggested moves";
    els.groomPanel.appendChild(h);
    for (const mv of d.suggested_moves) {
      const div = document.createElement("div");
      div.className = "move";
      const span = document.createElement("span");
      span.textContent = `${mv.line_hint || ""} → ${SECTION_LABELS[mv.to_section] ?? mv.to_section}`;
      span.title = mv.reason || "";
      const btn = document.createElement("button");
      btn.className = "apply";
      btn.textContent = "Apply";
      btn.onclick = () => applyMove(mv);
      div.append(span, btn);
      els.groomPanel.appendChild(div);
    }
  }
  if (Array.isArray(d.stale) && d.stale.length) {
    const h = document.createElement("h4");
    h.textContent = "Possibly stale";
    els.groomPanel.appendChild(h);
    const ul = document.createElement("ul");
    ul.innerHTML = d.stale.map((s) => `<li>${escapeHtml(s.line_hint || "")} — ${escapeHtml(s.reason || "")}</li>`).join("");
    els.groomPanel.appendChild(ul);
  }
}

/* Match a groom move (by its line_hint text) to a current task id, then move it. */
let lastTasks = null;
function applyMove(mv) {
  if (!lastTasks || !mv.to_section) return;
  const hint = (mv.line_hint || "").toLowerCase();
  const match = (lastTasks.tasks || []).find(
    (t) => hint && (t.title.toLowerCase().includes(hint) || hint.includes(t.title.toLowerCase())),
  );
  if (match) w.moveTask(match.id, mv.to_section);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Wire events ---------- */
w.onUpdated((tasks) => {
  lastTasks = tasks;
  render(tasks);
});
w.onExpanded((v) => {
  els.collapsed.hidden = v;
  els.expanded.hidden = !v;
  if (v) els.captureInput.focus();
});
w.onShowTriage(() => scrollToSection("needs_triage"));
w.onSnip(() => runSnip());

(async () => {
  const tasks = await w.getTasks();
  lastTasks = tasks;
  render(tasks);
})();
