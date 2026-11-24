import { describe, expect, it } from "vitest";
import { terminalPanelHeight } from "../../src/ui/tui.js";
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

describe("composer border roles", () => {
  it("uses the subtle structural border when the composer is unfocused", () => {
    expect(ROLES.composerBorder).toBe("#27332C");
  });

  it("uses the lime accent when the composer is focused", () => {
    expect(ROLES.composerBorderFocused).toBe("#B5D98A");
  });

  it("never encodes the permission mode in the composer border", () => {
    // The bright-red auto-mode border is banned; permission is footer text.
    expect(ROLES.composerBorder).not.toBe("#FF5555");
    expect(ROLES.composerBorderFocused).not.toBe("#FF5555");
  });
});
