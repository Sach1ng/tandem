#!/usr/bin/env node
/**
 * Launch Clippy with TANDEM_WORKSPACE set. Used by `tandem clippy` and `npx @tandem/clippy`.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolveWorkspace } from "@tandem/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const clippyRoot = resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const ws = resolveWorkspace();
if (!existsSync(join(ws, "AGENTS.md"))) {
  console.error(`No Tandem workspace at ${ws}. Run: tandem init`);
  process.exit(1);
}

process.env.TANDEM_WORKSPACE = ws;

const distMain = join(clippyRoot, "dist", "main.cjs");
if (!existsSync(distMain)) {
  console.error("Clippy is not built. Reinstall @tandem/clippy or run npm run build.");
  process.exit(1);
}

function electronBin() {
  const local = join(clippyRoot, "node_modules", ".bin", "electron");
  if (existsSync(local)) return local;
  return require.resolve("electron/cli.js");
}

const child = spawn(electronBin(), [clippyRoot], {
  stdio: "inherit",
  env: { ...process.env, TANDEM_WORKSPACE: ws },
});
child.on("exit", (code) => process.exit(code ?? 0));
