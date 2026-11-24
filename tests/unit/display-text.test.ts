import { describe, expect, it } from 'vitest';
import { sanitizeDisplayLine, sanitizeDisplayText } from '../../src/ui/display-text.js';

const ESC = '\x1b';
const BEL = '\x07';
const ST = ESC + '\\';

describe('sanitizeDisplayText', () => {
  it('strips 7-bit and 8-bit CSI sequences and keeps the surrounding text', () => {
    expect(sanitizeDisplayText(ESC + '[31mred' + ESC + '[0m')).toBe('red');
    expect(sanitizeDisplayText('a' + ESC + '[2Jb')).toBe('ab');
    expect(sanitizeDisplayText('a' + ESC + '[?25lb')).toBe('ab');
    expect(sanitizeDisplayText('a' + ESC + '[1;2;3Hb')).toBe('ab');

    expect(sanitizeDisplayText('\x9b31mred\x9b0m')).toBe('red');
    expect(sanitizeDisplayText('a\x9b2Jb')).toBe('ab');
  });

  it('strips 7-bit and 8-bit OSC sequences terminated by BEL or ST', () => {
    expect(sanitizeDisplayText('a' + ESC + ']0;title' + BEL + 'b')).toBe('ab');
    expect(sanitizeDisplayText('a' + ESC + ']8;;http://evil.example' + ST + 'b')).toBe('ab');
    expect(sanitizeDisplayText('a\x9d0;title\x07b')).toBe('ab');
    expect(sanitizeDisplayText('a\x9d0;title' + ST + 'b')).toBe('ab');
  });

  it('strips 7-bit DCS, SOS, PM and APC strings terminated by ST', () => {
    for (const introducer of [ESC + 'P', ESC + 'X', ESC + '^', ESC + '_']) {
      expect(sanitizeDisplayText('a' + introducer + 'payload' + ST + 'b'), JSON.stringify(introducer)).toBe('ab');
    }
  });

  it('strips 8-bit DCS, SOS, PM and APC strings terminated by ST', () => {
    for (const introducer of ['\x90', '\x98', '\x9e', '\x9f']) {
      expect(sanitizeDisplayText('a' + introducer + 'payload' + ST + 'b'), JSON.stringify(introducer)).toBe('ab');
    }
  });

  it('drops other two-character ESC sequences and a lone ESC without eating later text', () => {
    expect(sanitizeDisplayText('a' + ESC + '7b')).toBe('ab');
    expect(sanitizeDisplayText('a' + ESC + '=b')).toBe('ab');
    expect(sanitizeDisplayText('a' + ESC + '(Bb')).toBe('aBb');
    expect(sanitizeDisplayText('a' + ESC + 'b')).toBe('a');
    expect(sanitizeDisplayText('abc' + ESC)).toBe('abc');
    expect(sanitizeDisplayText(ESC)).toBe('');
    expect(sanitizeDisplayText('a' + ESC + ESC + '[31mb')).toBe('ab');
  });

  it('removes BEL, remaining C0/C1 controls, DEL and CR', () => {
    for (const control of ['\x00', '\x01', '\x07', '\x08', '\x0b', '\x0c', '\x0d', '\x1f', '\x7f', '\x80', '\x81', '\x85', '\x86', '\x9c']) {
      expect(sanitizeDisplayText('a' + control + 'b'), `control ${JSON.stringify(control)}`).toBe('ab');
    }

    expect(sanitizeDisplayText('line one\r\nline two')).toBe('line oneline two');
  });

  it('preserves ASCII, accented text, CJK and emoji unchanged', () => {
    const text = 'Hello, 世界! 🚀👨‍👩‍👧‍👦 café — naïve';
    expect(sanitizeDisplayText(text)).toBe(text);
    expect(sanitizeDisplayText('前端专家-测试')).toBe('前端专家-测试');
  });

  it('does not strip legitimate punctuation or bracket characters', () => {
    const punctuation = 'Array[0] ({a,b}) => a|b & c; `x` ~ \'r\' #tag @u $1 100% ^ _ P X ] [ ( ) { } < > "quoted" \\';
    expect(sanitizeDisplayText(punctuation)).toBe(punctuation);
  });

  it('drops newlines by default and preserves them only when asked', () => {
    expect(sanitizeDisplayText('a\nb')).toBe('ab');
    expect(sanitizeDisplayText('a\nb', { keepNewlines: true })).toBe('a\nb');
    expect(sanitizeDisplayText('a\r\nb', { keepNewlines: true })).toBe('a\nb');
    expect(sanitizeDisplayText('a\r\nb', { keepNewlines: false })).toBe('ab');
  });

  it('drops unterminated control strings instead of hanging or leaking the payload', () => {
    expect(sanitizeDisplayText('before' + ESC + ']0;never')).toBe('before');
    expect(sanitizeDisplayText('before' + ESC + ']8;;http://evil.example' + 'no terminator')).toBe('before');
    expect(sanitizeDisplayText('before' + ESC + 'Pnever')).toBe('before');
    expect(sanitizeDisplayText('before' + ESC + 'Xnever')).toBe('before');
    expect(sanitizeDisplayText('before' + ESC + '^never')).toBe('before');
    expect(sanitizeDisplayText('before' + ESC + '_never')).toBe('before');
    expect(sanitizeDisplayText('before\x9dnever')).toBe('before');
    expect(sanitizeDisplayText('before\x9b31')).toBe('before');
    expect(sanitizeDisplayText('before\x1b')).toBe('before');
  });

  it('processes a long 8k input in linear time', () => {
    const plain = 'a'.repeat(8_192);
    expect(sanitizeDisplayText(plain)).toBe(plain);

    const mixed = 'a'.repeat(4_096) + ESC + '[31m' + 'b'.repeat(4_096);
    expect(sanitizeDisplayText(mixed)).toBe('a'.repeat(4_096) + 'b'.repeat(4_096));

    const unterminated = 'x' + ESC + ']8;;' + 'a'.repeat(8_192);
    expect(sanitizeDisplayText(unterminated)).toBe('x');
  });

  it('returns an empty string for empty or non-string input', () => {
    expect(sanitizeDisplayText('')).toBe('');
    expect(sanitizeDisplayText(undefined as unknown as string)).toBe('');
    expect(sanitizeDisplayText(null as unknown as string)).toBe('');
    expect(sanitizeDisplayText(42 as unknown as string)).toBe('');
  });
});

describe('sanitizeDisplayLine', () => {
  it('strips controls and flattens every whitespace run to one space', () => {
    expect(sanitizeDisplayLine(' a\n\tb ' + ESC + '[2Jc ')).toBe('a b c');
    expect(sanitizeDisplayLine('line one\r\nline two')).toBe('line one line two');
    expect(sanitizeDisplayLine('a' + ESC + ']0;title' + BEL + 'b')).toBe('ab');
  });

  it('trims, preserves CJK/emoji and returns empty for control-only input', () => {
    expect(sanitizeDisplayLine('  前端 🚀  ')).toBe('前端 🚀');
    expect(sanitizeDisplayLine(BEL + ESC + '[2J\r\n')).toBe('');
    expect(sanitizeDisplayLine('')).toBe('');
  });
});
