import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SLACK_PKG_DIR } from "./paths.ts";
import { BOT_SCOPES, USER_SCOPES } from "./scopes.ts";

export interface OAuthPublicConfig {
  clientId?: string;
  redirectPort?: number;
  botScopes?: string[];
  userScopes?: string[];
}

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  /** Shared app-level token (connections:write) for Socket Mode — one per Tandem Slack app. */
  appToken: string;
  redirectPort: number;
  botScopes: string[];
  userScopes: string[];
}

export class OAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OAuthConfigError";
  }
}

function readPublicConfig(): OAuthPublicConfig {
  const paths = [
    join(SLACK_PKG_DIR, "oauth.public.json"),
    join(SLACK_PKG_DIR, "oauth.public.example.json"),
  ];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    try {
      return JSON.parse(readFileSync(p, "utf8")) as OAuthPublicConfig;
    } catch {
      /* try next */
    }
  }
  return {};
}

/**
 * Load OAuth credentials for the Tandem distributed Slack app.
 *
 * clientId may ship in oauth.public.json; secret + app token come from env
 * (never commit those — set them when you register the app on api.slack.com).
 */
export function loadOAuthCredentials(): OAuthCredentials {
  const pub = readPublicConfig();

  const clientId =
    process.env.TANDEM_SLACK_CLIENT_ID?.trim() || pub.clientId?.trim() || "";
  const clientSecret = process.env.TANDEM_SLACK_CLIENT_SECRET?.trim() || "";
  const appToken = process.env.TANDEM_SLACK_APP_TOKEN?.trim() || "";

  const missing: string[] = [];
  if (!clientId) missing.push("TANDEM_SLACK_CLIENT_ID (or oauth.public.json clientId)");
  if (!clientSecret) missing.push("TANDEM_SLACK_CLIENT_SECRET");
  if (!appToken) missing.push("TANDEM_SLACK_APP_TOKEN");

  if (missing.length) {
    throw new OAuthConfigError(
      `Tandem Slack OAuth is not configured. Set:\n${missing.map((m) => `  • ${m}`).join("\n")}\n\n` +
        "Register a distributed app at https://api.slack.com/apps → Activate Public Distribution,\n" +
        "add redirect URL http://127.0.0.1:8767/oauth/callback, create an app-level token (connections:write).\n" +
        "Or run `tandem slack setup` for manual token entry.",
    );
  }

  if (!appToken.startsWith("xapp-")) {
    throw new OAuthConfigError("TANDEM_SLACK_APP_TOKEN must start with xapp-");
  }

  return {
    clientId,
    clientSecret,
    appToken,
    redirectPort: Number(process.env.TANDEM_SLACK_OAUTH_PORT ?? pub.redirectPort ?? 8767),
    botScopes: pub.botScopes?.length ? pub.botScopes : [...BOT_SCOPES],
    userScopes: pub.userScopes?.length ? pub.userScopes : [...USER_SCOPES],
  };
}

/** True when distributed OAuth can run (credentials present). */
export function hasOAuthCredentials(): boolean {
  try {
    loadOAuthCredentials();
    return true;
  } catch {
    return false;
  }
}
