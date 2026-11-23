import { describe, expect, it, vi } from "vitest";
import { copySelectedText } from "../../src/ui/selection-copy.js";

describe("copy selected TUI text", () => {
  it("writes to the host clipboard when the local clipboard succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue({
      host: { status: "written" },
      terminal: { status: "not-attempted", capability: "unknown" },
    });
    const fallback = vi.fn(() => false);

    await expect(copySelectedText("selected output", { writeText } as never, fallback)).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("selected output", { destination: "best-available" });
    expect(fallback).not.toHaveBeenCalled();
  });

  it("accepts a terminal clipboard write when running through a remote terminal", async () => {
    const writeText = vi.fn().mockResolvedValue({
      host: { status: "not-attempted" },
      terminal: { status: "attempted", capability: "supported" },
    });
    const fallback = vi.fn(() => false);

    await expect(copySelectedText("selected output", { writeText } as never, fallback)).resolves.toBe(true);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("uses OSC 52 when the clipboard service cannot copy", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("host clipboard unavailable"));
    const fallback = vi.fn(() => true);

    await expect(copySelectedText("selected output", { writeText } as never, fallback)).resolves.toBe(true);
    expect(fallback).toHaveBeenCalledWith("selected output");
  });

  it("ignores empty selections", async () => {
    const writeText = vi.fn();
    const fallback = vi.fn(() => true);

    await expect(copySelectedText("", { writeText } as never, fallback)).resolves.toBe(false);
    expect(writeText).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
  });
});
