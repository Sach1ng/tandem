/**
 * Bundles PM OS + workspace templates into this package for npm publish.
 * Run from repo root: node packages/pm-os/scripts/prepare.mjs
 */
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(PKG_ROOT, "../..");
const PM_OS_SRC = join(REPO_ROOT, "external/pm-operating-os");
const BRAIN_DEST = join(PKG_ROOT, "brain");

rmSync(BRAIN_DEST, { recursive: true, force: true });
mkdirSync(BRAIN_DEST, { recursive: true });

cpSync(PM_OS_SRC, BRAIN_DEST, {
  recursive: true,
  filter: (src) => !src.includes(".git"),
});

cpSync(join(REPO_ROOT, "AGENTS.md"), join(PKG_ROOT, "AGENTS.md"));
cpSync(join(REPO_ROOT, "tasks.example.md"), join(PKG_ROOT, "tasks.template.md"));

// Installed-workspace variant of AGENTS.md (no git submodule references).
const agents = readFileSync(join(PKG_ROOT, "AGENTS.md"), "utf8");
const installed = agents
  .replace(
    /PM OS, mounted at `external\/pm-operating-os`/g,
    "PM OS, at `external/pm-operating-os`",
  )
  .replace(
    /`external\/pm-operating-os\/` is a git submodule — a self-serve/g,
    "`external/pm-operating-os/` is a self-serve",
  );
writeFileSync(join(PKG_ROOT, "AGENTS.installed.md"), installed);

console.log("@tandem/pm-os: prepared brain/, AGENTS.md, tasks.template.md");
