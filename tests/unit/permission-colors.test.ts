import { describe, expect, it } from "vitest";
import { permissionBarColor, terminalPanelHeight } from "../../src/ui/tui.js";

describe("terminal panel height", () => {
  it("stays compact while collapsed", () => {
    expect(terminalPanelHeight(false, 40)).toBe(8);
  });

  it("expands to about 60% of the screen, with a readable floor", () => {
    expect(terminalPanelHeight(true, 40)).toBe(24);
    expect(terminalPanelHeight(true, 12)).toBe(10);
  });
});

describe("permission bar color mapping", () => {
  it("returns default color for normal (ask) mode", () => {
    expect(permissionBarColor("ask")).toBe("#6D625A");
  });

  it("returns orange color for file accept mode", () => {
    expect(permissionBarColor("files")).toBe("#D99168");
  });

  it("returns red color for accept all auto mode", () => {
    expect(permissionBarColor("auto")).toBe("#FF5555");
  });
});
