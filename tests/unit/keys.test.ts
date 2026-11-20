import { describe, it, expect } from 'vitest';
import { parseKeys, terminalInputForKey } from '../../src/ui/screen.js';

const parse = (chunk: string, state: { paste: string | null } = { paste: null }) => parseKeys(chunk, state);

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
    expect(names('\x1b[Z')).toEqual(['shift+tab']);
    expect(names('\x1bOH\x1bOF')).toEqual(['home', 'end']);
    expect(names('\x1b[3~')).toEqual(['delete']);
    expect(names('\x1b[1;5D\x1b[1;5C')).toEqual(['word-left', 'word-right']);
  });

  it('encodes navigation keys for the active PTY', () => {
    expect(terminalInputForKey('up')).toBe('\x1b[A');
    expect(terminalInputForKey('down')).toBe('\x1b[B');
    expect(terminalInputForKey('left')).toBe('\x1b[D');
    expect(terminalInputForKey('right')).toBe('\x1b[C');
    expect(terminalInputForKey('tab')).toBe('\t');
    expect(terminalInputForKey('shift+tab')).toBe('\x1b[Z');
    expect(terminalInputForKey('unknown')).toBeNull();
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
