import solidPlugin from "@opentui/solid/bun-plugin";
import { copy } from "fs-extra";
import { existsSync, rmSync } from "node:fs";

// Remove stale output so every package contains only files from this build.
rmSync("dist", { recursive: true, force: true });

// Build the real CLI entry point. The Solid plugin compiles TSX to OpenTUI
// renderables; packages stay external so Bun loads the matching native core.
const result = await Bun.build({
  entrypoints: ["src/cli.ts"],
  outdir: "dist",
  target: "bun",
  format: "esm",
  sourcemap: "external",
  minify: !process.env.DEV,
  packages: "external",
  external: ["fsevents"],
  plugins: [solidPlugin],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  throw new Error("Agent-Termo build failed.");
}

if (existsSync(".claude")) {
  await copy(".claude", "dist/.claude");
  console.log("Copied .claude to dist/");
}

await copy("src/runtime/defaults", "dist/.agent-termo-defaults");
console.log("Build complete: dist/cli.js");
