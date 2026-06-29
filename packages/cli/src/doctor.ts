import { existsSync } from "node:fs";
import { join } from "node:path";
import { checkCli } from "@tandem/engine";
import { defaultWorkspaceHome, resolveWorkspace } from "@tandem/core";

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
  const agents = join(ws, "AGENTS.md");
  const brain = join(ws, "external", "pm-operating-os", "skills");
  const wsOk = existsSync(agents) && existsSync(brain);
  checks.push({
    name: "Tandem workspace",
    ok: wsOk,
    detail: wsOk
      ? ws
      : `Not initialized at ${ws}. Run: tandem init (or tandem init ${defaultWorkspaceHome()})`,
  });

  return checks;
}
