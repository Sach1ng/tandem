import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { isPmOsDir, resolveKnowledgeBase } from "./pm-os.ts";

/**
 * Grow-as-you-go brain.
 *
 * PM OS (a skills/knowledge tree) is optional. When a user has no brain, Pip still works: it runs
 * against a tiny self-growing scaffold under the workspace — a `memory/` folder Pip reads at the
 * start of every run and appends durable learnings to as it goes. Over time this becomes the user's
 * own context, with zero setup.
 */

const MEMORY_DIR = "memory";
const PROFILE_FILE = "profile.md";
const LOG_FILE = "log.md";

/** Per-file cap when folding memory into a prompt, so one big note can't crowd out the task. */
const PER_FILE_CAP = 4000;

const PROFILE_SEED = `# Profile

Pip keeps durable facts about you and your work here, and reads it at the start of every task.
It grows automatically as you work together — you don't have to fill it in.

<!-- Pip: append stable facts about the user, their goals, projects, preferences, and vocabulary. -->
`;

const LOG_SEED = `# Working log

Short, dated notes about what was done and decided, so context compounds across sessions.

<!-- Pip: append one-line, dated entries for decisions and outcomes worth remembering. -->
`;

/** Absolute path to the workspace's memory directory. */
export function memoryDir(workspace: string): string {
  return join(workspace, MEMORY_DIR);
}

/**
 * Ensure a minimal, self-growing brain exists at `workspace` (idempotent). Creates `memory/` with a
 * seeded profile + log if they're missing. Never overwrites existing files. Returns the paths created.
 */
export function ensureBrainScaffold(workspace: string): string[] {
  const created: string[] = [];
  const dir = memoryDir(workspace);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    created.push(dir);
  }
  const seeds: Array<[string, string]> = [
    [join(dir, PROFILE_FILE), PROFILE_SEED],
    [join(dir, LOG_FILE), LOG_SEED],
  ];
  for (const [path, contents] of seeds) {
    if (!existsSync(path)) {
      writeFileSync(path, contents);
      created.push(path);
    }
  }
  return created;
}

/**
 * Read the workspace memory (all top-level `.md` files under `memory/`) into a single block for
 * prompt injection. Skips seed-only files (nothing learned yet) so we don't inject placeholder
 * comments. Returns "" when there's no learned context. Each file is capped.
 */
export function readMemory(workspace: string, perFileCap = PER_FILE_CAP): string {
  const dir = memoryDir(workspace);
  if (!existsSync(dir)) return "";

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return "";
  }

  const seeds = new Set([PROFILE_SEED.trim(), LOG_SEED.trim()]);
  const blocks: string[] = [];
  for (const name of entries.sort()) {
    if (!name.toLowerCase().endsWith(".md")) continue;
    const path = join(dir, name);
    try {
      if (!statSync(path).isFile()) continue;
      const raw = readFileSync(path, "utf8");
      if (seeds.has(raw.trim())) continue; // pristine seed — nothing learned yet
      const meaningful = stripSeedNoise(raw);
      if (!meaningful) continue; // only comments/blank lines
      const capped = meaningful.length > perFileCap ? `${meaningful.slice(0, perFileCap - 1)}…` : meaningful;
      blocks.push(`### ${name}\n${capped}`);
    } catch {
      // ignore unreadable file
    }
  }
  return blocks.join("\n\n");
}

/** Strip HTML comments and blank lines so a file with only placeholder comments reads as empty. */
function stripSeedNoise(raw: string): string {
  return raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .join("\n")
    .trim();
}

const ACTIVITY_FILE = "activity.md";
const ACTIVITY_HEADER = `# Activity

A shared, cross-surface log of what you've been working on. Every surface (desktop Pip, Slack, browser)
appends one line here after an interaction, so any surface can answer "what was I just working on?".

<!-- Format: - <ISO timestamp> · <surface> · <ask> · <outcome> -->
`;

/** Keep the log bounded so reads stay cheap; trim to the newest entries past this. */
const ACTIVITY_MAX_LINES = 400;
const ACTIVITY_KEEP_LINES = 300;

function oneLine(s: string, cap = 160): string {
  return (s || "").replace(/\s+/g, " ").trim().slice(0, cap);
}

/**
 * Append one entry to the shared cross-surface activity log at `memory/activity.md`. Best-effort and
 * never throws — a failed log must never break a reply. readMemory() picks this file up automatically,
 * so the log compounds into every surface's context ("same brain, every window").
 */
export function logActivity(
  workspace: string,
  entry: { surface: string; ask: string; outcome: string },
): void {
  try {
    const dir = memoryDir(workspace);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, ACTIVITY_FILE);
    if (!existsSync(path)) writeFileSync(path, ACTIVITY_HEADER);
    const ts = new Date().toISOString();
    const line = `- ${ts} · ${oneLine(entry.surface, 24)} · ${oneLine(entry.ask)} · ${oneLine(entry.outcome)}\n`;
    appendFileSync(path, line);
    trimActivity(path);
  } catch {
    /* best-effort: memory logging must never break a reply */
  }
}

/** Rewrite the log with only the newest entries when it grows too large (atomic via temp+rename). */
function trimActivity(path: string): void {
  try {
    const lines = readFileSync(path, "utf8").split("\n");
    const entries = lines.filter((l) => l.startsWith("- "));
    if (entries.length <= ACTIVITY_MAX_LINES) return;
    const kept = entries.slice(-ACTIVITY_KEEP_LINES);
    const next = `${ACTIVITY_HEADER}\n${kept.join("\n")}\n`;
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, next);
    renameSync(tmp, path);
  } catch {
    /* leave the log as-is on any trim failure */
  }
}

/** True when a real PM OS skills brain is available (configured knowledge base or bundled). */
export function hasBrainSkills(workspace: string, knowledgeBase?: string): boolean {
  const kb = resolveKnowledgeBase(workspace, knowledgeBase);
  return Boolean(kb && isPmOsDir(kb));
}
