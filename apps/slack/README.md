# Tandem — Slack coworker

**Tandem** is the team surface of the ecosystem — tag `@Tandem` in a channel or DM it. Your message runs
as a `cursor-agent` task in the workspace (with PM OS on disk) and the answer posts back in-thread.

| Surface | Name | Where |
|---|---|---|
| Product | **Tandem** | The ambient coworker |
| Slack | **Tandem** (`@Tandem`) | Team channels & DMs |
| Desktop | **Pip** | Buddy orb on your screen |
| Browser | **Lens** | Chrome extension |
| Brain | **PM OS** | Skills, knowledge, memory |

> If your Slack sidebar still says **demo_app**, rename it under [api.slack.com/apps](https://api.slack.com/apps) → your app → **Basic Information** → **App Name** → **Tandem**.

## Setup

### 1. Create the Slack app
Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From a manifest**, and
paste [`manifest.json`](./manifest.json). Then:

- **App-Level Token** (Basic Information → App-Level Tokens) with `connections:write` → `SLACK_APP_TOKEN` (`xapp-…`)
- **Install to workspace** → **Bot User OAuth Token** → `SLACK_BOT_TOKEN` (`xoxb-…`)
- **User OAuth Token** (only for the polling fallback) → `SLACK_USER_TOKEN` (`xoxp-…`)

### 2. Configure
```bash
cp .env.example .env
```
Fill in the three tokens and **`ALLOWED_USERS`** (your Slack member ID — find it via your profile →
**⋮** → *Copy member ID*). Leaving it empty lets anyone run commands, which means anyone can make the
agent run shell on your machine. Don't.

### 3. Run
```bash
npm start          # from this directory, or: npm run slack (from repo root)
```

Invite the bot to a channel (`/invite @Tandem`), then `@Tandem summarize this thread and draft a reply`.

## Commands
- `@Tandem <anything>` — run a task.
- `open thread` *(owner only)* — let non-owners use Tandem in this thread for a TTL.
- `close thread` *(owner only)* — revoke it.

## Always-on (macOS)
Use the `launchd` LaunchAgent (`com.tandem.slack.plist.example`), **not cron** — cron can't reach the
keychain/GUI session that `cursor-agent` auth needs.

```bash
cp com.tandem.slack.plist.example ~/Library/LaunchAgents/com.tandem.slack.plist
# edit the path inside, then:
launchctl load ~/Library/LaunchAgents/com.tandem.slack.plist
```
