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
import {
  pipAutostartInstall,
  pipAutostartStatus,
  pipAutostartUninstall,
  pipAutostartUsage,
} from "./pip-autostart.js";
import {
  bridgeAutostartInstall,
  bridgeAutostartStatus,
  bridgeAutostartUninstall,
  bridgeAutostartUsage,
} from "./bridge-autostart.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function usage(): void {
  console.log(`Pip — ambient AI coworker, Pip (Slack, desktop, browser)

Usage:
  tandem init [dir]       Initialize workspace (~/.tandem by default)
  tandem init --force     Overwrite existing workspace files
  tandem doctor           Check prerequisites (Node, cursor-agent, workspace)
  tandem pip              Launch Pip on your desktop
  tandem pip autostart    Install/remove login autostart (macOS)
  tandem bridge autostart Install/remove Chrome bridge login autostart (macOS)
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

  console.log(`\n✅ Pip workspace ready at ${result.dir}\n`);
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
  tandem pip
`);
}

async function cmdDoctor(): Promise<void> {
  const checks = await runDoctor();
  let allOk = true;
  console.log("\nPip doctor\n");
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

function findPipRoot(): string {
  try {
    return dirname(require.resolve("@tandem/pip/package.json"));
  } catch {
    // Dev: running from monorepo packages/cli
    const dev = resolve(__dirname, "../../../apps/pip");
    if (existsSync(join(dev, "package.json"))) return dev;
    throw new Error("@tandem/pip is not installed. Run: npm install -g @tandem/cli @tandem/pip");
  }
}

function findElectronBin(pipRoot: string): string {
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
  try {
    return require.resolve("electron/cli.js");
  } catch {
    throw new Error("electron not found. Reinstall: npm install -g @tandem/pip");
  }
}

async function cmdPipAutostart(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (!sub || sub === "--help" || sub === "-h") {
    pipAutostartUsage();
    return;
  }

  switch (sub) {
    case "install": {
      const wsFlag = rest.indexOf("--workspace");
      const workspace = wsFlag >= 0 ? rest[wsFlag + 1] : undefined;
      const status = pipAutostartInstall(__dirname, workspace);
      console.log("\n✅ Pip will start at login\n");
      console.log(`  Workspace:  ${status.workspace}`);
      console.log(`  Launcher:   ${status.runScript}`);
      console.log(`  LaunchAgent: ${status.plistPath}`);
      console.log(`  Monitor:    http://127.0.0.1:8791 (after Pip starts)\n`);
      break;
    }
    case "uninstall":
      pipAutostartUninstall(__dirname);
      console.log("\n✅ Removed Pip login autostart\n");
      break;
    case "status": {
      const status = pipAutostartStatus(__dirname);
      console.log("\nPip autostart\n");
      console.log(`  Installed: ${status.installed ? "yes" : "no"}`);
      console.log(`  Loaded:    ${status.loaded ? "yes" : "no"}`);
      console.log(`  Workspace: ${status.workspace}`);
      console.log(`  Plist:     ${status.plistPath}`);
      console.log(`  Launcher:  ${status.runScript}\n`);
      break;
    }
    default:
      console.error(`Unknown pip autostart command: ${sub}\n`);
      pipAutostartUsage();
      process.exit(1);
  }
}

async function cmdBridgeAutostart(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (!sub || sub === "--help" || sub === "-h") {
    bridgeAutostartUsage();
    return;
  }

  switch (sub) {
    case "install": {
      const wsFlag = rest.indexOf("--workspace");
      const workspace = wsFlag >= 0 ? rest[wsFlag + 1] : undefined;
      const status = bridgeAutostartInstall(__dirname, workspace);
      console.log("\n✅ Chrome bridge will start at login\n");
      console.log(`  Workspace:   ${status.workspace}`);
      console.log(`  Extension:   ${status.extensionRoot}`);
      console.log(`  Launcher:    ${status.runScript}`);
      console.log(`  LaunchAgent: ${status.plistPath}`);
      console.log(`  Health:      http://127.0.0.1:8765/health\n`);
      break;
    }
    case "uninstall":
      bridgeAutostartUninstall(__dirname);
      console.log("\n✅ Removed Chrome bridge login autostart\n");
      break;
    case "status": {
      const status = bridgeAutostartStatus(__dirname);
      console.log("\nChrome bridge autostart\n");
      console.log(`  Installed: ${status.installed ? "yes" : "no"}`);
      console.log(`  Loaded:    ${status.loaded ? "yes" : "no"}`);
      console.log(`  Workspace: ${status.workspace}`);
      console.log(`  Extension: ${status.extensionRoot}`);
      console.log(`  Plist:     ${status.plistPath}`);
      console.log(`  Launcher:  ${status.runScript}\n`);
      break;
    }
    default:
      console.error(`Unknown bridge autostart command: ${sub}\n`);
      bridgeAutostartUsage();
      process.exit(1);
  }
}

async function cmdPipLaunch(): Promise<void> {
  let ws = resolveWorkspace();
  if (!existsSync(join(ws, "AGENTS.md"))) {
    console.log(`No workspace at ${ws} yet — setting one up (this is a one-time step)…`);
    const result = initWorkspace({ dir: ws });
    ws = result.dir;
    console.log(`✓ Workspace ready at ${ws}\n`);
  }

  process.env.TANDEM_WORKSPACE = ws;

  const pipRoot = findPipRoot();
  const distMain = join(pipRoot, "dist", "main.cjs");
  if (!existsSync(distMain)) {
    console.error("@tandem/pip is not built. Reinstall the package or run npm run build in apps/pip.");
    process.exit(1);
  }

  const electron = findElectronBin(pipRoot);
  const child = spawn(electron, [pipRoot], {
    stdio: "inherit",
    env: { ...process.env, TANDEM_WORKSPACE: ws },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

async function main(): Promise<void> {
  const [cmd, sub, ...rest] = process.argv.slice(2);
  // Args after the top-level command (e.g. `tandem init <dir> --force`).
  const cmdArgs = process.argv.slice(3);

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
      await cmdInit(cmdArgs);
      break;
    case "doctor":
      await cmdDoctor();
      break;
    case "pip":
    case "clippy": // back-compat alias
      if (sub === "autostart") {
        await cmdPipAutostart(rest);
      } else {
        await cmdPipLaunch();
      }
      break;
    case "bridge":
      if (sub === "autostart") {
        await cmdBridgeAutostart(rest);
      } else {
        console.error("Unknown bridge command. Try: tandem bridge autostart\n");
        bridgeAutostartUsage();
        process.exit(1);
      }
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
