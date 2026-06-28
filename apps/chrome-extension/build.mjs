import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

await build({
  entryPoints: {
    background: "src/background.ts",
    content: "src/content.ts",
    popup: "src/popup.ts",
  },
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome120",
  outdir: "dist",
  logLevel: "info",
});

// Static assets that load as-is.
for (const f of ["manifest.json", "popup.html", "popup.css"]) {
  cpSync(`public/${f}`, `dist/${f}`);
}

console.log("chrome-extension: built dist/ — load it via chrome://extensions → Load unpacked → dist/");
