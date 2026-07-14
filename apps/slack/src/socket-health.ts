import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SLACK_PKG_DIR } from "./paths.ts";

const MANIFEST_PATH = join(SLACK_PKG_DIR, "manifest.json");

export async function isSocketModeEnabled(appToken: string): Promise<boolean> {
  const res = await fetch("https://slack.com/api/apps.connections.open", {
    method: "POST",
    headers: { Authorization: `Bearer ${appToken}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const data = (await res.json()) as { response_metadata?: { messages?: string[] } };
  const msgs = data.response_metadata?.messages ?? [];
  return !msgs.some((m) => m.includes("Socket Mode is not turned on"));
}

export async function pushManifest(configToken: string, appId: string): Promise<boolean> {
  const manifest = readFileSync(MANIFEST_PATH, "utf8");
  const res = await fetch("https://slack.com/api/apps.manifest.update", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ app_id: appId, manifest }),
  });
  const data = (await res.json()) as { ok: boolean; error?: string; errors?: unknown[] };
  if (!data.ok) {
    console.error("✗ apps.manifest.update failed:", data.error, data.errors ?? "");
    return false;
  }
  console.log("✓ Manifest pushed (socket_mode_enabled + app_mention events)");
  return true;
}

/** Turn on real-time Socket Mode delivery when possible; warn + open Slack UI otherwise. */
export async function ensureRealtimeDelivery(appToken: string, appId: string): Promise<void> {
  if (await isSocketModeEnabled(appToken)) {
    console.log("✓ Socket Mode on — instant @mention delivery");
    return;
  }

  const configToken = process.env.SLACK_CONFIG_TOKEN?.trim();
  if (configToken) {
    console.log("→ Socket Mode off — pushing manifest via SLACK_CONFIG_TOKEN…");
    await pushManifest(configToken, appId);
    await new Promise((r) => setTimeout(r, 2000));
    if (await isSocketModeEnabled(appToken)) {
      console.log("✓ Socket Mode enabled via manifest update");
      return;
    }
  }

  const url = `https://api.slack.com/apps/${appId}/socket-mode`;
  console.warn(
    `⚠ Socket Mode is OFF — using fast channel polling until enabled.\n` +
      `  Enable once for instant replies: ${url}\n` +
      `  Or run: npm run slack:activate`,
  );
}
