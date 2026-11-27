import { readFileSync } from "node:fs";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

const dashboardSource = readFileSync(new URL("../../src/ui/git-dashboard.tsx", import.meta.url), "utf8");
const tuiSource = readFileSync(new URL("../../src/ui/tui.tsx", import.meta.url), "utf8");

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

  it("uses one dashboard Show boundary and preserves the transcript fallback", () => {
    expect(tuiSource).toContain("<Show when={gitDashboardState()} fallback={");
    expect(tuiSource).not.toContain("<Show when={gitDashboardState()}>{(dashboard)");
  });
});
