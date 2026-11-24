import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { COLORS, ROLES } from "../../src/ui/theme.js";

const uiDir = fileURLToPath(new URL("../../src/ui/", import.meta.url));
const readUi = (file: string): string => readFileSync(join(uiDir, file), "utf8");

/** Every pre-theme live hex from DESIGN_SYSTEM §11.7 (docs are exempt). */
const LEGACY_HEXES = [
  "#FF5555",
  "#11100F",
  "#D99168",
  "#F0B38D",
  "#6D625A",
  "#E6E1DC",
  "#C9C1BA",
  "#D0C9C2",
  "#8D857D",
  "#89827C",
  "#88827C",
  "#8F8982",
  "#8EAAA8",
  "#8FCB9B",
  "#8BB7D8",
  "#79B8D1",
  "#E2A078",
  "#E47D76",
  "#D7A27C",
  "#9CCB9C",
  "#17351F",
  "#3A1D1D",
  "#B7E4C7",
  "#F0B4AE",
  "#BDB6AE",
];

const LIVE_UI_FILES = ["tui.tsx", "index.ts", "subagent-view.ts"];

describe("Carbon Forge foundation palette", () => {
  it("exports the eight exact foundation colors", () => {
    expect({
      background: COLORS.background,
      surface: COLORS.surface,
      border: COLORS.border,
      text: COLORS.text,
      accent: COLORS.accent,
      copper: COLORS.copper,
      teal: COLORS.teal,
      error: COLORS.error,
    }).toEqual({
      background: "#101512",
      surface: "#19211D",
      border: "#27332C",
      text: "#E5EDE6",
      accent: "#B5D98A",
      copper: "#D69B69",
      teal: "#83B9A2",
      error: "#E17D75",
    });
  });

  it("exports the documented derived tokens", () => {
    expect(COLORS.textMuted).toBe("#A5ACA6");
    expect(COLORS.textDim).toBe("#858C87");
    expect(COLORS.diffAddSurface).toBe("#293224");
    expect(COLORS.diffRemoveSurface).toBe("#2F2521");
  });
});

describe("Carbon Forge semantic roles", () => {
  it("maps selection and focus to lime accent", () => {
    expect(ROLES.selection).toBe("#B5D98A");
    expect(ROLES.focus).toBe("#B5D98A");
    expect(ROLES.success).toBe("#B5D98A");
    expect(ROLES.statusCompleted).toBe("#B5D98A");
  });

  it("maps branding and tool execution to copper", () => {
    expect(ROLES.brand).toBe("#D69B69");
    expect(ROLES.tool).toBe("#D69B69");
    expect(ROLES.statusRunning).toBe("#D69B69");
  });

  it("maps informational states and sub-agents to teal", () => {
    expect(ROLES.info).toBe("#83B9A2");
    expect(ROLES.subagent).toBe("#83B9A2");
    expect(ROLES.subagentLabel).toBe("#83B9A2");
    expect(ROLES.statusWaiting).toBe("#83B9A2");
  });

  it("maps errors to the Carbon Forge error color", () => {
    expect(ROLES.error).toBe("#E17D75");
    expect(ROLES.statusFailed).toBe("#E17D75");
    expect(ROLES.diffRemoveText).toBe("#E17D75");
  });

  it("uses a subtle structural composer border and lime focus", () => {
    expect(ROLES.composerBorder).toBe("#27332C");
    expect(ROLES.composerBorderFocused).toBe("#B5D98A");
    expect(ROLES.border).toBe("#27332C");
  });

  it("never uses the banned bright-red permission border", () => {
    expect(Object.values(ROLES)).not.toContain("#FF5555");
    expect(COLORS).not.toHaveProperty("autoPermission");
  });

  it("derives every role value from the foundation or documented derived palette", () => {
    const palette = new Set<string>(Object.values(COLORS));
    for (const [role, value] of Object.entries(ROLES)) {
      expect(palette.has(value), `${role} -> ${value}`).toBe(true);
    }
  });
});

describe("live UI call sites", () => {
  it("contain no hex color literals (theme.ts is the only hex source)", () => {
    for (const file of LIVE_UI_FILES) {
      expect(readUi(file), file).not.toMatch(/#[0-9A-Fa-f]{3,8}\b/);
    }
    const allUiFiles = readdirSync(uiDir).filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"));
    const hexSources = allUiFiles.filter((file) => file !== "theme.ts" && /#[0-9A-Fa-f]{3,8}\b/.test(readUi(file)));
    expect(hexSources).toEqual([]);
  });

  it("contain none of the legacy §11.7 hexes", () => {
    for (const file of LIVE_UI_FILES) {
      const content = readUi(file).toLowerCase();
      for (const legacy of LEGACY_HEXES) {
        expect(content, `${file} still contains ${legacy}`).not.toContain(legacy.toLowerCase());
      }
    }
  });

  it("contain no legacy Chalk named colors", () => {
    const namedColorCall = /\b(?:Chalk|chalk|c)\.(cyan|magenta|yellow|green|red|dim)\s*\(/;
    for (const file of LIVE_UI_FILES) {
      expect(readUi(file), file).not.toMatch(namedColorCall);
    }
  });

  it("rethemes the non-TUI Chalk fallback through theme hexes", () => {
    for (const file of ["index.ts", "subagent-view.ts"]) {
      const content = readUi(file);
      expect(content, file).toContain("c.hex(COLORS.");
      expect(content, file).toMatch(/import \{ COLORS \} from ['"]\.\/theme\.js['"]/);
    }
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

  it("binds the composer border to focus, never to the permission mode", () => {
    const tui = readUi("tui.tsx");
    expect(tui).toContain("borderColor={composerFocused() ? ROLES.composerBorderFocused : ROLES.composerBorder}");
    expect(tui).not.toContain("permissionBarColor");
  });

  it("keeps the legacy bright-red permission helper out of src", () => {
    const sources = readdirSync(uiDir).filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"));
    for (const file of sources) {
      expect(readUi(file), file).not.toContain("permissionBarColor");
    }
  });
});
