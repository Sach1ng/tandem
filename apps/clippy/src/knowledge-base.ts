import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  ensureBrainScaffold,
  isPmOsDir,
  resolveKnowledgeBase,
} from "@tandem/core";

export interface KnowledgeBaseResolution {
  knowledgeBase: string;
  agentWorkspace: string;
}

function userConfigPath(): string {
  return join(homedir(), ".tandem", "config.json");
}

function readUserConfig(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(userConfigPath(), "utf8"));
  } catch {
    return {};
  }
}

/** Persist chosen knowledge base for future Clippy / Tandem runs. */
export function saveKnowledgeBase(dir: string): void {
  const path = userConfigPath();
  mkdirSync(join(homedir(), ".tandem"), { recursive: true });
  const data = { ...readUserConfig(), knowledgeBase: dir };
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * Resolve the brain for Pip. PM OS is optional.
 *
 * `knowledgeBase` — the brain on disk. A full PM OS (skills/knowledge/memory) if one is available,
 *   otherwise the workspace itself in grow-as-you-go mode (Pip reads/writes `memory/` there).
 * `agentWorkspace` — cursor-agent `--workspace` (kept at the Tandem workspace so every ask doesn't
 *   boot the full PM OS tree; the agent reads skills/knowledge via tools / @paths on demand).
 *
 * Never throws and never blocks on a folder picker: a first-time user with no context still gets a
 * working coworker that builds their brain as they go.
 */
export async function ensureKnowledgeBase(
  workspace: string,
  configured: string | undefined,
): Promise<KnowledgeBaseResolution> {
  const existing = resolveKnowledgeBase(workspace, configured);
  if (existing && isPmOsDir(existing)) {
    return { knowledgeBase: existing, agentWorkspace: workspace };
  }

  // No PM OS brain — run against the workspace itself and seed a self-growing memory scaffold.
  ensureBrainScaffold(workspace);
  return { knowledgeBase: workspace, agentWorkspace: workspace };
}
