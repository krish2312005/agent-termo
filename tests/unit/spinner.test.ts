import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as tui from "../../src/ui/tui.js";
import { SPINNER_FRAMES, startSpinner, stopSpinner } from "../../src/ui/index.js";

const TICK = 80;

describe("spinner animation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(tui, "setActivityStatus");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const lastStatus = (): string => tui.setActivityStatus.mock.calls.at(-1)![0];

  it("shows the first frame immediately", () => {
    startSpinner("Working");
    expect(lastStatus()).toBe(SPINNER_FRAMES[0] + " Working…");
  });

  it("rotates through all braille frames on each tick", () => {
    startSpinner("Running file:write");
    const seen: string[] = [];
    for (let i = 0; i < SPINNER_FRAMES.length; i++) {
      vi.advanceTimersByTime(TICK);
      seen.push(lastStatus());
    }
    expect(seen).toEqual(
      [...SPINNER_FRAMES.slice(1), SPINNER_FRAMES[0]].map(
        (frame) => frame + " Running file:write…",
      ),
    );
  });

  it("keeps the same message while spinning", () => {
    startSpinner("Fetching models");
    vi.advanceTimersByTime(5 * TICK);
    expect(lastStatus()).toBe(SPINNER_FRAMES[5] + " Fetching models…");
    expect(lastStatus()).toContain("Fetching models");
  });

  it("clears the status and stops ticking on stop", () => {
    startSpinner("Working");
    vi.advanceTimersByTime(TICK);
    stopSpinner();
    expect(lastStatus()).toBe("");
    vi.advanceTimersByTime(10 * TICK);
    expect(lastStatus()).toBe("");
  });

  it("is safe to stop when not spinning and to stop twice", () => {
    expect(() => stopSpinner()).not.toThrow();
    expect(() => stopSpinner()).not.toThrow();
  });

  it("restarts cleanly after a stop", () => {
    startSpinner("First");
    vi.advanceTimersByTime(TICK);
    stopSpinner();
    startSpinner("Second");
    expect(lastStatus()).toBe(SPINNER_FRAMES[0] + " Second…");
    expect(lastStatus()).not.toContain("First");
  });
});
