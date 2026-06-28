# Tandem — Chrome extension

Ambient, page-aware prompts. Tandem reads the page you're on (a ticket, a doc, a dashboard) and
answers questions about it — through a tiny local bridge that calls the Cursor CLI against your
PM OS workspace.

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
3. Pin Tandem, open any page, click the icon. Or select text → right-click → *Ask Tandem*.

## How it works
- `content.ts` extracts page context (title, URL, selection, excerpt).
- `popup.ts` shows page-aware suggestions and posts to the bridge.
- `bridge/server.ts` runs the agent in **read-only `ask` mode**, bound to `127.0.0.1` only.

The bridge never writes to disk or runs shell on your behalf — it's the safe, browser-facing surface.
