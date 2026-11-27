import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tuiSource = readFileSync(new URL("../../src/ui/tui.tsx", import.meta.url), "utf8");

describe("transcript empty state", () => {
  it("uses renderable fallbacks instead of empty text nodes beneath layout boxes", () => {
    const marker = '<Show when={visibleEntries().length > 0} fallback={';
    const start = tuiSource.indexOf(marker);
    expect(start).toBeGreaterThanOrEqual(0);

    const end = tuiSource.indexOf("\n          }>", start);
    expect(end).toBeGreaterThan(start);
    const fallback = tuiSource.slice(start + marker.length, end);

    expect(fallback).toContain("<box paddingX={1}>");
    expect(fallback).toContain('<Show when={selectedAgentIdSignal() !== MAIN_AGENT_ID} fallback={<box height={0} />}>');
    expect(fallback).toContain('<text fg={ROLES.dimText} wrapMode="none">No activity yet for @{selectedName()}.</text>');
    expect(fallback).not.toContain('? "" :');
    expect(tuiSource).not.toContain('<Show when={entry().kind === "user" || entry().kind === "markdown"}>');
    expect(tuiSource).not.toContain('<Show when={entry().agentLabel}>');
    expect(tuiSource).not.toContain('<Show when={navigatorView().hiddenAbove > 0 && !compactApprovalChrome()}>');
    expect(tuiSource).not.toContain('<Show when={navigatorView().hiddenBelow > 0 && !compactApprovalChrome()}>');
    expect(tuiSource).not.toContain('<Show when={index > 0}>');
  });
});
