import { existsSync } from "node:fs";
import { join } from "node:path";

/** Default PM OS location inside a Tandem workspace. */
export function defaultPmOsDir(workspace: string): string {
  return join(workspace, "external", "pm-operating-os");
}

/** True when `dir` looks like a PM OS brain (skills tree on disk). */
export function isPmOsDir(dir: string): boolean {
  return Boolean(dir) && existsSync(join(dir, "skills"));
}

/**
 * Directory passed to cursor-agent `--workspace`.
 * Prefer the PM OS root when it has its own AGENTS.md; otherwise the Tandem workspace.
 */
export function resolveAgentWorkspace(workspace: string, knowledgeBase?: string): string {
  const kb = knowledgeBase?.trim();
  if (kb && isPmOsDir(kb) && existsSync(join(kb, "AGENTS.md"))) return kb;
  if (existsSync(join(workspace, "AGENTS.md"))) return workspace;
  if (kb && isPmOsDir(kb)) return kb;
  const bundled = defaultPmOsDir(workspace);
  if (isPmOsDir(bundled)) {
    return existsSync(join(bundled, "AGENTS.md")) ? bundled : workspace;
  }
  return workspace;
}

/** First usable PM OS path: configured knowledge base, then workspace default. */
export function resolveKnowledgeBase(workspace: string, configured?: string): string | undefined {
  const kb = configured?.trim();
  if (kb && isPmOsDir(kb)) return kb;
  const bundled = defaultPmOsDir(workspace);
  if (isPmOsDir(bundled)) return bundled;
  return kb || undefined;
}
