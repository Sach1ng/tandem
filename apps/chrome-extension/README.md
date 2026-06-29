# Lens — Tandem's browser surface

**Lens** is Tandem's page-aware Chrome extension — it reads whatever tab you're on (a ticket, a doc,
a dashboard) and answers questions through a local bridge that calls the Cursor CLI against PM OS.

## Naming

| Layer | Name |
|---|---|
| Product | **Tandem** |
| This extension | **Lens** (shows in Chrome as *Tandem Lens*) |
| Desktop buddy | **Pip** |
| Slack teammate | **Tandem** (`@Tandem`) |
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
3. Pin **Tandem Lens**, open any page, click the icon. Or select text → right-click → *Ask Lens*.

## How it works
- `content.ts` extracts page context (title, URL, selection, excerpt).
- `popup.ts` shows page-aware suggestions and posts to the bridge.
- `bridge/server.ts` runs the agent in **read-only `ask` mode**, bound to `127.0.0.1` only.

The bridge never writes to disk or runs shell on your behalf — it's the safe, browser-facing surface.
