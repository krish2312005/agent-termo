import { readFileSync } from "node:fs";
import { getGitBranchRowLayout, getGitDashboardScrollOffset, getVisibleGitDashboardTabs, isDashboardEnterKey } from "../../src/ui/git-dashboard.js";
import type { GitDashboardData } from "../../src/runtime/git-graph.js";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("../../src/ui/git-dashboard.tsx", import.meta.url), "utf8");
const tuiSource = readFileSync(new URL("../../src/ui/tui.tsx", import.meta.url), "utf8");
const graphSource = readFileSync(new URL("../../src/runtime/git-graph.ts", import.meta.url), "utf8");
const mainSource = readFileSync(new URL("../../src/main.ts", import.meta.url), "utf8");

function findShowsWithoutFallback(source: string, fileName: string): string[] {
  const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const missing: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(parsed) === "Show") {
      const hasFallback = node.attributes.properties.some(
        (attribute) => ts.isJsxAttribute(attribute) && attribute.name.getText(parsed) === "fallback",
      );
      if (!hasFallback) missing.push(node.getText(parsed));
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  return missing;
}

describe("Git dashboard OpenTUI layout", () => {
  it("gives every conditional a renderable fallback instead of emitting orphan empty text nodes", () => {
    expect(findShowsWithoutFallback(dashboardSource, "git-dashboard.tsx")).toEqual([]);
  });

  it("keeps every main TUI conditional on a renderable fallback", () => {
    expect(findShowsWithoutFallback(tuiSource, "tui.tsx")).toEqual([]);
  });

  it("renders a clean commit timeline without text-based ancestry connectors", () => {
    expect(graphSource).toContain('glyph: "●" | "◆" | "·"');
    expect(graphSource).toContain(': "·",');
    expect(graphSource).not.toContain('"╱"');
    expect(graphSource).not.toContain('"╲"');
    expect(graphSource).not.toContain('"│"');
    expect(dashboardSource).not.toContain("lane.glyph +");
    expect(dashboardSource).toContain("props.row.lanes.slice(0, 8)");
    expect(dashboardSource).toContain('lane.isCommit ? (props.row.isMerge ? "◆" : "●") : "○"');
    expect(dashboardSource).toContain("LANE {props.row.laneIndex + 1}");
    expect(dashboardSource).toContain("backgroundColor={color}");
  });

  it("keeps the active tab visible without wrapping the tab strip", () => {
    const tabs = ["overview", "graph", "status", "branches", "diff", "stash", "remotes", "tags", "github", "prs", "issues", "actions", "releases"] as const;
    for (const width of [60, 80, 100, 140]) {
      for (const tab of tabs) {
        const visible = getVisibleGitDashboardTabs(tab, width);
        expect(visible.some((item) => item.id === tab)).toBe(true);
        expect(visible.reduce((total, item) => total + item.label.length + 3, 0)).toBeLessThanOrEqual(Math.max(12, width - 6));
      }
    }
    expect(getVisibleGitDashboardTabs("releases", 140)).toHaveLength(13);
  });

  it("allocates fixed branch columns that fit both compact and wide terminals", () => {
    for (const width of [40, 60, 80, 100, 140, 200]) {
      const layout = getGitBranchRowLayout(width);
      const compact = layout.hashWidth === 0;
      const total = 2 + layout.kindWidth + layout.nameWidth + layout.hashWidth + layout.subjectWidth + layout.headWidth + (compact ? 3 : 5);
      expect(total).toBe(layout.rowWidth);
      expect(layout.subjectWidth).toBeGreaterThanOrEqual(4);
      expect(layout.nameWidth).toBeGreaterThanOrEqual(8);
    }
  });

  it("calculates the scroll offset for the selected row across sections", () => {
    const data = {
      conflicts: [{}, {}],
      staged: [{}, {}, {}],
      unstaged: [{}, {}],
      untracked: [{}],
    } as unknown as GitDashboardData;
    expect(getGitDashboardScrollOffset(data, "branches", 10)).toBe(12);
    expect(getGitDashboardScrollOffset(data, "graph", 10)).toBe(21);
    expect(getGitDashboardScrollOffset(data, "status", 0)).toBe(2);
    expect(getGitDashboardScrollOffset(data, "status", 2)).toBe(5);
    expect(getGitDashboardScrollOffset(data, "status", 5)).toBe(9);
    expect(getGitDashboardScrollOffset(data, "status", 7)).toBe(12);
    expect(getGitDashboardScrollOffset(data, "tags", 10)).toBe(11);
  });

  it("supports page navigation through large selectable dashboard lists", () => {
    expect(tuiSource).toContain('["up", "down", "pageup", "pagedown"].includes(name)');
    expect(tuiSource).toContain("terminalRows() - 18");
    expect(dashboardSource).toContain("PgUp/PgDn jump");
  });

  it("uses fixed-width clipped rows and an independently scrollable dashboard viewport", () => {
    expect(dashboardSource).toContain("flexBasis={0}");
    expect(dashboardSource).toContain('ref={(element) => { listScrollbox = element; }}');
    expect(dashboardSource).toContain("listScrollbox.scrollTo(getGitDashboardScrollOffset(props.data, tab, selected))");
    expect(dashboardSource).toContain("width={layout.nameWidth}");
    expect(dashboardSource).toContain("clipText(branch.name, layout.nameWidth)");
    expect(dashboardSource).toContain("getVisibleGitDashboardTabs(props.tab, props.width)");
    expect(dashboardSource).not.toContain('flexWrap="wrap"');
  });

  it("normalizes main Return, Enter, keypad Enter and control sequences", () => {
    expect(isDashboardEnterKey("return")).toBe(true);
    expect(isDashboardEnterKey("enter")).toBe(true);
    expect(isDashboardEnterKey("kp_enter")).toBe(true);
    expect(isDashboardEnterKey("numpadenter")).toBe(true);
    expect(isDashboardEnterKey("unknown", "\r")).toBe(true);
    expect(isDashboardEnterKey("unknown", "\n")).toBe(true);
    expect(isDashboardEnterKey("escape")).toBe(false);
    expect(isDashboardEnterKey("space", " ")).toBe(false);
  });

  it("routes Enter on the selected branch to a real checkout and refresh", () => {
    expect(tuiSource).toContain('name === "enter" && dashboard.tab === "branches"');
    expect(tuiSource).toContain("dashboard.checkoutBranch(selectedBranch)");
    expect(tuiSource).toContain("Branch switch failed:");
    expect(dashboardSource).toContain("props.feedback?.message");
    expect(mainSource).toContain("runGitBranchAction(projectRoot, 'checkout', branch.name, branch.kind)");
    expect(mainSource).toContain("await refreshDashboard('branches', localName)");
  });

  it("uses one dashboard Show boundary and preserves the transcript fallback", () => {
    expect(tuiSource).toContain("<Show when={gitDashboardState()} fallback={");
    expect(tuiSource).not.toContain("<Show when={gitDashboardState()}>{(dashboard)");
  });
});
