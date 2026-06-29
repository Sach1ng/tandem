#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolveWorkspace } from "@tandem/core";
import { initWorkspace } from "./init.js";
import { runDoctor } from "./doctor.js";
import {
  cmdSlackConnect,
  cmdSlackSetup,
  cmdSlackStart,
  cmdSlackStatus,
  slackUsage,
} from "./slack-cmd.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function usage(): void {
  console.log(`Tandem — ambient AI coworker (Slack, Clippy, browser)

Usage:
  tandem init [dir]       Initialize workspace (~/.tandem by default)
  tandem init --force     Overwrite existing workspace files
  tandem doctor           Check prerequisites (Node, cursor-agent, workspace)
  tandem clippy           Launch the Clippy desktop widget
  tandem workspace        Print the resolved workspace path

  tandem slack connect    Connect Slack via OAuth (recommended)
  tandem slack start      Run the Slack coworker bot
  tandem slack setup      Manual token setup (fallback)
  tandem slack status     Show Slack connection state

Environment:
  TANDEM_WORKSPACE        Workspace directory (default: ~/.tandem)
  CURSOR_WORKDIR          Alias for TANDEM_WORKSPACE
  TANDEM_SLACK_CLIENT_ID      OAuth client ID (distributed app)
  TANDEM_SLACK_CLIENT_SECRET  OAuth client secret
  TANDEM_SLACK_APP_TOKEN      App-level token (Socket Mode)

Prerequisites:
  Node.js ≥ 20.6
  Cursor CLI: curl https://cursor.com/install -fsS | bash && cursor-agent login
`);
}

async function cmdInit(args: string[]): Promise<void> {
  const force = args.includes("--force");
  const dirArg = args.find((a) => !a.startsWith("-"));
  const result = initWorkspace({ dir: dirArg, force });

  console.log(`\n✅ Tandem workspace ready at ${result.dir}\n`);
  if (result.created.length) {
    console.log("Created:");
    for (const f of result.created) console.log(`  ${f}`);
  }
  if (result.skipped.length) {
    console.log("\nSkipped (already exists — use --force to overwrite):");
    for (const f of result.skipped) console.log(`  ${f}`);
  }
  console.log(`
Next steps:
  export TANDEM_WORKSPACE=${result.dir}
  tandem doctor
  tandem clippy
`);
}

async function cmdDoctor(): Promise<void> {
  const checks = await runDoctor();
  let allOk = true;
  console.log("\nTandem doctor\n");
  for (const c of checks) {
    console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`);
    if (!c.ok) allOk = false;
  }
  console.log(allOk ? "\n✅ All checks passed\n" : "\n❌ Some checks failed\n");
  process.exit(allOk ? 0 : 1);
}

function cmdWorkspace(): void {
  console.log(resolveWorkspace());
}

function findClippyRoot(): string {
  try {
    return dirname(require.resolve("@tandem/clippy/package.json"));
  } catch {
    // Dev: running from monorepo packages/cli
    const dev = resolve(__dirname, "../../../apps/clippy");
    if (existsSync(join(dev, "package.json"))) return dev;
    throw new Error("@tandem/clippy is not installed. Run: npm install -g @tandem/cli @tandem/clippy");
  }
}

function findElectronBin(clippyRoot: string): string {
  const local = join(clippyRoot, "node_modules", ".bin", "electron");
  if (existsSync(local)) return local;
  try {
    return require.resolve("electron/cli.js");
  } catch {
    throw new Error("electron not found. Reinstall: npm install -g @tandem/clippy");
  }
}

async function cmdClippy(): Promise<void> {
  const ws = resolveWorkspace();
  if (!existsSync(join(ws, "AGENTS.md"))) {
    console.error(`No Tandem workspace at ${ws}. Run: tandem init`);
    process.exit(1);
  }

  process.env.TANDEM_WORKSPACE = ws;

  const clippyRoot = findClippyRoot();
  const distMain = join(clippyRoot, "dist", "main.cjs");
  if (!existsSync(distMain)) {
    console.error("@tandem/clippy is not built. Reinstall the package or run npm run build in apps/clippy.");
    process.exit(1);
  }

  const electron = findElectronBin(clippyRoot);
  const child = spawn(electron, [clippyRoot], {
    stdio: "inherit",
    env: { ...process.env, TANDEM_WORKSPACE: ws },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

async function main(): Promise<void> {
  const [cmd, sub, ...rest] = process.argv.slice(2);

  if (!cmd || cmd === "--help" || cmd === "-h") {
    usage();
    return;
  }

  if (cmd === "slack") {
    if (!sub || sub === "--help" || sub === "-h") {
      slackUsage();
      return;
    }
    switch (sub) {
      case "connect":
        await cmdSlackConnect(rest);
        break;
      case "start":
        await cmdSlackStart();
        break;
      case "setup":
        await cmdSlackSetup();
        break;
      case "status":
        cmdSlackStatus();
        break;
      default:
        console.error(`Unknown slack command: ${sub}\n`);
        slackUsage();
        process.exit(1);
    }
    return;
  }

  switch (cmd) {
    case "init":
      await cmdInit(rest);
      break;
    case "doctor":
      await cmdDoctor();
      break;
    case "clippy":
      await cmdClippy();
      break;
    case "workspace":
      cmdWorkspace();
      break;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      usage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
