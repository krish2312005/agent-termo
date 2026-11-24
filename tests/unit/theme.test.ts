import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { COLORS, ROLES } from "../../src/ui/theme.js";

const srcDir = fileURLToPath(new URL("../../src/", import.meta.url));
const uiDir = join(srcDir, "ui");
const themeFile = join(uiDir, "theme.ts");
const readUi = (file: string): string => readFileSync(join(uiDir, file), "utf8");

/** Every file under src/, recursively (docs/tests are exempt). */
const walkSourceFiles = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkSourceFiles(path));
    else files.push(path);
  }
  return files;
};

const sourceFiles = walkSourceFiles(srcDir);
const readLower = (file: string): string => readFileSync(file, "utf8").toLowerCase();

/** The 12 Carbon Forge hexes that must not return (Carbon Forge was reverted). */
const CARBON_FORGE_HEXES = [
  "#101512",
  "#19211D",
  "#27332C",
  "#E5EDE6",
  "#B5D98A",
  "#D69B69",
  "#83B9A2",
  "#E17D75",
  "#A5ACA6",
  "#858C87",
  "#293224",
  "#2F2521",
].map((hex) => hex.toLowerCase());

/** The 25 Warm Terminal palette hexes; theme.ts is their only allowed source. */
const WARM_HEXES = [
  "#11100F",
  "#6D625A",
  "#D99168",
  "#E6E1DC",
  "#8D857D",
  "#88827C",
  "#C9C1BA",
  "#D0C9C2",
  "#89827C",
  "#8F8982",
  "#8EAAA8",
  "#F0B38D",
  "#8FCB9B",
  "#8BB7D8",
  "#79B8D1",
  "#E2A078",
  "#E47D76",
  "#FF5555",
  "#B7E4C7",
  "#17351F",
  "#F0B4AE",
  "#3A1D1D",
  "#BDB6AE",
  "#D7A27C",
  "#9CCB9C",
].map((hex) => hex.toLowerCase());

const WARM_PALETTE = {
  background: "#11100F",
  border: "#6D625A",
  brand: "#D99168",
  text: "#E6E1DC",
  muted: "#8D857D",
  dim: "#88827C",
  detail: "#C9C1BA",
  textAlt: "#D0C9C2",
  mutedHeader: "#89827C",
  mutedPicker: "#8F8982",
  mutedCompletion: "#8EAAA8",
  selection: "#F0B38D",
  userSuccess: "#8FCB9B",
  info: "#8BB7D8",
  toolWaiting: "#79B8D1",
  running: "#E2A078",
  error: "#E47D76",
  permissionAuto: "#FF5555",
  diffAddText: "#B7E4C7",
  diffAddSurface: "#17351F",
  diffRemoveText: "#F0B4AE",
  diffRemoveSurface: "#3A1D1D",
  diffContextText: "#BDB6AE",
  markdownHeading2: "#D7A27C",
  markdownRaw: "#9CCB9C",
} as const;

const WARM_ROLES = {
  pageBackground: "#11100F",
  panelSurface: "#11100F",
  border: "#6D625A",
  selection: "#F0B38D",
  brand: "#D99168",
  tool: "#79B8D1",
  info: "#8BB7D8",
  approval: "#79B8D1",
  success: "#8FCB9B",
  error: "#E47D76",
  text: "#E6E1DC",
  mutedText: "#8D857D",
  dimText: "#88827C",
  detailText: "#C9C1BA",
  textAlt: "#D0C9C2",
  mutedHeader: "#89827C",
  mutedPicker: "#8F8982",
  mutedCompletion: "#8EAAA8",
  userLabel: "#8FCB9B",
  userText: "#8FCB9B",
  assistantLabel: "#6D625A",
  subagentLabel: "#8D857D",
  composerBorder: "#6D625A",
  permissionAsk: "#6D625A",
  permissionFiles: "#D99168",
  permissionAuto: "#FF5555",
  statusIdle: "#8D857D",
  statusRunning: "#E2A078",
  statusWaiting: "#79B8D1",
  statusCompleted: "#8FCB9B",
  statusFailed: "#E47D76",
  statusStopped: "#88827C",
  diffAddText: "#B7E4C7",
  diffAddSurface: "#17351F",
  diffRemoveText: "#F0B4AE",
  diffRemoveSurface: "#3A1D1D",
  diffContextText: "#BDB6AE",
  markdownText: "#E6E1DC",
  markdownHeading1: "#E2A078",
  markdownHeading2: "#D7A27C",
  markdownLink: "#79B8D1",
  markdownRaw: "#9CCB9C",
  markdownList: "#D7A27C",
  pickerText: "#D0C9C2",
  pickerMuted: "#8F8982",
  completionText: "#8EAAA8",
  terminalCommand: "#8D857D",
  terminalHint: "#6D625A",
  terminalOutput: "#C9C1BA",
} as const;

const LIVE_UI_FILES = ["tui.tsx", "index.ts", "subagent-view.ts"];

describe("Warm Terminal palette", () => {
  it("exports exactly the 25 warm palette tokens", () => {
    expect(COLORS).toEqual(WARM_PALETTE);
  });

  it("does not resurrect the Carbon Forge token aliases", () => {
    for (const alias of ["accent", "copper", "teal", "textDim", "surface", "textMuted"]) {
      expect(COLORS, alias).not.toHaveProperty(alias);
    }
  });

  it("is the only source of warm palette hexes under src", () => {
    const theme = readLower(themeFile);
    for (const hex of WARM_HEXES) {
      expect(theme, `theme.ts missing ${hex}`).toContain(hex);
    }
    for (const file of sourceFiles.filter((path) => path !== themeFile)) {
      const content = readLower(file);
      for (const hex of WARM_HEXES) {
        expect(content, `${file} contains ${hex}`).not.toContain(hex);
      }
    }
  });

  it("contains no Carbon Forge hex anywhere under src", () => {
    for (const file of sourceFiles) {
      const content = readLower(file);
      for (const hex of CARBON_FORGE_HEXES) {
        expect(content, `${file} contains ${hex}`).not.toContain(hex);
      }
    }
  });
});

describe("Warm Terminal semantic roles", () => {
  it("maps every role to the exact restored palette value", () => {
    expect(ROLES).toEqual(WARM_ROLES);
  });

  it("keeps selection distinct from brand and uses the warm accent roles", () => {
    expect(ROLES.selection).toBe("#F0B38D");
    expect(ROLES.brand).toBe("#D99168");
    expect(ROLES.selection).not.toBe(ROLES.brand);
    expect(ROLES.tool).toBe("#79B8D1");
    expect(ROLES.approval).toBe("#79B8D1");
    expect(ROLES.info).toBe("#8BB7D8");
  });

  it("restores the permission-colored composer border contract", () => {
    expect(ROLES.composerBorder).toBe("#6D625A");
    expect(ROLES.permissionAsk).toBe("#6D625A");
    expect(ROLES.permissionFiles).toBe("#D99168");
    expect(ROLES.permissionAuto).toBe("#FF5555");
  });

  it("derives every role value from the palette", () => {
    const palette = new Set<string>(Object.values(COLORS));
    for (const [role, value] of Object.entries(ROLES)) {
      expect(palette.has(value), `${role} -> ${value}`).toBe(true);
    }
  });

  it("does not export the transitional Carbon Forge roles", () => {
    expect(ROLES).not.toHaveProperty("focus");
    expect(ROLES).not.toHaveProperty("subagent");
    expect(ROLES).not.toHaveProperty("composerBorderFocused");
  });
});

describe("live UI call sites", () => {
  it("contain no hex color literals (theme.ts is the only hex source)", () => {
    for (const file of LIVE_UI_FILES) {
      expect(readUi(file), file).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    }
  });

  it("restore the named Chalk fallback colors and do not import the theme", () => {
    const namedColors: Record<string, string[]> = {
      "index.ts": ["c.cyan", "c.magenta", "c.dim"],
      "subagent-view.ts": ["c.yellow", "c.cyan", "c.green", "c.red", "c.dim", "c.magenta"],
    };
    for (const [file, calls] of Object.entries(namedColors)) {
      const content = readUi(file);
      expect(content, file).not.toMatch(/from\s+['"]\.\/theme\.js['"]/);
      expect(content, file).not.toMatch(/\b(?:c|Chalk)\.hex\(/);
      for (const call of calls) {
        expect(content, `${file} missing ${call}`).toContain(call);
      }
    }
  });

  it("restore the permission-colored composer border", () => {
    const tui = readUi("tui.tsx");
    expect(tui).toContain("export function permissionBarColor");
    expect(tui).toContain("inputActive() ? permissionBarColor(screen().permissionMode) : ROLES.composerBorder");
    expect(tui).not.toContain("composerFocused");
    expect(tui).not.toContain("composerBorderFocused");
  });

  it("maps every transcript UiKind to a semantic role", () => {
    const tui = readUi("tui.tsx");
    for (const mapping of [
      "user: ROLES.userText",
      "assistant: ROLES.text",
      "tool: ROLES.tool",
      "info: ROLES.info",
      "success: ROLES.success",
      "error: ROLES.error",
      "dim: ROLES.dimText",
      "markdown: ROLES.markdownText",
      '"diff-add": ROLES.diffAddText',
      '"diff-remove": ROLES.diffRemoveText',
      '"diff-context": ROLES.diffContextText',
    ]) {
      expect(tui, mapping).toContain(mapping);
    }
  });

  it("styles markdown scopes from theme roles", () => {
    const tui = readUi("tui.tsx");
    for (const mapping of [
      "RGBA.fromHex(ROLES.markdownHeading1)",
      "RGBA.fromHex(ROLES.markdownHeading2)",
      "RGBA.fromHex(ROLES.markdownLink)",
      "RGBA.fromHex(ROLES.markdownRaw)",
      "RGBA.fromHex(ROLES.markdownList)",
    ]) {
      expect(tui, mapping).toContain(mapping);
    }
  });
});
