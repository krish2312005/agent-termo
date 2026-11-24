/**
 * Carbon Forge — the single source of truth for live TUI colors.
 *
 * Foundation palette (the eight exact values from the visual brief):
 *   background #101512, surface #19211D, border #27332C, text #E5EDE6,
 *   accent #B5D98A, copper #D69B69, teal #83B9A2, error #E17D75.
 *
 * Derived tokens exist only where the foundation palette cannot express a
 * live role. Every derivation is documented below. There is no ThemeProvider,
 * no light mode, and no runtime theme switching: this is a flat token module.
 *
 * WCAG 2.x contrast ratios (rounded) against #101512 / #19211D:
 *   text 15.5 / 13.8   accent 11.7 / 10.4   copper 7.7 / 6.9
 *   teal  8.3 /  7.4   error   6.5 /  5.8   textMuted 8.0 / 7.1
 *   textDim 5.4 / 4.8  border  1.4 /  1.3 (decorative only; focus is never
 *   border-only)
 *
 * Semantic rules:
 *   - copper = branding and tool execution
 *   - teal = informational states and sub-agents
 *   - accent (lime) = active selection, focus, success/completed
 *   - error = failures and destructive feedback; the legacy bright-red
 *     permission border is banned
 */
export const COLORS = {
  background: "#101512",
  surface: "#19211D",
  border: "#27332C",
  text: "#E5EDE6",
  accent: "#B5D98A",
  copper: "#D69B69",
  teal: "#83B9A2",
  error: "#E17D75",

  /** Derived: 70% text + 30% background (sRGB). Secondary text. */
  textMuted: "#A5ACA6",
  /** Derived: 55% text + 45% background (sRGB). Metadata, hints, separators. */
  textDim: "#858C87",
  /** Derived: 15% accent + 85% background (sRGB). Diff add row fill. */
  diffAddSurface: "#293224",
  /** Derived: 15% error + 85% background (sRGB). Diff remove row fill. */
  diffRemoveSurface: "#2F2521",
} as const;

export type ColorToken = keyof typeof COLORS;

/**
 * Semantic roles used by the live UI. Values are the token hexes so call
 * sites can consume a role directly without a second lookup or abstraction.
 */
export const ROLES = {
  pageBackground: COLORS.background,
  panelSurface: COLORS.surface,
  border: COLORS.border,

  focus: COLORS.accent,
  selection: COLORS.accent,
  brand: COLORS.copper,
  tool: COLORS.copper,
  info: COLORS.teal,
  subagent: COLORS.teal,
  success: COLORS.accent,
  error: COLORS.error,

  text: COLORS.text,
  mutedText: COLORS.textMuted,
  dimText: COLORS.textDim,

  userLabel: COLORS.accent,
  userText: COLORS.text,
  assistantLabel: COLORS.textMuted,
  subagentLabel: COLORS.teal,

  composerBorder: COLORS.border,
  composerBorderFocused: COLORS.accent,

  statusIdle: COLORS.textDim,
  statusRunning: COLORS.copper,
  statusWaiting: COLORS.teal,
  statusCompleted: COLORS.accent,
  statusFailed: COLORS.error,
  statusStopped: COLORS.textDim,

  diffAddText: COLORS.accent,
  diffAddSurface: COLORS.diffAddSurface,
  diffRemoveText: COLORS.error,
  diffRemoveSurface: COLORS.diffRemoveSurface,
  diffContextText: COLORS.textMuted,

  markdownText: COLORS.text,
  markdownHeading1: COLORS.accent,
  markdownHeading2: COLORS.teal,
  markdownLink: COLORS.teal,
  markdownRaw: COLORS.copper,
  markdownList: COLORS.copper,
} as const;

export type ColorRole = keyof typeof ROLES;
