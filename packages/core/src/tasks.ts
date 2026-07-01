import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

/**
 * Deterministic, line-faithful writes to a Tandem `tasks.md` board, usable from any surface
 * (Pip's web bridge, the CLI, tests) without importing Electron. Mirrors the section contract and
 * line-id scheme of Pip's parser/task-file so Pip's watcher and parser stay in sync.
 */

const TASK_RE = /^-\s+\[([ xX])\]/;
const INDENT_RE = /^\s+\S/;

/** Header text → is it the Needs triage / inbox bucket? (parentheticals stripped, mirror of parser) */
function isNeedsTriageHeader(line: string): boolean {
  if (!line.startsWith("## ")) return false;
  const h = line.slice(3).replace(/\(.*?\)/g, "").trim().toLowerCase();
  return h.includes("needs triage") || h.includes("inbox");
}

/** A `## ` header or a `---` rule ends the current section. */
function isSectionBoundary(line: string): boolean {
  return line.startsWith("## ") || line.trim() === "---";
}

function lineIndexFromId(id: string): number {
  return Number(id.replace(/^L/, "")) - 1;
}

export interface WebTaskMeta {
  title: string;
  project?: string;
  priority?: "p0" | "p1" | "p2";
  source?: string; // URL
  page?: string; // page/document title
  context?: string; // excerpt or selection
  nextAction?: string; // the user's instruction
  via?: string; // human-readable provenance label, e.g. "Pip · web"
}

/** Stable machine tag slug for web-assigned tasks (independent of the display label in `via`). */
const WEB_TASK_TAG = "from/web";

const CONTEXT_CAP = 500;

/** Collapse whitespace and cap a value so multi-line excerpts stay on one sub-bullet. */
function oneLine(s: string, cap = CONTEXT_CAP): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > cap ? `${flat.slice(0, cap - 1)}…` : flat;
}

/**
 * Append one task to the `## Needs triage` section, line-faithfully (no reflow of the rest of the
 * file). Creates the section at EOF if it doesn't exist. Returns the new task's stable id + 1-based
 * line number so callers can later attach sub-bullets (e.g. an Outcome) to it.
 */
export function appendWebTask(file: string, meta: WebTaskMeta): { id: string; line: number } {
  const raw = existsSync(file) ? readFileSync(file, "utf8") : "# My Tasks\n\n## Needs triage\n";
  const lines = raw.split("\n");

  const tags: string[] = [];
  if (meta.project) tags.push(`#project/${meta.project}`);
  tags.push(`#${WEB_TASK_TAG}`);
  if (meta.priority) tags.push(`#${meta.priority}`);

  const block: string[] = [`- [ ] ${meta.title} ${tags.join(" ")}`.trimEnd()];
  if (meta.source) block.push(`  - Source: ${oneLine(meta.source, 500)}`);
  if (meta.page) block.push(`  - Page: ${oneLine(meta.page, 200)}`);
  if (meta.context) block.push(`  - Context: ${oneLine(meta.context)}`);
  if (meta.nextAction) block.push(`  - Next action: ${oneLine(meta.nextAction, 300)}`);
  block.push(`  - Assigned: ${new Date().toISOString().slice(0, 10)} via ${meta.via ?? "Pip · web"}`);

  // Locate the Needs triage header.
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (isNeedsTriageHeader(lines[i]!)) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) {
    // No section — append it (plus a separating blank line if needed).
    if (lines.length && lines[lines.length - 1]!.trim() !== "") lines.push("");
    lines.push("## Needs triage", ...block);
    writeFileSync(file, lines.join("\n"));
    const taskLine = lines.length - block.length + 1; // 1-based line of the checkbox
    return { id: `L${taskLine}`, line: taskLine };
  }

  // Insert point = just before the next section boundary / EOF, trimming trailing blanks.
  let insertAt = lines.length;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    if (isSectionBoundary(lines[i]!)) {
      insertAt = i;
      break;
    }
  }
  while (insertAt - 1 > headerIdx && lines[insertAt - 1]!.trim() === "") insertAt--;

  lines.splice(insertAt, 0, ...block);
  writeFileSync(file, lines.join("\n"));
  return { id: `L${insertAt + 1}`, line: insertAt + 1 };
}

/**
 * Append an indented sub-bullet (e.g. `- Outcome: …`) to the task identified by `id`, placing it at
 * the end of that task's existing sub-bullet block. No-op if the id doesn't point at a task line.
 * Returns true on success.
 */
export function appendTaskSubBullet(
  file: string,
  id: string,
  label: string,
  text: string,
  cap = 2000,
): boolean {
  if (!existsSync(file)) return false;
  const lines = readFileSync(file, "utf8").split("\n");
  const startIdx = lineIndexFromId(id);
  const taskLine = lines[startIdx];
  if (taskLine == null || !TASK_RE.test(taskLine)) return false;

  // End of this task's block = first non-indented line after it.
  let endIdx = startIdx + 1;
  while (endIdx < lines.length && INDENT_RE.test(lines[endIdx]!)) endIdx++;

  const value = oneLine(text, cap);
  lines.splice(endIdx, 0, `  - ${label}: ${value}`);
  writeFileSync(file, lines.join("\n"));
  return true;
}

function readJsonSafe(path: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Resolve the absolute `tasks.md` path a surface should write to, matching Pip's resolution so
 * both point at the same board:
 *   1. TANDEM_TASKS_FILE env (absolute, or relative to the workspace)
 *   2. ~/.tandem/config.json `tasksFile` (absolute, or relative to the workspace)
 *   3. {workspace}/tasks.md
 */
export function resolveTasksFile(workspace: string): string {
  const fromEnv = process.env.TANDEM_TASKS_FILE?.trim();
  if (fromEnv) return isAbsolute(fromEnv) ? fromEnv : resolve(workspace, fromEnv);

  const homeCfg = readJsonSafe(join(homedir(), ".tandem", "config.json"));
  const configured = typeof homeCfg.tasksFile === "string" ? homeCfg.tasksFile.trim() : "";
  if (configured) {
    return isAbsolute(configured) ? configured : resolve(workspace, configured);
  }

  return join(workspace, "tasks.md");
}
