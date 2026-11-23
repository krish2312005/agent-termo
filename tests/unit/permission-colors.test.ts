import { describe, expect, it } from "vitest";
import { permissionBarColor } from "../../src/ui/tui.js";

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
