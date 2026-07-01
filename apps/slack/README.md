# Pip — Tandem's Slack coworker

**Pip** is the team surface of Tandem — tag `@Pip` in a channel or DM it. Your message runs
as a `cursor-agent` task in the workspace (with PM OS on disk) and the answer posts back in-thread.

| Surface | Name | Where |
|---|---|---|
| Product | **Tandem** | The ambient coworker |
| Slack | **Pip** (`@Pip`) | Team channels & DMs |
| Desktop | **Pip** | Buddy orb on your screen |
| Browser | **Pip** | Chrome extension |
| Brain | **PM OS** | Skills, knowledge, memory |

> If your Slack sidebar still says **demo_app**, rename it under [api.slack.com/apps](https://api.slack.com/apps) → your app → **Basic Information** → **App Name** → **Pip**.

## Install (no GitHub required)

```bash
npm install -g @tandem/cli @tandem/slack
tandem init
tandem slack connect    # OAuth — one "Allow" click in Slack
tandem slack start
```

## Connect via OAuth (recommended)

Prerequisites on **your machine** (once):

1. Register the Pip distributed app at [api.slack.com/apps](https://api.slack.com/apps)
2. Paste [`manifest.json`](./manifest.json) → create app
3. **OAuth & Permissions** → Redirect URLs → add `http://127.0.0.1:8767/oauth/callback`
4. **Manage Distribution** → complete checklist → **Activate Public Distribution**
5. **Basic Information** → App-Level Tokens → create token with `connections:write` → copy `xapp-…`
6. Set credentials (do not commit secrets):

```bash
export TANDEM_SLACK_CLIENT_ID=1234567890.1234567890
export TANDEM_SLACK_CLIENT_SECRET=your-client-secret
export TANDEM_SLACK_APP_TOKEN=xapp-1-…
```

Optionally put `clientId` in `oauth.public.json` (public); secret and app token stay in env.

Then each user:

```bash
tandem slack connect
tandem slack start
```

Tokens are saved to `~/.tandem/slack/.env` on the user's machine.

## Manual setup (fallback)

If OAuth credentials are not configured:

```bash
tandem slack setup
```

Opens a browser wizard to paste `xoxb-`, `xapp-`, and `xoxp-` tokens manually.

## Commands

- `@Pip <anything>` — run a task
- `open thread` *(owner only)* — let non-owners use Pip in this thread
- `close thread` *(owner only)* — revoke it

## CLI reference

```bash
tandem slack connect [--port=8767] [--no-browser]
tandem slack start
tandem slack setup
tandem slack status
```

## Always-on (macOS)

Use the `launchd` LaunchAgent (`com.tandem.slack.plist.example`), **not cron** — cron can't reach the
keychain/GUI session that `cursor-agent` auth needs.

## Develop from source

```bash
npm run build
cp .env.example .env   # or tandem slack connect
npm start              # from apps/slack, or: npm run slack from repo root
```

Setup wizard: `npm run setup` or `tandem slack setup`

Reinstall manifest to an existing app: `npm run reinstall`
