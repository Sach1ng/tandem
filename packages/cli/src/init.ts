import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { agentsFile, brainDir, tasksTemplate } from "@tandem/pm-os";
import { defaultWorkspaceHome } from "@tandem/core";

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

function copyIfNeeded(src: string, dest: string, force: boolean, created: string[], skipped: string[]) {
  if (existsSync(dest) && !force) {
    skipped.push(dest);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  created.push(dest);
}

/**
 * Initialize a Tandem workspace on disk — no git or GitHub required.
 * Creates AGENTS.md, PM OS brain, and a starter tasks.md.
 */
export function initWorkspace(opts: InitOptions = {}): InitResult {
  const dir = resolve(opts.dir ?? defaultWorkspaceHome());
  const force = opts.force ?? false;
  const created: string[] = [];
  const skipped: string[] = [];

  const agentsDest = join(dir, "AGENTS.md");
  const brainDest = join(dir, "external", "pm-operating-os");
  const tasksDest = join(dir, "tasks.md");

  copyIfNeeded(agentsFile(true), agentsDest, force, created, skipped);
  copyIfNeeded(brainDir(), brainDest, force, created, skipped);
  copyIfNeeded(tasksTemplate(), tasksDest, force, created, skipped);

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
