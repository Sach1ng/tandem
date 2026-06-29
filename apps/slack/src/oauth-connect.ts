import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { resolveWorkspace } from "@tandem/core";
import { loadOAuthCredentials, OAuthConfigError } from "./oauth-config.ts";
import { writeEnvFile } from "./env-file.ts";
import { slackConfigDir, slackEnvPath, slackInstallationPath } from "./paths.ts";

const execFileAsync = promisify(execFile);

export interface SlackConnectResult {
  teamName: string;
  teamId: string;
  botUserId: string;
  ownerUserId: string;
  configDir: string;
  envPath: string;
}

interface OAuthAccessResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  bot_user_id?: string;
  team?: { id?: string; name?: string };
  authed_user?: { id?: string; access_token?: string };
}

export interface SlackConnectOptions {
  port?: number;
  openBrowser?: boolean;
  timeoutMs?: number;
}

function redirectUri(port: number): string {
  return `http://127.0.0.1:${port}/oauth/callback`;
}

function buildAuthorizeUrl(creds: ReturnType<typeof loadOAuthCredentials>, state: string, port: number): string {
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", creds.clientId);
  url.searchParams.set("scope", creds.botScopes.join(","));
  if (creds.userScopes.length) url.searchParams.set("user_scope", creds.userScopes.join(","));
  url.searchParams.set("redirect_uri", redirectUri(port));
  url.searchParams.set("state", state);
  return url.toString();
}

async function exchangeCode(
  creds: ReturnType<typeof loadOAuthCredentials>,
  code: string,
  port: number,
): Promise<OAuthAccessResponse> {
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    code,
    redirect_uri: redirectUri(port),
  });

  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json()) as OAuthAccessResponse;
  if (!data.ok) {
    throw new Error(`Slack OAuth token exchange failed: ${data.error ?? "unknown error"}`);
  }
  if (!data.access_token?.startsWith("xoxb-")) {
    throw new Error("OAuth response missing bot token (xoxb-)");
  }
  return data;
}

function successHtml(team: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Tandem — Slack connected</title>
<style>body{font:16px system-ui,sans-serif;background:#0f1117;color:#e8eaed;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#1a1d27;border:1px solid #2a2f3a;border-radius:12px;padding:32px;max-width:420px;text-align:center}
h1{font-size:1.25rem;margin:0 0 8px}p{color:#9aa0a6;margin:0}</style></head>
<body><div class="card"><h1>✅ Connected to ${team}</h1><p>You can close this tab and return to the terminal.</p>
<p style="margin-top:16px">Run <code>tandem slack start</code> to launch the bot.</p></div></body></html>`;
}

function errorHtml(message: string): string {
  const safe = message.replace(/</g, "&lt;");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Tandem — Connection failed</title>
<style>body{font:16px system-ui,sans-serif;background:#0f1117;color:#e8eaed;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#3a1a1a;border:1px solid #5a2a2a;border-radius:12px;padding:32px;max-width:480px;text-align:center}
h1{font-size:1.25rem;margin:0 0 8px}p{color:#ffb4b4;margin:0;word-break:break-word}</style></head>
<body><div class="card"><h1>Connection failed</h1><p>${safe}</p></div></body></html>`;
}

async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  try {
    if (platform === "darwin") await execFileAsync("open", [url]);
    else if (platform === "win32") await execFileAsync("cmd", ["/c", "start", "", url]);
    else await execFileAsync("xdg-open", [url]);
  } catch {
    console.log(`Open this URL in your browser:\n${url}\n`);
  }
}

function persistInstallation(data: OAuthAccessResponse, creds: ReturnType<typeof loadOAuthCredentials>): SlackConnectResult {
  const configDir = slackConfigDir();
  const envPath = slackEnvPath();
  const ownerUserId = data.authed_user?.id ?? "";
  const userToken = data.authed_user?.access_token;

  if (!ownerUserId) {
    throw new Error("OAuth response missing authed_user.id — cannot set ALLOWED_USERS");
  }

  writeFileSync(
    slackInstallationPath(),
    JSON.stringify(
      {
        connectedAt: new Date().toISOString(),
        team: data.team,
        bot_user_id: data.bot_user_id,
        authed_user: { id: ownerUserId },
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const ws = resolveWorkspace();
  writeEnvFile(envPath, {
    SLACK_BOT_TOKEN: data.access_token,
    SLACK_APP_TOKEN: creds.appToken,
    SLACK_USER_TOKEN: userToken?.startsWith("xoxp-") ? userToken : undefined,
    ALLOWED_USERS: ownerUserId,
    TANDEM_WORKSPACE: ws,
    CURSOR_BIN: "cursor-agent",
    CURSOR_MODEL: "auto",
    MAX_RUNTIME_MS: "600000",
    OPEN_THREAD_TTL_MS: "72000000",
  });

  return {
    teamName: data.team?.name ?? "workspace",
    teamId: data.team?.id ?? "",
    botUserId: data.bot_user_id ?? "",
    ownerUserId,
    configDir,
    envPath,
  };
}

/**
 * Run Slack OAuth v2 install flow — opens browser, receives callback on localhost,
 * exchanges code for tokens, writes ~/.tandem/slack/.env
 */
export async function runSlackConnect(opts: SlackConnectOptions = {}): Promise<SlackConnectResult> {
  const creds = loadOAuthCredentials();
  const port = opts.port ?? creds.redirectPort;
  const state = randomBytes(24).toString("hex");
  const authUrl = buildAuthorizeUrl(creds, state, port);
  const timeoutMs = opts.timeoutMs ?? 300_000;

  console.log("\nConnecting Tandem to Slack…\n");
  console.log(`Redirect URI: ${redirectUri(port)}`);
  console.log("(Must be registered in your Slack app → OAuth & Permissions → Redirect URLs)\n");

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`OAuth timed out after ${timeoutMs / 1000}s — try again.`)));
    }, timeoutMs);

    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);

      if (url.pathname !== "/oauth/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const err = url.searchParams.get("error");
      if (err) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(errorHtml(`Slack denied access: ${err}`));
        finish(() => reject(new Error(`Slack OAuth denied: ${err}`)));
        return;
      }

      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      if (!code || returnedState !== state) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(errorHtml("Invalid OAuth callback (missing code or state mismatch)."));
        finish(() => reject(new Error("Invalid OAuth callback")));
        return;
      }

      try {
        const data = await exchangeCode(creds, code, port);
        const result = persistInstallation(data, creds);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(successHtml(result.teamName));
        finish(() => resolve(result));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
        res.end(errorHtml(msg));
        finish(() => reject(e instanceof Error ? e : new Error(msg)));
      }
    });

    server.on("error", (err) => finish(() => reject(err)));

    server.listen(port, "127.0.0.1", async () => {
      console.log(`Listening for OAuth callback on ${redirectUri(port)}`);
      if (opts.openBrowser !== false) {
        console.log("Opening Slack authorization page…\n");
        await openBrowser(authUrl);
      } else {
        console.log(`Open this URL:\n${authUrl}\n`);
      }
    });
  });
}

export { OAuthConfigError, hasOAuthCredentials } from "./oauth-config.ts";

export function isSlackConnected(): boolean {
  return existsSync(slackEnvPath());
}
