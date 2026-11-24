import { describe, expect, it } from "vitest";
import { permissionBarColor, terminalPanelHeight } from "../../src/ui/tui.js";
import { ROLES } from "../../src/ui/theme.js";

describe("terminal panel height", () => {
  it("stays compact while collapsed", () => {
    expect(terminalPanelHeight(false, 40)).toBe(8);
  });

  it("expands to about 60% of the screen, with a readable floor", () => {
    expect(terminalPanelHeight(true, 40)).toBe(24);
    expect(terminalPanelHeight(true, 12)).toBe(10);
  });
});

describe("restored permission-colored composer border", () => {
  it("maps ask to the structural warm border", () => {
    expect(permissionBarColor("ask")).toBe("#6D625A");
  });

  it("maps files to the warm brand color", () => {
    expect(permissionBarColor("files")).toBe("#D99168");
  });

  it("restores the old bright red for accept-all auto", () => {
    // Intentionally restored (Carbon Forge removed it); this is not a banned color.
    expect(permissionBarColor("auto")).toBe("#FF5555");
    expect(ROLES.permissionAuto).toBe("#FF5555");
  });

  it("uses the structural border when the composer is inactive", () => {
    expect(ROLES.composerBorder).toBe("#6D625A");
  });

  it("matches the helper results to the permission roles", () => {
    expect(permissionBarColor("ask")).toBe(ROLES.permissionAsk);
    expect(permissionBarColor("files")).toBe(ROLES.permissionFiles);
    expect(permissionBarColor("auto")).toBe(ROLES.permissionAuto);
  });

  it("has no focus-specific composer border role", () => {
    expect(ROLES).not.toHaveProperty("composerBorderFocused");
  });
});
