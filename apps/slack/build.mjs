import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

const common = {
  bundle: true,
  platform: "node",
  target: "node20",
  sourcemap: true,
  logLevel: "info",
  external: ["@slack/bolt", "@slack/web-api"],
};

await build({
  ...common,
  entryPoints: ["src/app.ts"],
  outfile: "dist/app.cjs",
  format: "cjs",
  banner: {
    js: `globalThis.__TANDEM_SLACK_PKG_DIR = require("path").join(__dirname, "..");`,
  },
});

await build({
  ...common,
  entryPoints: ["src/oauth-connect.ts"],
  outfile: "dist/oauth-connect.js",
  format: "esm",
});

await build({
  ...common,
  entryPoints: ["src/config.ts"],
  outfile: "dist/config.js",
  format: "esm",
});

await build({
  ...common,
  entryPoints: ["scripts/setup-server.ts"],
  outfile: "dist/setup.cjs",
  format: "cjs",
  banner: {
    js: `globalThis.__TANDEM_SLACK_PKG_DIR = require("path").join(__dirname, "..");`,
  },
});

console.log("@tandem/slack: built dist/app.cjs, dist/oauth-connect.js, dist/config.js, dist/setup.cjs");
