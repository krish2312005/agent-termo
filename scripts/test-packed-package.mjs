import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import packageJson from "../package.json" with { type: "json" };

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = mkdtempSync(join(tmpdir(), "agent-termo-package-test-"));
const packDirectory = join(temporaryRoot, "pack");
const globalPrefix = join(temporaryRoot, "global");
const outsideDirectory = join(temporaryRoot, "outside");
const projectDirectory = join(temporaryRoot, "fresh-project");

mkdirSync(packDirectory, { recursive: true });
mkdirSync(outsideDirectory, { recursive: true });

function run(
  command,
  args,
  {
    cwd = repositoryRoot,
    input,
    env = {},
    timeout = 30_000,
  } = {},
) {
  try {
    return execFileSync(command, args, {
      cwd,
      env: { ...process.env, ...env },
      encoding: "utf8",
      input,
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const stdout = error.stdout?.toString() ?? "";
    const stderr = error.stderr?.toString() ?? "";
    throw new Error(
      `Command failed: ${command} ${args.join(" ")}\n${stdout}\n${stderr}`,
      { cause: error },
    );
  }
}

function listFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function shellQuote(value) {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

try {
  console.log("Packing Agent-Termo with npm (runs the prepack build)...");
  run("npm", ["pack", "--pack-destination", packDirectory], { cwd: repositoryRoot });

  const tarballs = readdirSync(packDirectory).filter((file) => file.endsWith(".tgz"));
  assert.equal(tarballs.length, 1, "npm pack must produce exactly one tarball");
  const tarball = join(packDirectory, tarballs[0]);

  const archiveEntries = new Set(
    run("tar", ["-tzf", tarball], { cwd: outsideDirectory })
      .split(/\r?\n/)
      .filter(Boolean),
  );

  assert(
    archiveEntries.has("package/dist/cli.js"),
    "the npm tarball must contain dist/cli.js",
  );

  const sourceDefaults = join(repositoryRoot, "src/runtime/defaults");
  const defaultFiles = listFiles(sourceDefaults);
  assert(defaultFiles.length > 0, "expected bundled runtime defaults in src/runtime/defaults");

  for (const file of defaultFiles) {
    const path = relative(sourceDefaults, file).split(sep).join("/");
    assert(
      archiveEntries.has(`package/dist/.agent-termo-defaults/${path}`),
      `the npm tarball is missing bundled default: ${path}`,
    );
  }

  console.log("Installing the tarball into an isolated global npm prefix...");
  run(
    "npm",
    ["install", "--global", "--prefix", globalPrefix, "--no-audit", "--no-fund", tarball],
    { cwd: outsideDirectory },
  );

  const globalBinary = join(globalPrefix, "bin", "agent-termo");
  const installedModules = run(
    "npm",
    ["root", "--global", "--prefix", globalPrefix],
    { cwd: outsideDirectory },
  ).trim();
  const installedPackageDirectory = join(installedModules, "agent-termo");
  const installedPackage = JSON.parse(
    readFileSync(join(installedPackageDirectory, "package.json"), "utf8"),
  );
  const installedCli = join(installedPackageDirectory, "dist/cli.js");

  assert(existsSync(globalBinary), "npm must create the global agent-termo executable");
  assert.equal(installedPackage.version, packageJson.version, "installed version must match package.json");
  assert(existsSync(installedCli), "the installed package must contain dist/cli.js");

  const shebang = readFileSync(installedCli, "utf8").split(/\r?\n/, 1)[0];
  assert.match(shebang, /^#!.*\bbun\b/, "the published executable must launch with Bun");

  const versionOutput = run(globalBinary, ["--version"], { cwd: outsideDirectory });
  assert(
    versionOutput.trim().endsWith(packageJson.version),
    `the global binary must report version ${packageJson.version}; got: ${versionOutput.trim()}`,
  );

  const helpOutput = run(globalBinary, ["--help"], { cwd: outsideDirectory });
  assert.match(helpOutput, /Usage: agent-termo/, "the global binary must execute the bundled CLI");

  console.log("Testing project initialization outside the repository...");
  run(globalBinary, ["init", projectDirectory], { cwd: outsideDirectory });
  assert(existsSync(join(projectDirectory, "docs", "MEMORY.md")), "init must create project memory");
  assert(existsSync(join(projectDirectory, "docs", "TIMELINE.md")), "init must create project timeline");
  assert(existsSync(join(projectDirectory, ".agent-termo", "agents")), "init must create project agents directory");

  if (process.platform === "linux" || process.platform === "darwin") {
    console.log(`Testing prompt submission through a real ${process.platform} pseudo-terminal...`);
    const env = {
      NIM_API_KEY: "agent-termo-package-smoke-test",
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      ...(process.platform === "darwin"
        ? {
            TERM_PROGRAM: "Apple_Terminal",
            // Diagnostic workaround: avoid OpenTUI's native stdout writer and
            // unsupported Kitty/Sixel detection queries on Apple Terminal PTYs.
            OTUI_STDOUT_THREAD: "0",
            OPENTUI_GRAPHICS: "false",
          }
        : {}),
    };
    let interactiveOutput;
    if (process.platform === "linux") {
      interactiveOutput = run(
        "script",
        ["--quiet", "--return", "--command", `${shellQuote(globalBinary)} ${shellQuote(projectDirectory)}`, "/dev/null"],
        { cwd: outsideDirectory, input: "/status\r/exit\r", env, timeout: 20_000 },
      );
    } else {
      for (const [rows, columns] of [[24, 80], [77, 272]]) {
        interactiveOutput = run(
          "python3",
          [
            join(repositoryRoot, "scripts/test-packed-pty.py"),
            globalBinary,
            projectDirectory,
            String(rows),
            String(columns),
          ],
          { cwd: outsideDirectory, env, timeout: 18_000 },
        );
        assert(
          interactiveOutput.includes("AI coding agent for your terminal"),
          `the packed CLI must render the welcome transcript at ${columns}x${rows}`,
        );
        assert(
          interactiveOutput.includes("Messages: 0"),
          `the packed CLI must execute /status at ${columns}x${rows}`,
        );
      }
    }
    if (process.platform === "linux") {
      assert(
        interactiveOutput.includes("Messages: 0"),
        "the packed global executable must submit /status and execute the REPL command",
      );
    }
  } else {
    console.log(`Skipping the pseudo-terminal check on ${process.platform}.`);
  }

  console.log(`Packed npm CLI passed: ${packageJson.name}@${packageJson.version}`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
