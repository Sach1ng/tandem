import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * cursor-agent auto-loads AGENTS.md, but we also fold it into the prompt verbatim so the
 * persona/charter is guaranteed present even if auto-load is disabled or the file moves.
 * Reads fresh each call so edits take effect without a restart.
 */
export function readCharter(workspace: string, filename = "AGENTS.md"): string {
  try {
    return readFileSync(join(workspace, filename), "utf8").trim();
  } catch {
    return "";
  }
}

export function readPersona(path: string, fallback: string): string {
  try {
    return readFileSync(path, "utf8").trim() || fallback;
  } catch {
    return fallback;
  }
}
