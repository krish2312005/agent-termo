import { describe, it, expect } from 'vitest';
import { parseKeys } from '../../src/ui/screen.js';
import { isPromptSubmitKey, promptInputHeight, promptInputKeyBindings, usesLegacyAppleTerminal } from '../../src/ui/tui.js';

const parse = (chunk: string, state: { paste: string | null } = { paste: null }) => parseKeys(chunk, state);

describe('prompt keyboard bindings', () => {
  it('recognizes Return and keypad Enter as prompt submission keys', () => {
    expect(isPromptSubmitKey('enter')).toBe(true);
    expect(isPromptSubmitKey('kpenter')).toBe(true);
    expect(isPromptSubmitKey('shift+enter')).toBe(false);
    expect(isPromptSubmitKey('escape')).toBe(false);
  });

  it('uses native Shift+Enter newline and Enter submit bindings where modifiers are reported', () => {
    expect(promptInputKeyBindings(false)).toEqual([
      { name: 'return', shift: true, action: 'newline' },
      { name: 'return', meta: true, action: 'newline' },
      { name: 'return', ctrl: true, action: 'newline' },
      { name: 'return', ctrl: false, shift: false, meta: false, action: 'submit' },
    ]);
  });

  it('uses Return to submit in macOS Terminal and Shift+Return for newlines', () => {
    expect(usesLegacyAppleTerminal('darwin', 'Apple_Terminal')).toBe(true);
    expect(usesLegacyAppleTerminal('darwin', 'iTerm.app')).toBe(false);
    expect(usesLegacyAppleTerminal('linux', 'Apple_Terminal')).toBe(false);
    expect(promptInputKeyBindings(true)).toEqual([
      { name: 'return', shift: true, action: 'newline' },
      { name: 'return', meta: true, action: 'newline' },
      { name: 'return', ctrl: true, action: 'newline' },
      { name: 'return', ctrl: false, shift: false, meta: false, action: 'submit' },
    ]);
  });
});

describe('promptInputHeight', () => {
  it('keeps a minimum three-row input for short prompts', () => {
    expect(promptInputHeight('', 40)).toBe(3);
    expect(promptInputHeight('hello', 40)).toBe(3);
  });

  it('expands for explicit newlines and wrapped long lines', () => {
    expect(promptInputHeight('one\ntwo\nthree\nfour', 40)).toBe(4);
    expect(promptInputHeight('12345678901234567890', 10)).toBe(3);
    expect(promptInputHeight('1234567890123456789012345678901234567890', 10)).toBe(4);
  });

  it('caps the input height so large prompts do not take over the terminal', () => {
    expect(promptInputHeight('line\n'.repeat(20), 40, 8)).toBe(8);
  });
});

describe('parseKeys', () => {
  it('merges consecutive printable characters into one text key', () => {
    expect(parse('hello world')).toEqual([{ name: 'text', text: 'hello world' }]);
  });

  it('keeps multi-byte characters intact', () => {
    expect(parse('héllo 🙂')).toEqual([{ name: 'text', text: 'héllo 🙂' }]);
  });

  it('recognises control and navigation keys', () => {
    const names = (s: string) => parse(s).map((k) => k.name);
    expect(names('\r')).toEqual(['enter']);
    expect(names('\x03')).toEqual(['ctrl+c']);
    expect(names('\x7f')).toEqual(['backspace']);
    expect(names('\x1b[A\x1b[B\x1b[C\x1b[D')).toEqual(['up', 'down', 'right', 'left']);
    expect(names('\x1bOH\x1bOF')).toEqual(['home', 'end']);
    expect(names('\x1b[3~')).toEqual(['delete']);
    expect(names('\x1b[1;5D\x1b[1;5C')).toEqual(['word-left', 'word-right']);
  });

  it('splits typed text around keys in the same chunk', () => {
    expect(parse('ab\x1b[Dc')).toEqual([
      { name: 'text', text: 'ab' },
      { name: 'left' },
      { name: 'text', text: 'c' },
    ]);
  });

  it('treats a lone escape as escape, and unknown sequences as ignorable', () => {
    expect(parse('\x1b')).toEqual([{ name: 'escape' }]);
    expect(parse('\x1b[99~')).toEqual([{ name: 'unknown' }]);
  });

  it('delivers a bracketed paste as a single key, newlines included', () => {
    expect(parse('\x1b[200~line one\nline two\x1b[201~')).toEqual([
      { name: 'paste', text: 'line one\nline two' },
    ]);
  });

  it('maps ESC+CR (macOS Terminal Shift+Enter) to shift+enter', () => {
    const names = (s: string) => parse(s).map((k) => k.name);
    expect(names('\x1b\r')).toEqual(['shift+enter']);
    expect(names('\x1b\n')).toEqual(['shift+enter']);
  });

  it('maps line feed and kitty shift-enter to shift+enter for multi-line input', () => {
    const names = (s: string) => parse(s).map((k) => k.name);
    expect(names('\n')).toEqual(['shift+enter']);
    expect(names('\x1b[13;2u')).toEqual(['shift+enter']);
    expect(names('\x1b[13;5u')).toEqual(['shift+enter']);
  });

  it('carries a paste across chunks', () => {
    const state = { paste: null as string | null };
    expect(parse('\x1b[200~first half ', state)).toEqual([]);
    expect(parse('second half\x1b[201~x', state)).toEqual([
      { name: 'paste', text: 'first half second half' },
      { name: 'text', text: 'x' },
    ]);
  });
});
