# Pip — Tandem's desktop coworker

A frameless AI coworker on your desktop — Pip is Tandem's **visual** surface: a general AI assistant,
not a task board.

## Naming

| Layer | Name | What it is |
|---|---|---|
| **Product** | Tandem | Ambient AI coworker across Slack, desktop, and Chrome |
| **Desktop** | **Pip** | Pip on your screen (this app) |
| **Slack teammate** | **Pip** (`@Pip`) | Team channels and DMs |
| **Browser** | **Pip** | Chrome extension for page-aware Q&A |
| **Brain** | PM OS | Skills, knowledge, and memory on disk |

## Install (no GitHub required)

```bash
npm install -g @tandem/cli @tandem/pip
tandem init
tandem pip
```

## Run from source (macOS)

```bash
npm start          # from this directory, or: npm run pip (from repo root)
# or after building packages:
tandem pip
```

### Start at login (macOS)

Pip can auto-start when you log in — uses a LaunchAgent with `cursor-agent` on your PATH:

```bash
tandem pip autostart install
tandem pip autostart status
tandem pip autostart uninstall
```

This writes `~/Library/LaunchAgents/com.tandem.pip.plist`, `~/.tandem/autostart.env`
(workspace path), and `~/.tandem/launch-pip.sh` (launcher with Node + cursor-agent PATH).
Logs: `/tmp/tandem-pip.out.log` and `/tmp/tandem-pip.err.log`.

- **Click** Pip (bottom-right) to open the ask bar · **right-click** for menu
- **⌘⇧T** — snip any region of your screen and get an answer
- **⌘⇧Space** — summon Pip to your cursor · **⌘N** — summon + voice input · **⌘⇧H** — hide/show Pip (meeting-safe)
- Type a question and press ↵ — Pip runs against PM OS on disk
- Drag Pip near any edge to **snap** it flush; leave it idle and it **peeks** to the edge, returning on hover

## Voice

- **Spoken replies** (macOS `say`): right-click Pip → **Speak replies**. The ember pulses while Pip
  talks; **tap Pip to hush** it. Persisted across restarts; seed the default with `voice.speakReplies`.
- **Talk / ⌘N**: speak, pause — Pip auto-detects when you stop (~1.3s silence) and transcribes. Click **Talk** again to cancel early. First use downloads a small Whisper model once (~40MB).

## Monitor dashboard

While Pip is running, a local web UI logs every ask, screenshot, capture, and groom:

**http://127.0.0.1:8791**

- **Active** — in-flight requests (live via SSE)
- **History** — past requests with question, response, duration, and screenshot previews
- Right-click Pip → **Open monitor**, or open the URL in a browser

Logs persist at `{workspace}/.tandem/pip-requests.json`. Disable or change port in `config.json`:

```json
{ "monitor": { "enabled": true, "port": 8791 } }
```

Tasks still live in `tasks.md` (editable via right-click → Open tasks.md) but are not shown in the UI.

**Placement:** Pip sits in the **top-right** (below the menu bar). The ask bar extends left;
replies drop **down** underneath so they're easy to read. Override in `config.json`:
`{ "placement": { "corner": "bottom-right", "margin": 18 } }`.

## Point it at your tasks
By default it reads `tasks.example.md` at the repo root. To use your own file, create
`config.json` here (gitignored) and override:
```json
{ "tasksFile": "/absolute/path/to/your/tasks.md" }
```

## tasks.md contract
Exactly four `##` sections; `## Archive` / `## Done` / `## How to use` / `---` ends parsing.
```markdown
## Active (priority today)
- [ ] Ship the launch gate #project/x #p0
  - Due: 2026-07-02
  - Next action: …
## Needs triage
- [ ] Look into … #from/self #p2
```
Tasks are keyed by line number, so moves and toggles are line-faithful — the rest of the file is
never reflowed.

## Package
```bash
npm run package    # electron-packager → release/ (darwin arm64)
```
Run at login via a Login Item, Raycast, or Hammerspoon.
