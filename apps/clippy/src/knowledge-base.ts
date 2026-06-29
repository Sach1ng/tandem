import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  defaultPmOsDir,
  isPmOsDir,
  resolveAgentWorkspace,
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

function validateKnowledgeBase(dir: string): void {
  if (!existsSync(dir)) {
    throw new Error(`Folder does not exist: ${dir}`);
  }
  if (!isPmOsDir(dir)) {
    throw new Error(
      `"${dir}" does not look like a PM OS knowledge base (expected a skills/ folder inside).`,
    );
  }
}

/**
 * Resolve PM OS for the agent. Uses bundled `external/pm-operating-os` when present;
 * otherwise invokes `pickFolder` (Electron dialog) once and saves the choice.
 */
export async function ensureKnowledgeBase(
  workspace: string,
  configured: string | undefined,
  pickFolder: () => Promise<string | null>,
): Promise<KnowledgeBaseResolution> {
  const existing = resolveKnowledgeBase(workspace, configured);
  if (existing) {
    return {
      knowledgeBase: existing,
      agentWorkspace: resolveAgentWorkspace(workspace, existing),
    };
  }

  const bundled = defaultPmOsDir(workspace);
  const picked = await pickFolder();
  if (!picked) {
    throw new Error(
      `PM OS not found at ${bundled}. Run "tandem init" or choose a knowledge base folder.`,
    );
  }

  validateKnowledgeBase(picked);
  saveKnowledgeBase(picked);

  return {
    knowledgeBase: picked,
    agentWorkspace: resolveAgentWorkspace(workspace, picked),
  };
}
