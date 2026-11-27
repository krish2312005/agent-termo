import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tuiSource = readFileSync(new URL("../../src/ui/tui.tsx", import.meta.url), "utf8");

describe("transcript empty state", () => {
  it("keeps the empty main-agent state inside a text renderable under the scrollbox", () => {
    const marker = '<Show when={visibleEntries().length > 0} fallback={';
    const start = tuiSource.indexOf(marker);
    expect(start).toBeGreaterThanOrEqual(0);

    const end = tuiSource.indexOf("\n          }>", start);
    expect(end).toBeGreaterThan(start);
    const fallback = tuiSource.slice(start + marker.length, end);

    expect(fallback).toContain("<box paddingX={1}>");
    expect(fallback).toContain('<text fg={ROLES.dimText} wrapMode="none">');
    expect(fallback).toContain('{selectedAgentIdSignal() === MAIN_AGENT_ID ? "" : "No activity yet for @" + selectedName() + "."}');
    expect(fallback).not.toContain("<Show");
  });
});
