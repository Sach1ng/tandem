#!/usr/bin/env node
/**
 * Launch Pip with TANDEM_WORKSPACE set. Used by `tandem pip` and `npx @tandem/pip`.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { defaultPmOsDir, isPmOsDir, resolveWorkspace } from "@tandem/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pipRoot = resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const ws = resolveWorkspace();
const hasWorkspace = existsSync(join(ws, "AGENTS.md"));
const hasPmOs = isPmOsDir(defaultPmOsDir(ws));

if (!hasWorkspace && !hasPmOs) {
  console.error(`No Pip workspace at ${ws}. Run: tandem init`);
  console.error(`Or launch Pip and choose a PM OS knowledge base folder when prompted.`);
  process.exit(1);
}

if (!hasPmOs) {
  console.warn(`PM OS not found at ${defaultPmOsDir(ws)} — Pip will ask you to choose a knowledge base.`);
}

process.env.TANDEM_WORKSPACE = ws;

const distMain = join(pipRoot, "dist", "main.cjs");
if (!existsSync(distMain)) {
  console.error("Pip is not built. Reinstall @tandem/pip or run npm run build.");
  process.exit(1);
}

function electronBin() {
  const direct = join(
    pipRoot,
    "node_modules",
    "electron",
    "dist",
    "Electron.app",
    "Contents",
    "MacOS",
    "Electron",
  );
  if (existsSync(direct)) return direct;
  const local = join(pipRoot, "node_modules", ".bin", "electron");
  if (existsSync(local)) return local;
  return require.resolve("electron/cli.js");
}

const child = spawn(electronBin(), [pipRoot], {
  stdio: "inherit",
  env: { ...process.env, TANDEM_WORKSPACE: ws },
});
child.on("exit", (code) => process.exit(code ?? 0));
