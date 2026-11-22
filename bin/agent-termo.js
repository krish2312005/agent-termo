#!/usr/bin/env bun
// Bun resolves solid-js to its server build unless this preload runs before the
// bundle is loaded; bunfig.toml only applies to the current directory.
import "@opentui/solid/preload";
await import("../dist/cli.js");
