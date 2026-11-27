/**
 * Warm Terminal — the restored pre-Carbon-Forge palette; the single source of
 * truth for live TUI colors.
 *
 * History: Carbon Forge (2026-11-23) replaced this palette and was reverted at
 * the user's request. The values below are the exact pre-Carbon-Forge hexes
 * from a9f0892:src/ui/tui.tsx, cross-checked against the verified pre-theme
 * table in docs/DESIGN_SYSTEM.md §10.1. There is no ThemeProvider, no light
 * mode, and no runtime theme switching: this is a flat token module.
 *
 * WCAG 2.x contrast ratios (rounded) against #11100F:
 *   text 14.6   detail 10.7   textAlt 11.6   selection 10.4
 *   userSuccess 10.1   info 8.9   toolWaiting 8.7   running 8.6
 *   mutedCompletion 7.7   brand 7.4   error 6.8   mutedPicker 5.5
 *   muted 5.2   mutedHeader 5.0   dim 5.0   permissionAuto 6.1 (as text;
 *   always paired with the `auto` label)   border 3.2 (structural; also the
 *   restored assistant label, never the only carrier of meaning)
 *
 * Diff rows keep their historical pairing: #B7E4C7 on #17351F,
 * #F0B4AE on #3A1D1D, and #BDB6AE context on #11100F.
 */

const SOURCE = {
  background: "#11100F",
  border: "#6D625A",
  brand: "#D99168",
  text: "#E6E1DC",
  muted: "#8D857D",
  dim: "#88827C",
  detail: "#C9C1BA",
  textAlt: "#D0C9C2",
  mutedHeader: "#89827C",
  mutedPicker: "#8F8982",
  mutedCompletion: "#8EAAA8",
  selection: "#F0B38D",
  userSuccess: "#8FCB9B",
  info: "#8BB7D8",
  toolWaiting: "#79B8D1",
  running: "#E2A078",
  error: "#E47D76",
  permissionAuto: "#FF5555",
  /** Diff add text; used on diffAddSurface. */
  diffAddText: "#B7E4C7",
  diffAddSurface: "#17351F",
  /** Diff remove text; used on diffRemoveSurface. */
  diffRemoveText: "#F0B4AE",
  diffRemoveSurface: "#3A1D1D",
  diffContextText: "#BDB6AE",
  markdownHeading2: "#D7A27C",
  markdownRaw: "#9CCB9C",
} as const;

/** Exact palette values. */
export const COLORS = {
  ...SOURCE,
} as const;

/** Stable semantic palette used by the Git ancestry lanes. */
export const GIT_GRAPH_COLORS = [
  COLORS.brand,
  COLORS.info,
  COLORS.toolWaiting,
  COLORS.markdownHeading2,
  COLORS.error,
  COLORS.selection,
  COLORS.mutedCompletion,
] as const;

export type ColorToken = keyof typeof COLORS;

/**
 * Semantic roles used by the live UI. Values are the token hexes so call
 * sites can consume a role directly without a second lookup or abstraction.
 */
export const ROLES = {
  pageBackground: COLORS.background,
  /** Faithful derivation: pre-theme panels had no fill, so #11100F showed through. */
  panelSurface: COLORS.background,
  border: COLORS.border,

  selection: COLORS.selection,
  brand: COLORS.brand,
  tool: COLORS.toolWaiting,
  info: COLORS.info,
  approval: COLORS.toolWaiting,
  success: COLORS.userSuccess,
  error: COLORS.error,

  text: COLORS.text,
  mutedText: COLORS.muted,
  dimText: COLORS.dim,
  detailText: COLORS.detail,
  textAlt: COLORS.textAlt,
  mutedHeader: COLORS.mutedHeader,
  mutedPicker: COLORS.mutedPicker,
  mutedCompletion: COLORS.mutedCompletion,

  userLabel: COLORS.userSuccess,
  userText: COLORS.userSuccess,
  assistantLabel: COLORS.border,
  subagentLabel: COLORS.muted,

  composerBorder: COLORS.border,
  permissionAsk: COLORS.border,
  permissionFiles: COLORS.brand,
  permissionAuto: COLORS.permissionAuto,

  statusIdle: COLORS.muted,
  statusRunning: COLORS.running,
  statusWaiting: COLORS.toolWaiting,
  statusCompleted: COLORS.userSuccess,
  statusFailed: COLORS.error,
  statusStopped: COLORS.dim,

  diffAddText: COLORS.diffAddText,
  diffAddSurface: COLORS.diffAddSurface,
  diffRemoveText: COLORS.diffRemoveText,
  diffRemoveSurface: COLORS.diffRemoveSurface,
  diffContextText: COLORS.diffContextText,

  markdownText: COLORS.text,
  markdownHeading1: COLORS.running,
  markdownHeading2: COLORS.markdownHeading2,
  markdownLink: COLORS.toolWaiting,
  markdownRaw: COLORS.markdownRaw,
  markdownList: COLORS.markdownHeading2,

  pickerText: COLORS.textAlt,
  pickerMuted: COLORS.mutedPicker,
  completionText: COLORS.mutedCompletion,
  terminalCommand: COLORS.muted,
  terminalHint: COLORS.border,
  terminalOutput: COLORS.detail,
} as const;

export type ColorRole = keyof typeof ROLES;
