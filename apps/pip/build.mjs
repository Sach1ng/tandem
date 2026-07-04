import { build } from "esbuild";
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { platform } from "node:os";

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

if (platform() === "darwin") {
  execSync(
    "swiftc -O native/dictate.swift -o dist/dictate " +
      "-Xlinker -sectcreate -Xlinker __TEXT -Xlinker __info_plist -Xlinker native/Info.plist",
    { stdio: "inherit" },
  );
  console.log("pip: built dist/dictate (macOS speech)");
}

console.log("pip: built dist/main.cjs + dist/preload.cjs");
