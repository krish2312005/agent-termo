import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { COMMANDS, helpMarkdown, printHelp } from "../../src/ui/index.js";
import { getCommands, setCommands } from "../../src/ui/tui.js";

const readSource = (file: string): string => readFileSync(new URL(`../../src/${file}`, import.meta.url), "utf8");
const stripAnsi = (value: string): string => value.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;
const commandsSection = (doc: string): string => doc.slice(doc.indexOf("# Commands"), doc.indexOf("# Shortcuts"));
const shortcutsSection = (doc: string): string => doc.slice(doc.indexOf("# Shortcuts"));

afterEach(() => {
  vi.restoreAllMocks();
  setCommands([]);
});

describe("helpMarkdown structure", () => {
  const doc = helpMarkdown(COMMANDS);

  it("starts with one Commands section followed by one Shortcuts section", () => {
    expect(doc.startsWith("# Commands\n")).toBe(true);
    expect(doc.match(/^# .+$/gm)).toEqual(["# Commands", "# Shortcuts"]);
    expect(doc.indexOf("# Commands")).toBeLessThan(doc.indexOf("# Shortcuts"));
    expect(doc.match(/^# Commands$/gm)).toHaveLength(1);
    expect(doc.match(/^# Shortcuts$/gm)).toHaveLength(1);
  });

  it("lists every registered command exactly once", () => {
    for (const command of COMMANDS) {
      expect(count(commandsSection(doc), "`" + command.name + "`"), command.name).toBe(1);
    }
    const rows = commandsSection(doc).split("\n").filter((line) => line.startsWith("- "));
    expect(rows).toHaveLength(COMMANDS.length);
  });

  it("lists /mcp exactly once", () => {
    expect(count(commandsSection(doc), "`/mcp`")).toBe(1);
    expect(count(doc, "`/mcp`")).toBe(1);
    expect(COMMANDS.filter((command) => command.name === "/mcp")).toHaveLength(1);
  });

  it("shows the five real aliases beside their canonical commands", () => {
    const expected: Array<[string, string]> = [
      ["/help", "/"],
      ["/clear", "/cls"],
      ["/timeline", "/tl"],
      ["/history", "/hist"],
      ["/exit", "/quit"],
    ];
    for (const [command, alias] of expected) {
      const registered = COMMANDS.find((entry) => entry.name === command);
      expect(registered?.aliases, command).toContain(alias);
      const row = commandsSection(doc).split("\n").find((line) => line.startsWith("- `" + command + "`"));
      expect(row, command).toBeDefined();
      expect(row).toContain("(`" + alias + "`)");
    }
  });

  it("marks project commands with a project hint", () => {
    const withProject = [...COMMANDS, { name: "/ship-it", description: "prepare a release", project: true }];
    const projectDoc = helpMarkdown(withProject);
    expect(projectDoc).toContain("- `/ship-it` — prepare a release (`project`)");
    expect(count(commandsSection(projectDoc), "`project`")).toBe(1);
    expect(doc).not.toContain("`project`");
  });

  it("notes that plain exit and quit also quit", () => {
    expect(doc).toContain("Plain `exit` / `quit` also quit.");
  });

  it("uses the corrected command descriptions", () => {
    const section = commandsSection(doc);
    const expected = [
      "show commands and keyboard shortcuts",
      "list agents and choose one",
      "list recent conversation messages (default 12, max 50)",
      "show estimated context usage and budget",
      "list MCP servers and available tools",
    ];
    for (const description of expected) expect(section, description).toContain(description);
    expect(section).not.toContain("show message count");
    expect(section).not.toContain("runtime paths");
  });
});

describe("helpMarkdown shortcuts", () => {
  const doc = helpMarkdown(COMMANDS);
  const section = shortcutsSection(doc);

  it("groups shortcuts in the documented order", () => {
    const groups = [...section.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(groups).toEqual(["Composer", "Workspace", "Response", "Approval", "Picker", "Secret input"]);
  });

  it("documents the real composer, workspace, response and modal bindings", () => {
    const bindings = [
      "`Enter`",
      "`Shift+Enter / Ctrl+Enter / Alt+Enter`",
      "`Tab`",
      "`Esc`",
      "`↑ / ↓`",
      "`Ctrl+A / Ctrl+E`",
      "`Ctrl+W / Ctrl+U`",
      "`Ctrl+K`",
      "`Ctrl+O`",
      "`Ctrl+T`",
      "`Ctrl+X`",
      "`Ctrl+X then Ctrl+K within 1.5 s`",
      "`Ctrl+C`",
      "`Y / Enter`",
      "`A`",
      "`N / Esc / Ctrl+C`",
      "`type`",
      "`Backspace`",
      "bracketed paste",
    ];
    for (const binding of bindings) expect(section, binding).toContain(binding);
  });

  it("does not resurrect the old hand-written Keys list", () => {
    expect(doc).not.toContain("# Keys");
    expect(doc).not.toMatch(/^## Keys$/m);
  });
});

describe("slash-command dispatch completeness", () => {
  const mainSource = readSource("main.ts");

  const dispatched = ((): Set<string> => {
    const names = new Set<string>();
    const add = (raw: string | undefined): void => {
      const name = raw?.trim().split(/\s+/)[0];
      if (name?.startsWith("/")) names.add(name);
    };
    for (const match of mainSource.matchAll(/\bcmd\s*===\s*'(\/[^']*)'/g)) add(match[1]);
    for (const match of mainSource.matchAll(/\bcmd\.startsWith\(\s*'(\/[^']+)'/g)) add(match[1]);
    for (const match of mainSource.matchAll(/\b(?:lowerInput|userInput|trimmedInput)\s*===\s*'(\/[^']*)'/g)) add(match[1]);
    for (const match of mainSource.matchAll(/\b(?:lowerInput|userInput|trimmedInput)\.startsWith\(\s*'(\/[^']+)'/g)) add(match[1]);
    // The second /subagents handler outside the main `cmd` block.
    for (const match of mainSource.matchAll(/slice\(\s*'(\/[^']+)'\.length\s*\)/g)) add(match[1]);
    return names;
  })();

  it("finds the main, /report and secondary /subagents dispatch branches", () => {
    expect(dispatched.size).toBeGreaterThan(30);
    expect(dispatched.has("/report")).toBe(true);
    expect(dispatched.has("/subagents")).toBe(true);
    expect(mainSource).toContain("lowerInput === '/report'");
    expect(mainSource).toContain("command.slice('/subagents'.length)");
  });

  it("represents every dispatched command and alias in COMMANDS", () => {
    const known = new Set(COMMANDS.flatMap((command) => [command.name, ...(command.aliases ?? [])]));
    const unknown = [...dispatched].filter((name) => !known.has(name));
    expect(unknown).toEqual([]);
  });

  it("has a real dispatch branch for every registered command and alias", () => {
    for (const command of COMMANDS) {
      expect(dispatched.has(command.name), command.name).toBe(true);
      for (const alias of command.aliases ?? []) {
        expect(dispatched.has(alias), `${alias} (${command.name})`).toBe(true);
      }
    }
  });
});

describe("/help source wiring", () => {
  const indexSource = readSource("ui/index.ts");

  it("renders from the live registry rather than a second hand-written list", () => {
    expect(indexSource).toContain("const live = getCommands();");
    expect(indexSource).toContain("helpMarkdown(live.length > 0 ? live : COMMANDS)");
  });

  it("routes the document through the existing markdown transcript entry", () => {
    expect(indexSource).toContain('print(markdown, "markdown");');
  });
});

describe("printHelp non-TUI fallback", () => {
  const capturePrintHelp = (): string => {
    const chunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((data: string | Uint8Array) => {
      chunks.push(String(data));
      return true;
    }) as typeof process.stdout.write);
    expect(() => printHelp()).not.toThrow();
    return stripAnsi(chunks.join(""));
  };

  it("prints both sections and representative content without throwing", () => {
    setCommands([]);
    const out = capturePrintHelp();
    expect(out).toContain("Commands");
    expect(out).toContain("Shortcuts");
    expect(out).toContain("/help");
    expect(out).toContain("Plain exit / quit also quit.");
    expect(out).toContain("Ctrl+X then Ctrl+K within 1.5 s");
  });

  it("renders the live registry including project commands", () => {
    setCommands([...COMMANDS, { name: "/ship-it", description: "prepare a release", project: true }]);
    const out = capturePrintHelp();
    expect(out).toContain("/ship-it");
    expect(out).toContain("prepare a release");
    expect(out).toContain("project");
    expect(count(out, "/mcp")).toBe(1);
  });
});

describe("live registry seam", () => {
  it("getCommands reflects setCommands without leaking between tests", () => {
    expect(getCommands()).toEqual([]);
    setCommands([{ name: "/ship-it", description: "prepare a release", project: true }]);
    expect(getCommands()).toEqual([{ name: "/ship-it", description: "prepare a release", project: true }]);
    setCommands([]);
    expect(getCommands()).toEqual([]);
  });
});
