/** Bot scopes — must match the Pip distributed Slack app (see manifest.json). */
export const BOT_SCOPES = [
  "channels:history",
  "channels:join",
  "channels:read",
  "chat:write",
  "chat:write.public",
  "groups:history",
  "groups:read",
  "im:history",
  "im:read",
  "im:write",
  "mpim:history",
  "mpim:read",
  "mpim:write",
  "users:read",
  "team:read",
  "links:read",
] as const;

/** User scopes — optional polling fallback (search.messages). */
export const USER_SCOPES = ["search:read", "search:read.public"] as const;
