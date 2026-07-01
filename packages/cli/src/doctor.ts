import { existsSync } from "node:fs";
import { join } from "node:path";
import { checkCli } from "@tandem/engine";
import { defaultWorkspaceHome, hasBrainSkills, resolveWorkspace } from "@tandem/core";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

/** Run prerequisite checks for a fresh install. */
export async function runDoctor(): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  const nodeOk = Number(process.versions.node.split(".")[0]) >= 20;
  checks.push({
    name: "Node.js",
    ok: nodeOk,
    detail: nodeOk ? `v${process.versions.node}` : `Need Node ≥ 20 (have ${process.versions.node})`,
  });

  const version = await checkCli();
  checks.push({
    name: "cursor-agent",
    ok: version !== null,
    detail: version
      ? version
      : "Not found. Install: curl https://cursor.com/install -fsS | bash && cursor-agent login",
  });

  const ws = resolveWorkspace();
  const initialized = existsSync(join(ws, "AGENTS.md"));
  // Not a hard failure: `tandem pip` (and the installer) create the workspace automatically.
  checks.push({
    name: "Tandem workspace",
    ok: true,
    detail: initialized
      ? ws
      : `Will be created on first launch at ${ws} (or run: tandem init ${defaultWorkspaceHome()})`,
  });

  // Optional. Absence is not a failure — Pip builds your context as you go.
  const richBrain = hasBrainSkills(ws);
  checks.push({
    name: "Brain (PM OS)",
    ok: true,
    detail: richBrain
      ? "PM OS skills available"
      : "none yet — optional; Pip grows your memory/ as you work",
  });

  return checks;
}
