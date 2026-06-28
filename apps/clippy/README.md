# Pip — Tandem's desktop buddy

A frameless buddy orb on your desktop — Pip is Tandem's **visual** surface: a general AI assistant,
not a task board.

## Naming

| Layer | Name | What it is |
|---|---|---|
| **Product** | Tandem | Ambient AI coworker across Slack, desktop, and Chrome |
| **Desktop buddy** | **Pip** | The orb on your screen (this app) |
| **Brain** | PM OS | Skills, knowledge, and memory on disk |

## Run (macOS)
```bash
npm start          # from this directory, or: npm run clippy (from repo root)
```

- **Click** Pip to open the ask card · **right-click** for menu
- **⌘⇧T** — snip any region of your screen and get an answer
- Type a question and press ↵ — Pip runs against PM OS on disk

Tasks still live in `tasks.md` (editable via right-click → Open tasks.md) but are not shown in the UI.

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
