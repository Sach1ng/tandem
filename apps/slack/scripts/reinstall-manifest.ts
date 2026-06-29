/**
 * Push manifest.json to Slack and open the reinstall page.
 * Needs a one-time config token from api.slack.com/apps → Your App Configuration Tokens.
 * Run: npm run slack:reinstall
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebClient } from "@slack/web-api";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SLACK_DIR = join(__dirname, "..");
const ENV_PATH = join(SLACK_DIR, ".env");
const MANIFEST_PATH = join(SLACK_DIR, "manifest.json");
const APP_ID = process.env.SLACK_APP_ID?.trim();

async function main(): Promise<void> {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const manifestStr = JSON.stringify(manifest);

  const bot = new WebClient(process.env.SLACK_BOT_TOKEN);
  const auth = await bot.auth.test();
  if (!auth.ok) throw new Error(`Bot auth failed: ${auth.error}`);

  const appId =
    APP_ID ||
    (auth as { api_app_id?: string }).api_app_id ||
    (await bot.users.info({ user: auth.user_id! })).user?.profile?.api_app_id;
  if (!appId) {
    throw new Error("Could not resolve app_id — set SLACK_APP_ID in .env (find it on api.slack.com/apps → Basic Information)");
  }

  console.log(`App ID: ${appId}`);
  console.log(`Current bot @handle: ${auth.user} (${auth.team})`);

  const configToken = process.env.SLACK_CONFIG_TOKEN?.trim();
  let permissionsUpdated = false;

  if (configToken) {
    console.log("\n→ Updating manifest via apps.manifest.update…");
    const res = await fetch("https://slack.com/api/apps.manifest.update", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ app_id: appId, manifest: manifestStr }),
    });
    const data = (await res.json()) as {
      ok: boolean;
      error?: string;
      permissions_updated?: boolean;
      errors?: unknown[];
    };
    if (!data.ok) {
      console.error("✗ manifest.update failed:", data.error, data.errors ?? "");
      process.exit(1);
    }
    permissionsUpdated = Boolean(data.permissions_updated);
    console.log(`✓ Manifest updated (permissions_updated=${permissionsUpdated})`);
  } else {
    console.log("\n⚠ SLACK_CONFIG_TOKEN not set — skipping API manifest push.");
    console.log("  Generate one: api.slack.com/apps → Your App Configuration Tokens → Generate Token");
    console.log("  Then add to apps/slack/.env: SLACK_CONFIG_TOKEN=xoxe-...");
    try {
      execSync("pbcopy", { input: manifestStr });
      console.log("✓ Manifest copied to clipboard — paste it in the App Manifest editor if needed.");
    } catch {
      /* non-macOS */
    }
  }

  const installUrl = `https://api.slack.com/apps/${appId}/install-on-team`;
  const manifestUrl = `https://api.slack.com/apps/${appId}/app-manifest`;

  console.log("\n→ Opening reinstall page in your browser…");
  console.log(`  ${installUrl}`);
  try {
    execSync(`open "${installUrl}"`);
    if (!configToken) execSync(`open "${manifestUrl}"`);
  } catch {
    console.log("  (Open the URL above manually.)");
  }

  console.log(`
Next steps in the browser (≈30 seconds):
  1. If manifest editor opened: paste manifest → Save Changes
  2. On Install App → click **Reinstall to Workspace** → Allow
  3. Run: npm run slack:smoke
     You should see: bot connected: tandem @ ${auth.team}
`);

  if (permissionsUpdated) {
    console.log("⚠ permissions_updated=true — reinstall is required for bot name change to apply.\n");
  }

  // Persist app id for next run
  if (!APP_ID && appId) {
    try {
      const env = readFileSync(ENV_PATH, "utf8");
      if (!env.includes("SLACK_APP_ID=")) {
        writeFileSync(ENV_PATH, env.trimEnd() + `\nSLACK_APP_ID=${appId}\n`);
        console.log(`✓ Saved SLACK_APP_ID=${appId} to .env`);
      }
    } catch {
      /* .env may not exist */
    }
  }
}

main().catch((err) => {
  console.error("✗ reinstall helper failed:", err?.message ?? err);
  process.exit(1);
});
