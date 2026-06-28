import { readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

export interface ClippyConfig {
  workspace: string; // absolute
  tasksFile: string; // absolute
  agent: string;
  agentModel: string;
  agentFlags: string[];
  panel: { minW: number; minH: number; maxW: number; maxH: number; defaultW: number; defaultH: number };
  collapsed: { w: number; h: number };
}

function readJson(path: string): Record<string, any> {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Merge config.default.json with an optional (gitignored) config.json, then resolve paths.
 * `workspace: "."` means the Tandem repo root, so the agent inherits AGENTS.md + the PM OS submodule.
 */
export function loadConfig(appDir: string, repoRoot: string): ClippyConfig {
  const defaults = readJson(join(appDir, "config.default.json"));
  const user = readJson(join(appDir, "config.json"));
  const merged: Record<string, any> = {
    ...defaults,
    ...user,
    panel: { ...defaults.panel, ...user.panel },
    collapsed: { ...defaults.collapsed, ...user.collapsed },
  };

  const workspace = !merged.workspace || merged.workspace === "."
    ? repoRoot
    : isAbsolute(merged.workspace)
      ? merged.workspace
      : resolve(repoRoot, merged.workspace);

  const tasksFile = isAbsolute(merged.tasksFile)
    ? merged.tasksFile
    : resolve(workspace, merged.tasksFile);

  return {
    workspace,
    tasksFile,
    agent: merged.agent ?? "cursor-agent",
    agentModel: merged.agentModel ?? "auto",
    agentFlags: merged.agentFlags ?? ["-p", "--trust", "--output-format", "text"],
    panel: merged.panel,
    collapsed: merged.collapsed,
  };
}
