import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["src/cli.ts"],
  outfile: "dist/cli.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: true,
  external: ["@tandem/clippy", "@tandem/slack", "@tandem/pm-os", "@tandem/core", "@tandem/engine"],
  logLevel: "info",
});

console.log("@tandem/cli: built dist/cli.js");
