import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  APP_TITLE,
  installTerminalTitle,
  resetTerminalTitleForTests,
  restoreTerminalTitle,
  setTitleSequence,
  TITLE_STACK_RESTORE,
  TITLE_STACK_SAVE,
} from "../../src/ui/terminal-title.js";

const readSource = (file: string): string => readFileSync(new URL(`../../src/${file}`, import.meta.url), "utf8");

interface FakeTerminal {
  writes: string[];
  titles: string[];
  title: string;
  io: {
    writer: (sequence: string) => void;
    isTTY: boolean;
    setProcessTitle: (title: string) => void;
    getProcessTitle: () => string;
  };
}

function fakeTerminal(previous = "previous-process-title"): FakeTerminal {
  const state: FakeTerminal = {
    writes: [],
    titles: [],
    title: previous,
    io: {
      writer: (sequence) => state.writes.push(sequence),
      isTTY: true,
      setProcessTitle: (title) => {
        state.titles.push(title);
        state.title = title;
      },
      getProcessTitle: () => state.title,
    },
  };
  return state;
}

afterEach(() => {
  resetTerminalTitleForTests();
  vi.restoreAllMocks();
});

describe("terminal title sequences", () => {
  it("uses the exact OSC 2 and xterm title-stack sequences", () => {
    expect(APP_TITLE).toBe("Agent-Termo");
    expect(setTitleSequence()).toBe("\x1b]2;Agent-Termo\x07");
    expect(setTitleSequence(APP_TITLE)).toBe("\x1b]2;Agent-Termo\x07");
    expect(TITLE_STACK_SAVE).toBe("\x1b[22;2t");
    expect(TITLE_STACK_RESTORE).toBe("\x1b[23;2t");
  });

  it("strips control characters from the title payload", () => {
    const rendered = setTitleSequence("a\x1b]2;evil\x07b\x00c\nd\x7f");
    expect(rendered).toBe("\x1b]2;a]2;evilbcd\x07");
    const payload = rendered.slice("\x1b]2;".length, -"\x07".length);
    expect(payload).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(rendered).toMatch(/^\x1b\]2;[^\u0000-\u001f]*\x07$/);
  });
});

describe("terminal title install/restore", () => {
  it("registers one process exit fallback and never duplicates it", () => {
    const once = vi.spyOn(process, "once");
    const terminal = fakeTerminal();

    expect(installTerminalTitle(terminal.io)).toBe(true);
    const exitRegistrations = (): unknown[] => once.mock.calls.filter(([event]) => event === "exit");
    expect(exitRegistrations()).toHaveLength(1);

    // A second install is a no-op and must not push another save sequence.
    expect(installTerminalTitle(terminal.io)).toBe(false);
    expect(exitRegistrations()).toHaveLength(1);

    // Reset forgets the active state but not the process-level registration.
    resetTerminalTitleForTests();
    terminal.title = "second-install-previous";
    expect(installTerminalTitle(terminal.io)).toBe(true);
    expect(exitRegistrations()).toHaveLength(1);

    // The registered fallback restores through the injected IO, never the real terminal.
    const listener = exitRegistrations()[0] as unknown as [string, () => void];
    terminal.writes.length = 0;
    listener[1]();
    expect(terminal.writes).toEqual([TITLE_STACK_RESTORE]);
    expect(terminal.title).toBe("second-install-previous");
  });

  it("is a no-op when stdout is not a TTY", () => {
    const terminal = fakeTerminal();
    const installed = installTerminalTitle({ ...terminal.io, isTTY: false });
    expect(installed).toBe(false);
    expect(terminal.writes).toEqual([]);
    expect(terminal.titles).toEqual([]);
    expect(terminal.title).toBe("previous-process-title");
  });

  it("pushes the saved title then sets OSC 2 and process.title", () => {
    const terminal = fakeTerminal();
    expect(installTerminalTitle(terminal.io)).toBe(true);
    expect(terminal.writes).toEqual([TITLE_STACK_SAVE + "\x1b]2;Agent-Termo\x07"]);
    expect(terminal.writes[0]!.indexOf(TITLE_STACK_SAVE)).toBeLessThan(terminal.writes[0]!.indexOf("\x1b]2;"));
    expect(terminal.titles).toEqual(["Agent-Termo"]);
    expect(terminal.title).toBe("Agent-Termo");
  });

  it("is idempotent while installed", () => {
    const terminal = fakeTerminal();
    expect(installTerminalTitle(terminal.io)).toBe(true);
    expect(installTerminalTitle(terminal.io)).toBe(false);
    expect(terminal.writes).toHaveLength(1);
    expect(terminal.titles).toHaveLength(1);
  });

  it("pops the saved title and restores the previous process.title", () => {
    const terminal = fakeTerminal("shell-title");
    installTerminalTitle(terminal.io);
    terminal.writes.length = 0;
    terminal.titles.length = 0;

    expect(restoreTerminalTitle()).toBe(true);
    expect(terminal.writes).toEqual([TITLE_STACK_RESTORE]);
    expect(terminal.titles).toEqual(["shell-title"]);
    expect(terminal.title).toBe("shell-title");

    expect(restoreTerminalTitle()).toBe(false);
    expect(terminal.writes).toHaveLength(1);
    expect(terminal.titles).toHaveLength(1);
  });

  it("restores through explicit IO overrides without touching the real terminal", () => {
    const terminal = fakeTerminal();
    installTerminalTitle(terminal.io);
    const overrideWrites: string[] = [];
    const overrideTitles: string[] = [];
    expect(restoreTerminalTitle({
      writer: (sequence) => overrideWrites.push(sequence),
      setProcessTitle: (title) => overrideTitles.push(title),
    })).toBe(true);
    expect(overrideWrites).toEqual([TITLE_STACK_RESTORE]);
    expect(overrideTitles).toEqual(["previous-process-title"]);
    expect(terminal.writes).toHaveLength(1);
  });

  it("reset clears state without writing and allows a fresh install", () => {
    const terminal = fakeTerminal();
    installTerminalTitle(terminal.io);
    terminal.writes.length = 0;
    terminal.titles.length = 0;

    resetTerminalTitleForTests();
    expect(restoreTerminalTitle()).toBe(false);
    expect(terminal.writes).toEqual([]);
    expect(terminal.titles).toEqual([]);

    expect(installTerminalTitle(terminal.io)).toBe(true);
    expect(terminal.writes).toEqual([TITLE_STACK_SAVE + "\x1b]2;Agent-Termo\x07"]);
  });

  it("restore before any install is a no-op", () => {
    const terminal = fakeTerminal();
    expect(restoreTerminalTitle(terminal.io)).toBe(false);
    expect(terminal.writes).toEqual([]);
    expect(terminal.titles).toEqual([]);
  });
});

describe("terminal title wiring", () => {
  it("installs at CLI start before the API-key prompt", () => {
    const cli = readSource("cli.ts");
    expect(cli).toContain("import { installTerminalTitle } from './ui/terminal-title.js';");
    const startAgent = cli.slice(cli.indexOf("async function startAgent"));
    expect(startAgent).toContain("installTerminalTitle();");
    expect(startAgent.indexOf("installTerminalTitle();")).toBeLessThan(startAgent.indexOf("getConfig(project);"));
  });

  it("installs at runRepl and restores during cleanup", () => {
    const main = readSource("main.ts");
    expect(main).toContain("import { installTerminalTitle, restoreTerminalTitle } from './ui/terminal-title.js';");
    const runRepl = main.slice(main.indexOf("export async function runRepl"));
    expect(runRepl).toContain("installTerminalTitle();");
    const cleanup = main.slice(main.indexOf("const cleanup = () =>"));
    expect(cleanup).toContain("restoreTerminalTitle();");
    expect(cleanup.indexOf("teardownScreen()")).toBeLessThan(cleanup.indexOf("restoreTerminalTitle();"));
  });
});
