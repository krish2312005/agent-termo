// =============================================================================
// ANSI Color Utilities
// =============================================================================

// Design System colors (ANSI 256-color codes for cross-platform terminal)
export const COLORS = {
  // Primary: #A855F7 → ANSI 135
  primary:    '\x1b[38;5;135m',
  primaryBg:   '\x1b[48;5;57m',

  // Semantic
  success:    '\x1b[38;5;82m',   // green-500
  warning:    '\x1b[38;5;214m',  // amber-500
  error:      '\x1b[38;5;203m',  // red-500
  info:       '\x1b[38;5;75m',   // blue-500

  // Dark theme neutrals
  background: '\x1b[48;5;17m',  // slate-900
  surface:    '\x1b[48;5;30m',  // slate-800
  elevated:   '\x1b[48;5;31m',  // slate-700
  border:     '\x1b[38;5;240m',  // #646B7B
  borderLight:'\x1b[38;5;241m', // #7C8796

  // Text
  text:        '\x1b[38;5;255m', // slate-50
  textSecondary:'\x1b[38;5;188m',// slate-300
  muted:       '\x1b[38;5;250m', // slate-400
  dim:         '\x1b[38;5;244m', // slate-400

  // Agent badge colors
  manager:   '\x1b[38;5;135m',  // purple
  architect: '\x1b[38;5;75m',   // blue
  expert:    '\x1b[38;5;82m',   // green
  security:  '\x1b[38;5;214m',  // amber

  // Code syntax
  codeKeyword:  '\x1b[38;5;219m', // pink-400
  codeString:   '\x1b[38;5;114m', // green-400
  codeComment:  '\x1b[38;5;245m', // gray-400
  codeFunction: '\x1b[38;5;75m',  // blue-400
  codeType:     '\x1b[38;5;171m', // emerald-400

  // Roles
  userMsg:  '\x1b[38;5;82m',   // green for user
  aiMsg:    '\x1b[38;5;135m',  // purple for AI

  // Decorators
  accent:   '\x1b[38;5;75m',  // blue accent

  // Reset
  reset:    '\x1b[0m',
  bright:   '\x1b[1m',
  dim_text: '\x1b[2m',
  italic:   '\x1b[3m',
  underline:'\x1b[4m',
};

export const BG = {
  surface:   '\x1b[48;5;30m',
  elevated:  '\x1b[48;5;31m',
  primaryBg: '\x1b[48;5;57m',
};

export const FMT = {
  bold: '\x1b[1m',
  dim:  '\x1b[2m',
  ita:  '\x1b[3m',
  ul:   '\x1b[4m',
  reset: '\x1b[0m',
};

// Escape helpers
export function color(colorCode: string, text: string): string {
  return `${colorCode}${text}${COLORS.reset}`;
}

export function bg(colorCode: string, text: string): string {
  return `${colorCode}${text}${COLORS.reset}`;
}

export function bold(text: string): string {
  return `${FMT.bold}${text}${FMT.reset}`;
}

export function dim(text: string): string {
  return `${FMT.dim}${text}${FMT.reset}`;
}

// Spinner frames (80ms per frame, 12 chars cycle)
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;

export function spinnerFrame(): string {
  const frame = SPINNER_FRAMES[spinnerIndex % SPINNER_FRAMES.length];
  spinnerIndex++;
  return frame ?? ' ';
}

export function resetSpinner(): void {
  spinnerIndex = 0;
}

// Box drawing helpers
export function hbar(length: number, char = '─'): string {
  return char.repeat(length);
}

export function clamp(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

// Progress bar
export function progressBar(percent: number, width = 30): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return `[${COLORS.success}${'█'.repeat(filled)}${'░'.repeat(empty)}${COLORS.reset}]`;
}

// Agent badge color
export function agentColor(agentName: string): string {
  const lower = agentName.toLowerCase();
  if (lower.includes('project-manager')) return COLORS.manager;
  if (lower.includes('architecture') || lower.includes('stack')) return COLORS.architect;
  if (lower.includes('security') || lower.includes('deploy')) return COLORS.security;
  return COLORS.expert;
}

// Clear line (ANSI)
export const clearLine = '\x1b[2K\r';
export const clearScreen = '\x1b[2J';
export const cursorHome = '\x1b[H';
export const hideCursor = '\x1b[?25l';
export const showCursor = '\x1b[?25h';