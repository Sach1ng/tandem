import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/** Default workspace directory for installed (non-git) users. */
export function defaultWorkspaceHome(): string {
  return join(homedir(), ".tandem");
}

function isInitializedWorkspace(dir: string): boolean {
  return existsSync(join(dir, "AGENTS.md"));
}

/** Walk up from cwd looking for an initialized workspace (AGENTS.md). */
export function findWorkspaceFromCwd(start = process.cwd()): string | undefined {
  let dir = resolve(start);
  for (let i = 0; i < 12; i++) {
    if (isInitializedWorkspace(dir)) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return undefined;
}

/**
 * Resolve the Tandem workspace directory.
 *
 * Priority:
 *  1. TANDEM_WORKSPACE env
 *  2. CURSOR_WORKDIR env (backward compat)
 *  3. ~/.tandem if initialized (has AGENTS.md)
 *  4. fallbackRoot if initialized
 *  5. cwd walk-up if initialized
 *  6. fallbackRoot (git checkout root when developing)
 *  7. ~/.tandem (even if not yet initialized — `tandem init` will populate it)
 */
export function resolveWorkspace(fallbackRoot?: string): string {
  const fromEnv =
    process.env.TANDEM_WORKSPACE?.trim() || process.env.CURSOR_WORKDIR?.trim();
  if (fromEnv) return resolve(fromEnv);

  const home = defaultWorkspaceHome();
  if (isInitializedWorkspace(home)) return home;
  if (fallbackRoot && isInitializedWorkspace(fallbackRoot)) return fallbackRoot;

  const fromCwd = findWorkspaceFromCwd();
  if (fromCwd) return fromCwd;

  if (fallbackRoot) return fallbackRoot;

  return home;
}
