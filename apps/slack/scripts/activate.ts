/**
 * One-shot: install always-on service + enable Socket Mode for instant delivery.
 * Run: npm run slack:activate
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureRealtimeDelivery, isSocketModeEnabled } from "../src/socket-health.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SLACK_DIR = join(__dirname, "..");
const APP_ID = process.env.SLACK_APP_ID?.trim() || "A0BDPE7D7KQ";

async function waitForSocketMode(appToken: string, seconds: number): Promise<boolean> {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (await isSocketModeEnabled(appToken)) return true;
    await new Promise((r) => setTimeout(r, 2000));
    process.stdout.write(".");
  }
  return false;
}

async function main(): Promise<void> {
  const appToken = process.env.SLACK_APP_TOKEN?.trim();
  if (!appToken) {
    console.error("Missing SLACK_APP_TOKEN — run npm run slack:setup first.");
    process.exit(1);
  }

  console.log("→ Installing always-on launchd service…");
  execSync("npm run install-service", { cwd: SLACK_DIR, stdio: "inherit" });

  await ensureRealtimeDelivery(appToken, APP_ID);

  if (await isSocketModeEnabled(appToken)) {
    console.log("\n✅ Pip Slack is always-on with instant Socket Mode delivery.");
    return;
  }

  console.log("\n→ Waiting up to 90s for Socket Mode to be enabled in the browser…");
  console.log("  Toggle ON at: https://api.slack.com/apps/" + APP_ID + "/socket-mode");
  try {
    execSync(`open "https://api.slack.com/apps/${APP_ID}/socket-mode"`);
  } catch {
    /* */
  }

  const ok = await waitForSocketMode(appToken, 90);
  console.log("");
  if (ok) {
    const gui = `gui/${process.getuid?.() ?? execSync("id -u", { encoding: "utf8" }).trim()}`;
    execSync(`launchctl kickstart -k ${gui}/com.tandem.slack`);
    console.log("✅ Socket Mode on — restarted bot for instant delivery.");
  } else {
    console.log(
      "⚠ Socket Mode still off. Add SLACK_CONFIG_TOKEN to .env (config token from api.slack.com) and re-run:\n" +
        "  npm run slack:activate",
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("✗ activate failed:", err?.message ?? err);
  process.exit(1);
});
