import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolveWorkspace } from "@tandem/core";
import { hydrateSlackEnv } from "@tandem/slack/config";
import { runSlackConnect, hasOAuthCredentials, isSlackConnected } from "@tandem/slack/oauth";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function findSlackRoot(): string {
  try {
    return dirname(require.resolve("@tandem/slack/package.json"));
  } catch {
    const dev = resolve(__dirname, "../../../apps/slack");
    if (existsSync(join(dev, "package.json"))) return dev;
    throw new Error("@tandem/slack is not installed. Run: npm install -g @tandem/cli @tandem/slack");
  }
}

export async function cmdSlackConnect(args: string[]): Promise<void> {
  const portArg = args.find((a) => a.startsWith("--port="));
  const port = portArg ? Number(portArg.split("=")[1]) : undefined;
  const noBrowser = args.includes("--no-browser");

  if (!hasOAuthCredentials()) {
    console.error(
      "Tandem Slack OAuth credentials are not configured on this install.\n\n" +
        "The maintainer must set (or ship in oauth.public.json):\n" +
        "  TANDEM_SLACK_CLIENT_ID\n" +
        "  TANDEM_SLACK_CLIENT_SECRET\n" +
        "  TANDEM_SLACK_APP_TOKEN\n\n" +
        "See apps/slack/README.md — or use manual setup: tandem slack setup",
    );
    process.exit(1);
  }

  const ws = resolveWorkspace();
  process.env.TANDEM_WORKSPACE = ws;

  try {
    const result = await runSlackConnect({ port, openBrowser: !noBrowser });
    console.log(`\n✅ Slack connected to *${result.teamName}*`);
    console.log(`   Team ID:    ${result.teamId}`);
    console.log(`   Bot user:   ${result.botUserId}`);
    console.log(`   Owner:      ${result.ownerUserId} (ALLOWED_USERS)`);
    console.log(`   Config:     ${result.envPath}\n`);
    console.log("Next: tandem slack start");
    console.log("Then in Slack: /invite @Pip to a channel, @Pip say hi\n");
  } catch (err) {
    console.error("\n❌ Slack connect failed:", (err as Error).message ?? err);
    process.exit(1);
  }
}

export async function cmdSlackStart(): Promise<void> {
  const ws = resolveWorkspace();
  if (!existsSync(join(ws, "AGENTS.md"))) {
    console.error(`No Tandem workspace at ${ws}. Run: tandem init`);
    process.exit(1);
  }

  hydrateSlackEnv();
  process.env.TANDEM_WORKSPACE = ws;

  if (!isSlackConnected()) {
    console.error("Slack is not connected. Run: tandem slack connect");
    process.exit(1);
  }

  const slackRoot = findSlackRoot();
  const app = join(slackRoot, "dist", "app.cjs");
  if (!existsSync(app)) {
    console.error("@tandem/slack is not built. Reinstall or run npm run build in apps/slack.");
    process.exit(1);
  }

  const child = spawn(process.execPath, [app], {
    stdio: "inherit",
    env: { ...process.env, TANDEM_WORKSPACE: ws, TANDEM_SLACK_PKG_DIR: slackRoot },
    cwd: slackRoot,
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

export async function cmdSlackSetup(): Promise<void> {
  const slackRoot = findSlackRoot();
  const setupScript = join(slackRoot, "dist", "setup.cjs");
  const devSetup = join(slackRoot, "scripts", "setup-server.ts");

  if (existsSync(setupScript)) {
    const child = spawn(process.execPath, [setupScript], { stdio: "inherit", env: process.env });
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }

  if (existsSync(devSetup)) {
    const child = spawn("npx", ["tsx", devSetup], { stdio: "inherit", env: process.env, cwd: slackRoot });
    child.on("exit", (code) => process.exit(code ?? 0));
    return;
  }

  console.error("Setup wizard not found. Use: tandem slack connect");
  process.exit(1);
}

export function cmdSlackStatus(): void {
  hydrateSlackEnv();
  const connected = isSlackConnected();
  const oauthReady = hasOAuthCredentials();
  const ws = resolveWorkspace();

  console.log("\nTandem Slack status\n");
  console.log(`  Workspace:     ${ws}`);
  console.log(`  OAuth ready:   ${oauthReady ? "yes (distributed app configured)" : "no — use tandem slack setup"}`);
  console.log(`  Connected:     ${connected ? "yes" : "no — run tandem slack connect"}`);
  if (connected) {
    console.log(`  Bot token:     ${process.env.SLACK_BOT_TOKEN?.slice(0, 12)}…`);
    console.log(`  Owners:        ${process.env.ALLOWED_USERS || "(none)"}`);
  }
  console.log();
}

export function slackUsage(): void {
  console.log(`Slack coworker commands:

  tandem slack connect [--port=8767] [--no-browser]
      OAuth install — opens Slack "Allow" screen, saves tokens locally

  tandem slack start
      Run the Socket Mode bot (requires connect first)

  tandem slack setup
      Manual token wizard (fallback if OAuth not configured)

  tandem slack status
      Show connection state
`);
}
