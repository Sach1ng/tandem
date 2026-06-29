import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

/** Absolute path to the bundled PM OS brain directory. */
export function brainDir() {
  return join(dirname(require.resolve("@tandem/pm-os/package.json")), "brain");
}

/** Absolute path to the workspace charter (AGENTS.md). */
export function agentsFile(installed = true) {
  const root = dirname(require.resolve("@tandem/pm-os/package.json"));
  return join(root, installed ? "AGENTS.installed.md" : "AGENTS.md");
}

/** Absolute path to the sample tasks.md template. */
export function tasksTemplate() {
  return join(dirname(require.resolve("@tandem/pm-os/package.json")), "tasks.template.md");
}
