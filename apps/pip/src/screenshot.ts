import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface CapturedScreenshot {
  path: string;
  previewPath: string;
}

/** Small JPEG for the Pip UI — keeps the renderer from choking on multi‑MB PNGs. */
export async function makeScreenshotPreview(fullPath: string): Promise<string> {
  const previewPath = fullPath.replace(/\.png$/i, ".preview.jpg");
  try {
    await execFileAsync("sips", [
      "-Z",
      "640",
      "-s",
      "format",
      "jpeg",
      "-s",
      "formatOptions",
      "80",
      fullPath,
      "--out",
      previewPath,
    ]);
    return existsSync(previewPath) ? previewPath : fullPath;
  } catch {
    return fullPath;
  }
}
