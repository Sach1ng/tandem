import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { RequestLog, PipRequest } from "./request-log.ts";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolveBody(raw));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function isScreenshotPath(workspace: string, filePath: string): boolean {
  const root = resolve(join(workspace, ".tandem", "screenshots"));
  const abs = resolve(filePath);
  return abs === root || abs.startsWith(`${root}/`);
}

export interface MonitorServerOptions {
  port: number;
  workspace: string;
  monitorDir: string;
  log: RequestLog;
}

export function startMonitorServer(opts: MonitorServerOptions): ReturnType<typeof createServer> {
  const clients = new Set<ServerResponse>();

  const broadcast = (req: PipRequest) => {
    const payload = `data: ${JSON.stringify({ type: "update", request: req })}\n\n`;
    for (const client of clients) {
      try {
        client.write(payload);
      } catch {
        clients.delete(client);
      }
    }
  };

  opts.log.on("update", broadcast);

  const server = createServer(async (req, res) => {
    // Loopback Host only — the log holds Pip's answers + screenshots, so block DNS-rebinding where a
    // public hostname is pointed at 127.0.0.1 to let a web page read the local monitor.
    const hostName = (req.headers.host ?? "").toLowerCase().split(":")[0];
    if (!(hostName === "127.0.0.1" || hostName === "localhost" || hostName === "[::1]" || hostName === "::1")) {
      res.writeHead(403).end("forbidden");
      return;
    }

    const url = new URL(req.url ?? "/", `http://127.0.0.1:${opts.port}`);
    const path = url.pathname;

    if (req.method === "GET" && path === "/api/health") {
      json(res, 200, {
        ok: true,
        active: opts.log.active().length,
        total: opts.log.list().length,
        workspace: opts.workspace,
      });
      return;
    }

    if (req.method === "GET" && path === "/api/requests") {
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));
      json(res, 200, { requests: opts.log.list(limit) });
      return;
    }

    if (req.method === "GET" && path === "/api/requests/active") {
      json(res, 200, { requests: opts.log.active() });
      return;
    }

    if (req.method === "GET" && path === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify({ type: "hello", requests: opts.log.list(50) })}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    if (req.method === "GET" && path === "/api/screenshot") {
      const file = url.searchParams.get("path") ?? "";
      if (!file || !existsSync(file) || !isScreenshotPath(opts.workspace, file)) {
        res.writeHead(404).end();
        return;
      }
      const ext = extname(file).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
      createReadStream(file).pipe(res);
      return;
    }

    if (req.method === "POST" && path === "/api/requests/clear") {
      await readBody(req);
      // Monitor is read-only against the live log; clearing is a future opt-in.
      json(res, 405, { error: "not supported" });
      return;
    }

    let filePath = path === "/" ? "/index.html" : path;
    const safe = resolve(opts.monitorDir, `.${filePath}`);
    if (!safe.startsWith(resolve(opts.monitorDir)) || !existsSync(safe)) {
      res.writeHead(404).end("Not found");
      return;
    }
    const ext = extname(safe).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    createReadStream(safe).pipe(res);
  });

  server.listen(opts.port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${opts.port}`;
    console.log(`Pip monitor: ${url}`);
  });

  return server;
}

export function screenshotApiUrl(port: number, filePath: string): string {
  return `http://127.0.0.1:${port}/api/screenshot?path=${encodeURIComponent(filePath)}`;
}
