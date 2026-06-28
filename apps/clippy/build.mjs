import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  // Electron + native/optional deps stay external; everything else (incl. @tandem/*) is bundled.
  external: ["electron", "chokidar", "fsevents"],
  sourcemap: true,
  logLevel: "info",
};

await build({ ...common, entryPoints: ["src/main.ts"], outfile: "dist/main.cjs" });
await build({ ...common, entryPoints: ["src/preload.ts"], outfile: "dist/preload.cjs" });

console.log("clippy: built dist/main.cjs + dist/preload.cjs");
