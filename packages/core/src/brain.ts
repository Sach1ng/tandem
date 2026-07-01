import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
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

/** True when a real PM OS skills brain is available (configured knowledge base or bundled). */
export function hasBrainSkills(workspace: string, knowledgeBase?: string): boolean {
  const kb = resolveKnowledgeBase(workspace, knowledgeBase);
  return Boolean(kb && isPmOsDir(kb));
}
