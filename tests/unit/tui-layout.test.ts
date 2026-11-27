import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tuiSource = readFileSync(new URL("../../src/ui/tui.tsx", import.meta.url), "utf8");

describe("TUI conditional layout children", () => {
  it("provides renderable fallbacks for conditionals inside layout containers", () => {
    const requiredFallbacks = [
      '<Show when={visibleEntries().length > 0} fallback={',
      '<Show when={selectedAgentIdSignal() !== MAIN_AGENT_ID} fallback={<box height={0} />}>',
      '<Show when={entry().kind === "user" || entry().kind === "markdown"} fallback={<box height={0} />}>',
      '<Show when={entry().agentLabel} fallback={<box width={0} height={0} />}>',
      '<Show when={navigatorView().hiddenAbove > 0 && !compactApprovalChrome()} fallback={<box height={0} />}>',
      '<Show when={navigatorView().hiddenBelow > 0 && !compactApprovalChrome()} fallback={<box height={0} />}>',
      '<Show when={index > 0} fallback={<box width={0} height={0} />}>',
    ];
    for (const conditional of requiredFallbacks) expect(tuiSource).toContain(conditional);
  });
});
