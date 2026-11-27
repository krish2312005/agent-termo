import { readFileSync } from "node:fs";
import { isDashboardEnterKey } from "../../src/ui/git-dashboard.js";
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
    expect(dashboardSource).toContain("LANE {props.row.laneIndex + 1}");
    expect(dashboardSource).toContain("backgroundColor={color}");
  });

  it("normalizes main Return, Enter, keypad Enter and control sequences", () => {
    expect(isDashboardEnterKey("return")).toBe(true);
    expect(isDashboardEnterKey("enter")).toBe(true);
    expect(isDashboardEnterKey("kp_enter")).toBe(true);
    expect(isDashboardEnterKey("numpadenter")).toBe(true);
    expect(isDashboardEnterKey("unknown", "\\r")).toBe(true);
    expect(isDashboardEnterKey("unknown", "\\n")).toBe(true);
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
