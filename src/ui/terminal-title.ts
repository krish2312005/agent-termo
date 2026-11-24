/**
 * Terminal title (Carbon Forge branding) with a restore path.
 *
 * Two mechanisms are used together:
 * - OSC 2 sets the xterm.js window/tab title. The xterm title stack
 *   (`CSI 22;2t` push, `CSI 23;2t` pop) is honored by the VS Code integrated
 *   terminal, so the previous title comes back on exit without guessing it.
 * - `process.title` is set because VS Code's default tab title uses the
 *   foreground process name; the previous value is restored on exit.
 *
 * Everything is best-effort and testable without a real terminal: writes,
 * TTY detection and title access are injectable, and the module never writes
 * anything but the fixed, trusted `APP_TITLE`.
 */

export const APP_TITLE = "Agent-Termo";
/** xterm.js title-stack push (save the current title). */
export const TITLE_STACK_SAVE = "\x1b[22;2t";
/** xterm.js title-stack pop (restore the saved title). */
export const TITLE_STACK_RESTORE = "\x1b[23;2t";

/** OSC 2: set the window/tab title. Control characters are stripped defensively. */
export function setTitleSequence(title: string = APP_TITLE): string {
  return "\x1b]2;" + title.replace(/[\u0000-\u001f\u007f]/g, "") + "\x07";
}

export interface TerminalTitleIO {
  /** Writes one terminal escape-sequence string. Defaults to stdout. */
  writer?: (sequence: string) => void;
  /** Whether stdout is an interactive terminal. Defaults to `process.stdout.isTTY`. */
  isTTY?: boolean;
  /** Sets the process title. Defaults to assigning `process.title`. */
  setProcessTitle?: (title: string) => void;
  /** Reads the current process title so it can be restored. */
  getProcessTitle?: () => string;
}

interface ActiveTitle {
  writer: (sequence: string) => void;
  setProcessTitle: (title: string) => void;
  previousProcessTitle: string;
}

let active: ActiveTitle | null = null;
let exitHandlerRegistered = false;

const safe = (action: () => void): void => {
  try {
    action();
  } catch {
    // A missing/broken terminal must never prevent startup or shutdown.
  }
};

/**
 * Enter Agent-Termo's title: push the current title, set the new one, and set
 * `process.title`. No-op when stdout is not a TTY or when already installed,
 * so repeated calls never push duplicate save/restore sequences.
 */
export function installTerminalTitle(io: TerminalTitleIO = {}): boolean {
  if (active) return false;
  const isTTY = io.isTTY ?? Boolean(process.stdout.isTTY);
  if (!isTTY) return false;
  const writer = io.writer ?? ((sequence: string) => { process.stdout.write(sequence); });
  const setProcessTitle = io.setProcessTitle ?? ((title: string) => { process.title = title; });
  const getProcessTitle = io.getProcessTitle ?? (() => process.title);
  let previousProcessTitle = "";
  safe(() => { previousProcessTitle = getProcessTitle(); });
  active = { writer, setProcessTitle, previousProcessTitle };
  safe(() => setProcessTitle(APP_TITLE));
  safe(() => writer(TITLE_STACK_SAVE + setTitleSequence()));
  if (!exitHandlerRegistered) {
    exitHandlerRegistered = true;
    // Last-resort fallback for flows that bypass cleanup(); idempotent restore
    // makes the normal cleanup() call a no-op.
    process.once("exit", () => { restoreTerminalTitle(); });
  }
  return true;
}

/**
 * Pop the saved title and restore the previous process title. Returns false
 * when nothing was installed. The writer/title setter from install() are
 * reused unless explicitly overridden, so tests can install and restore with
 * fakes and never touch the real terminal.
 */
export function restoreTerminalTitle(io: TerminalTitleIO = {}): boolean {
  const current = active;
  if (!current) return false;
  active = null;
  safe(() => (io.writer ?? current.writer)(TITLE_STACK_RESTORE));
  safe(() => (io.setProcessTitle ?? current.setProcessTitle)(current.previousProcessTitle));
  return true;
}

/** Test seam: forget the installed state without writing anything. */
export function resetTerminalTitleForTests(): void {
  active = null;
}
