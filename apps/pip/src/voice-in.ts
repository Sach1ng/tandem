import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function dictateBinary(appDir: string): string {
  return join(appDir, "dist", "dictate");
}

export function nativeVoiceAvailable(appDir: string): boolean {
  return process.platform === "darwin" && existsSync(dictateBinary(appDir));
}

export interface VoiceInHandlers {
  onReady?: () => void;
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (code: string) => void;
  onEnd?: () => void;
}

/** macOS on-device speech recognition (Web Speech API is unreliable in Electron). */
export class VoiceInSession {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private buf = "";

  start(appDir: string, locale: string, handlers: VoiceInHandlers, maxSeconds = 45): boolean {
    this.stop();
    const bin = dictateBinary(appDir);
    if (!existsSync(bin)) return false;

    this.proc = spawn(bin, [locale, String(maxSeconds)], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.buf = "";

    const handleLine = (line: string) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line) as { type?: string; text?: string; code?: string };
        if (msg.type === "ready") handlers.onReady?.();
        else if (msg.type === "partial" && msg.text) handlers.onPartial(msg.text);
        else if (msg.type === "final" && msg.text) handlers.onFinal(msg.text);
        else if (msg.type === "error" && msg.code) handlers.onError(msg.code);
      } catch {
        /* ignore malformed stdout */
      }
    };

    this.proc.stdout.on("data", (chunk: Buffer) => {
      this.buf += chunk.toString();
      const lines = this.buf.split("\n");
      this.buf = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    });

    this.proc.stderr.on("data", (chunk: Buffer) => {
      console.error("[voice-in]", chunk.toString().trim());
    });

    this.proc.on("close", (code, signal) => {
      if (this.buf.trim()) handleLine(this.buf);
      this.buf = "";
      this.proc = null;
      if (code !== 0 && code !== null && signal !== "SIGTERM") {
        handlers.onError(code === 134 ? "crashed" : "exited");
      }
      handlers.onEnd?.();
    });

    return true;
  }

  stop(): void {
    if (!this.proc) return;
    try {
      this.proc.kill("SIGTERM");
    } catch {
      /* already dead */
    }
    this.proc = null;
  }

  get active(): boolean {
    return this.proc != null;
  }
}
