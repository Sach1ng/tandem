import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { agentsFile, brainDir, tasksTemplate } from "@tandem/pm-os";
import { defaultWorkspaceHome, ensureBrainScaffold } from "@tandem/core";

const MINIMAL_AGENTS = `# Pip — Workspace Charter

Auto-loaded by cursor-agent on every run. This is Pip's shared, persistent context.

## How to behave
- You are Pip, an ambient AI coworker. Lead with the answer. Act end-to-end. No preamble.
- State assumptions. Flag anything irreversible before doing it. Never invent facts.

## Grow-as-you-go brain
There may be no prebuilt context yet, and that's fine.
- At the start of a task, read \`memory/\` (and \`knowledge/\`, \`skills/\` if present).
- As you learn durable facts about the user, their goals, projects, and preferences, append them
  to \`memory/profile.md\`. Log notable decisions/outcomes to \`memory/log.md\` (one dated line).
- Keep memory terse and high-signal so it stays useful as it compounds.
`;

const MINIMAL_TASKS = `# My Tasks

## Active

## Scheduled

## Waiting

## Needs triage
`;

type CopyStatus = "copied" | "skipped" | "failed";

/** Best-effort copy that never throws. */
function tryCopy(src: string, dest: string, force: boolean, created: string[], skipped: string[]): CopyStatus {
  try {
    if (existsSync(dest) && !force) {
      skipped.push(dest);
      return "skipped";
    }
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true });
    created.push(dest);
    return "copied";
  } catch {
    return "failed";
  }
}

export interface InitOptions {
  /** Target directory. Defaults to ~/.tandem */
  dir?: string;
  /** Overwrite existing files. Default false. */
  force?: boolean;
}

export interface InitResult {
  dir: string;
  created: string[];
  skipped: string[];
}

/** Write a file only if missing (or force), never throwing. */
function seedFile(dest: string, contents: string, force: boolean, created: string[], skipped: string[]): void {
  if (existsSync(dest) && !force) {
    skipped.push(dest);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, contents);
  created.push(dest);
}

/**
 * Initialize a Pip workspace on disk — no git or GitHub required.
 *
 * The PM OS brain is OPTIONAL: if the bundled brain is available it's copied as a rich starting
 * point; if not, Pip still works with a minimal, self-growing scaffold (AGENTS.md + memory/).
 * Always succeeds.
 */
export function initWorkspace(opts: InitOptions = {}): InitResult {
  const dir = resolve(opts.dir ?? defaultWorkspaceHome());
  const force = opts.force ?? false;
  const created: string[] = [];
  const skipped: string[] = [];

  const agentsDest = join(dir, "AGENTS.md");
  const brainDest = join(dir, "external", "pm-operating-os");
  const tasksDest = join(dir, "tasks.md");

  // Rich brain if bundled; otherwise minimal seeds so a first-time user is never blocked.
  if (tryCopy(agentsFile(true), agentsDest, force, created, skipped) === "failed") {
    seedFile(agentsDest, MINIMAL_AGENTS, force, created, skipped);
  }
  tryCopy(brainDir(), brainDest, force, created, skipped);
  if (tryCopy(tasksTemplate(), tasksDest, force, created, skipped) === "failed") {
    seedFile(tasksDest, MINIMAL_TASKS, force, created, skipped);
  }

  // Always guarantee a self-growing memory scaffold, brain or not.
  for (const p of ensureBrainScaffold(dir)) created.push(p);

  mkdirSync(join(dir, ".tandem"), { recursive: true });

  if (!existsSync(join(dir, "config.json"))) {
    writeFileSync(
      join(dir, "config.json"),
      JSON.stringify(
        {
          tasksFile: "tasks.md",
          agentModel: "auto",
        },
        null,
        2,
      ) + "\n",
    );
    created.push(join(dir, "config.json"));
  } else if (!force) {
    skipped.push(join(dir, "config.json"));
  }

  return { dir, created, skipped };
}
