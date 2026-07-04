# Pip — Tandem's browser surface

**Pip** is Tandem's page-aware Chrome extension — it reads whatever tab you're on (a ticket, a doc,
a dashboard) and answers questions through a local bridge that calls the Cursor CLI against PM OS.

## Naming

| Layer | Name |
|---|---|
| Product | **Tandem** |
| This extension | **Pip** (shows in Chrome as *Tandem Pip*) |
| Desktop buddy | **Pip** |
| Slack teammate | **Pip** (`@Pip`) |
| Brain | **PM OS** |

## Run

```bash
# 1. Build the extension
npm run build              # or: npm run chrome:build (from repo root)

# 2. Start the local bridge (it shells out to cursor-agent)
cp .env.example .env       # optional — defaults are fine
npm run bridge             # → http://127.0.0.1:8765
```

Then load it in Chrome:
1. `chrome://extensions` → enable **Developer mode**
2. **Load unpacked** → select `apps/chrome-extension/dist`
3. Pin **Tandem Pip**, open any page, click the icon — or press **⌘B** to summon Pip in-page.
4. Set the shortcut at `chrome://extensions/shortcuts` if **⌘B** conflicts with another extension.

## How it works
- `content.ts` extracts page context (title, URL, selection, excerpt).
- `popup.ts` shows page-aware suggestions and posts to the bridge.
- `bridge/server.ts` runs the agent in **read-only `ask` mode**, bound to `127.0.0.1` only.

The bridge never writes to disk or runs shell on your behalf — it's the safe, browser-facing surface.
