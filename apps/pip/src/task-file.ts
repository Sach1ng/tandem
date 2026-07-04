import { readFileSync, writeFileSync } from "node:fs";
import type { SectionKey } from "./parser.ts";

const TASK_RE = /^-\s+\[([ xX])\]/;
const INDENT_RE = /^\s+\S/;

function lineIndexFromId(id: string): number {
  return Number(id.replace(/^L/, "")) - 1;
}

/** Header text → section key (mirror of parser, kept local to avoid a circular import). */
function headerKey(line: string): SectionKey | null | "stop" {
  if (!line.startsWith("## ")) return null;
  const h = line.slice(3).replace(/\(.*?\)/g, "").trim().toLowerCase();
  if (/^(archive|done|how to use)/.test(h)) return "stop";
  if (h.includes("active") || h.includes("key focus")) return "active";
  if (h.includes("scheduled")) return "scheduled";
  if (h.includes("waiting")) return "waiting";
  if (h.includes("needs triage") || h.includes("inbox")) return "needs_triage";
  return null;
}

/** Flip [ ] ↔ [x] on the task at `id`. Done ≠ triaged — this only toggles completion. */
export function toggleDoneInFile(file: string, id: string): void {
  const lines = readFileSync(file, "utf8").split("\n");
  const idx = lineIndexFromId(id);
  const line = lines[idx];
  if (line == null || !TASK_RE.test(line)) return;
  lines[idx] = line.replace(/\[([ xX])\]/, (_m, c: string) =>
    c.toLowerCase() === "x" ? "[ ]" : "[x]",
  );
  writeFileSync(file, lines.join("\n"));
}

/**
 * Move a task block to another section, operating line-faithfully so the rest of the file
 * is never reflowed. Extracts the task line + its trailing indented sub-bullets, removes them,
 * then splices the block in after the target section's last task (before the next ## / ---).
 */
export function moveTaskInFile(file: string, id: string, targetSection: SectionKey): void {
  const lines = readFileSync(file, "utf8").split("\n");
  const startIdx = lineIndexFromId(id);
  if (lines[startIdx] == null || !TASK_RE.test(lines[startIdx]!)) return;

  // 1. Extract the block: task line + trailing indented sub-bullets.
  let endIdx = startIdx + 1;
  while (endIdx < lines.length && INDENT_RE.test(lines[endIdx]!)) endIdx++;
  const block = lines.slice(startIdx, endIdx);

  // 2. Remove it.
  const without = [...lines.slice(0, startIdx), ...lines.slice(endIdx)];

  // 3. Find the target section header.
  let headerIdx = -1;
  for (let i = 0; i < without.length; i++) {
    if (headerKey(without[i]!) === targetSection) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    // Target section doesn't exist — append it at end.
    without.push("", `## ${sectionTitle(targetSection)}`, ...block);
    writeFileSync(file, without.join("\n"));
    return;
  }

  // 4. Insert point = just before the next "## " / "---" / EOF.
  let insertAt = without.length;
  for (let i = headerIdx + 1; i < without.length; i++) {
    const l = without[i]!;
    if (l.startsWith("## ") || l.trim() === "---") {
      insertAt = i;
      break;
    }
  }
  // Trim trailing blank lines inside the section so we tuck in cleanly.
  while (insertAt - 1 > headerIdx && without[insertAt - 1]!.trim() === "") insertAt--;

  // Blocks are self-contained (task line + its sub-bullets), so no extra spacer is needed.
  without.splice(insertAt, 0, ...block);

  writeFileSync(file, without.join("\n"));
}

function sectionTitle(key: SectionKey): string {
  switch (key) {
    case "active":
      return "Active";
    case "scheduled":
      return "Scheduled";
    case "waiting":
      return "Waiting";
    case "needs_triage":
      return "Needs triage";
  }
}
