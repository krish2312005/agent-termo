import { describe, expect, it } from "vitest";
import { FOOTER_SEPARATOR, formatFooter, type FooterOptions } from "../../src/ui/tui.js";

const SHORTCUTS = [
  "Ctrl+X navigate",
  "↑/↓ select",
  "Enter send",
  "Esc parent",
  "Ctrl+X Ctrl+K stop all",
];
const METER = "context ▰▰▰▰▱▱▱ 51%";
const TOKENS = "12k/23k";

const join = (...parts: string[]): string => parts.join(FOOTER_SEPARATOR);

const base = (overrides: Partial<FooterOptions> = {}): FooterOptions => ({
  context: { usedTokens: 11700, budgetTokens: 23000 },
  thinking: "low",
  permissionMode: "auto",
  usage: "~130,851 tokens",
  width: 200,
  ...overrides,
});

const lineAt = (width: number, overrides: Partial<FooterOptions> = {}): string =>
  formatFooter(base({ width, ...overrides }));

const CANONICAL =
  "Ctrl+X navigate · ↑/↓ select · Enter send · Esc parent · Ctrl+X Ctrl+K stop all · context ▰▰▰▰▱▱▱ 51% · 12k/23k · low · auto · session ~130,851";

describe("formatFooter canonical line", () => {
  it("renders the exact canonical composer line from DESIGN_SYSTEM §11.5", () => {
    expect(lineAt(200)).toBe(CANONICAL);
  });

  it("fits the canonical line without dropping at exactly its width", () => {
    expect(lineAt(143)).toBe(CANONICAL);
    expect([...CANONICAL]).toHaveLength(143);
  });

  it("computes the meter, percent, token counts, thinking, permission and usage from state", () => {
    const line = lineAt(200, {
      context: { usedTokens: 0, budgetTokens: 1000 },
      thinking: "high",
      permissionMode: "ask",
      usage: "0 tokens",
    });
    expect(line).toBe(join(...SHORTCUTS, "context ▱▱▱▱▱▱▱ 0%", "0/1k", "high", "ask", "session 0"));
  });

  it("renders a full meter and matching token counts at the budget", () => {
    const line = lineAt(200, { context: { usedTokens: 23000, budgetTokens: 23000 } });
    expect(line).toContain("context ▰▰▰▰▰▰▰ 100%");
    expect(line).toContain("23k/23k");
  });

  it("strips one trailing ` tokens` from usage while retaining the in-flight tilde", () => {
    const line = lineAt(200);
    expect(line).toContain("session ~130,851");
    expect(line).not.toContain("130,851 tokens");
    expect(lineAt(200, { usage: "~9" })).toContain("session ~9");
  });

  it("omits the context cluster entirely when context is absent", () => {
    const line = lineAt(200, { context: undefined });
    expect(line).toBe(join(...SHORTCUTS, "low", "auto", "session ~130,851"));
    expect(line).not.toContain("context");
    expect(line).not.toContain("▰");
    expect(line).not.toContain(TOKENS);
  });

  it("omits thinking when it is empty", () => {
    const line = lineAt(200, { thinking: "" });
    expect(line).toBe(join(...SHORTCUTS, METER, TOKENS, "auto", "session ~130,851"));
    expect(line).not.toContain("low");
  });

  it("omits usage when it is empty", () => {
    const line = lineAt(200, { usage: "" });
    expect(line).toBe(join(...SHORTCUTS, METER, TOKENS, "low", "auto"));
    expect(line).not.toContain("session ");
  });

  it("always renders the permission mode", () => {
    const expected: Record<string, string> = { ask: "ask", files: "files", auto: "auto" };
    for (const [mode, text] of Object.entries(expected)) {
      expect(lineAt(200, { permissionMode: mode as FooterOptions["permissionMode"] })).toContain(text);
    }
    for (const width of [4, 5, 13, 14, 20, 38, 40, 60, 80, 120, 200]) {
      expect(lineAt(width), `width ${width}`).toContain("auto");
    }
  });

  it("never returns a second row and never exceeds the width budget", () => {
    for (const width of [1, 5, 20, 38, 40, 60, 80, 120, 200]) {
      const line = lineAt(width);
      expect(line, `width ${width}`).not.toMatch(/[\r\n]/);
      expect([...line].length, `width ${width}`).toBeLessThanOrEqual(width);
    }
  });
});

describe("formatFooter documented drop order", () => {
  const cases: Array<{ width: number; expected: string }> = [
    { width: 142, expected: join(...SHORTCUTS, METER, TOKENS, "low", "auto") },
    { width: 123, expected: join(...SHORTCUTS, METER, TOKENS, "auto") },
    { width: 117, expected: join("Ctrl+X navigate", "Enter send", "Esc parent", "Ctrl+X Ctrl+K stop all", METER, TOKENS, "auto") },
    { width: 104, expected: join("Ctrl+X navigate", "Enter send", "Esc parent", "Ctrl+X Ctrl+K stop all", TOKENS, "auto") },
    { width: 82, expected: join("Ctrl+X navigate", "Enter send", "Ctrl+X Ctrl+K stop all", TOKENS, "auto") },
    { width: 69, expected: join("Ctrl+X navigate", "Ctrl+X Ctrl+K stop all", TOKENS, "auto") },
    { width: 56, expected: join("Ctrl+X Ctrl+K stop all", TOKENS, "auto") },
    { width: 38, expected: join(TOKENS, "auto") },
    { width: 13, expected: "auto" },
    { width: 1, expected: "…" },
  ];

  it("drops whole segments in the documented order and recomputes separators", () => {
    for (const { width, expected } of cases) {
      const line = lineAt(width);
      expect(line, `width ${width}`).toBe(expected);
      expect(line, `width ${width}`).not.toMatch(/^ · | · $| ·  · /);
    }
  });

  it("keeps the permission value when every other segment is gone", () => {
    expect(lineAt(14)).toBe("12k/23k · auto");
    expect(lineAt(4)).toBe("auto");
  });
});

describe("formatFooter state variants", () => {
  const navigatorFull = join(
    "↑/↓ select",
    "Enter focus composer",
    "Esc parent",
    "Ctrl+K stop terminal",
    "Ctrl+X Ctrl+K stop all",
    METER,
    TOKENS,
    "low",
    "auto",
    "session ~130,851",
  );

  it("renders the navigator shortcut cluster with the same context cluster", () => {
    const line = lineAt(200, { variant: "navigator" });
    expect(line).toBe(navigatorFull);
    expect(line).not.toContain("Ctrl+X navigate");
    expect(line).not.toContain("Enter send");
  });

  it("drops Ctrl+K stop terminal before Ctrl+X Ctrl+K stop all", () => {
    expect(lineAt(62, { variant: "navigator" })).toBe(
      join("Ctrl+K stop terminal", "Ctrl+X Ctrl+K stop all", TOKENS, "auto"),
    );
    expect(lineAt(61, { variant: "navigator" })).toBe(join("Ctrl+X Ctrl+K stop all", TOKENS, "auto"));
  });

  it("renders the modal variant with the context cluster", () => {
    const line = lineAt(200, { variant: "modal" });
    expect(line).toBe(
      join("Navigator paused · finish the prompt to continue", METER, TOKENS, "low", "auto", "session ~130,851"),
    );
  });

  it("clips the modal text with an ellipsis and keeps the permission value", () => {
    expect(lineAt(20, { variant: "modal" })).toBe("Navigator pa… · auto");
  });
});

describe("formatFooter transient status", () => {
  const status = "Stopped 2 agents.";

  it("replaces the shortcut cluster, keeps the context cluster and permission", () => {
    const line = lineAt(200, { status });
    expect(line).toBe(join(status, METER, TOKENS, "low", "auto", "session ~130,851"));
    for (const shortcut of ["Ctrl+X navigate", "↑/↓ select", "Enter send", "Esc parent", "Ctrl+X Ctrl+K stop all"]) {
      expect(line).not.toContain(shortcut);
    }
  });

  it("takes priority over navigator and modal shortcut clusters", () => {
    for (const variant of ["navigator", "modal"] as const) {
      const line = lineAt(200, { status: "Stopping terminal…", variant });
      expect(line.startsWith("Stopping terminal… · context ")).toBe(true);
      expect(line).not.toContain("Enter focus composer");
      expect(line).not.toContain("Navigator paused");
    }
  });

  it("drops 12k/23k first while keeping the context meter", () => {
    expect(lineAt(80, { status })).toBe(join(status, METER, TOKENS, "low", "auto"));
    expect(lineAt(61, { status })).toBe(join(status, METER, TOKENS, "auto"));
    expect(lineAt(55, { status })).toBe(join(status, METER, "auto"));
  });

  it("clips the status with … while keeping the meter and permission", () => {
    const clipped = lineAt(45, { status });
    expect(clipped).toBe(join("Stopped 2 agent…", METER, "auto"));
    expect(clipped).toContain(METER);
    expect(clipped.endsWith("auto")).toBe(true);
    expect(stringLength(clipped)).toBe(45);
  });

  it("keeps the meter and permission at extreme widths, clipping the status to …", () => {
    const line = lineAt(30, { status });
    expect(line).toBe(join("…", METER, "auto"));
    expect(stringLength(line)).toBe(30);
    expect(line).not.toContain(TOKENS);
    expect(line).not.toContain("low");
    expect(line).not.toContain("session");
  });
});

function stringLength(value: string): number {
  return [...value].length;
}
