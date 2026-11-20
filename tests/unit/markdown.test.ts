import { describe, it, expect, vi, afterEach } from 'vitest';
import { MarkdownPrinter, printDiffViewer, printToolResult } from '../../src/ui/index.js';
import { computeDiff } from '../../src/diff/index.js';

// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');

function capture(run: (spy: ReturnType<typeof vi.spyOn>) => void): string[] {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((data: string | Uint8Array) => {
    chunks.push(String(data));
    return true;
  });
  run(spy);
  return stripAnsi(chunks.join('')).split('\n');
}

afterEach(() => vi.restoreAllMocks());

describe('MarkdownPrinter', () => {
  it('prefixes the first line with a bullet and indents the rest', () => {
    const lines = capture(() => {
      const md = new MarkdownPrinter();
      md.push('Hello\nWorld\n');
      md.end();
    }).filter(Boolean);

    expect(lines).toEqual(['● Hello', '  World']);
  });

	it('renders headings, bullets, numbered lists and inline code without raw markers', () => {
    const lines = capture(() => {
      const md = new MarkdownPrinter();
      md.push('# Title\n- item with `code` and **bold**\n1. first\n');
      md.end();
    }).filter(Boolean);

		expect(lines).toEqual(['● Title', '  • item with code and bold', '  1. first']);
	});

	it('renders report-style emphasis and tables without leaking Markdown syntax', () => {
		const lines = capture(() => {
			const md = new MarkdownPrinter();
			md.push('1. **Critical: streaming is broken**\n\n| Severity | Count |\n|----------|-------|\n| Critical | 2 |\n');
			md.end();
		}).filter(Boolean);

		expect(lines.join('\n')).not.toContain('**');
		expect(lines.join('\n')).not.toContain('|----------|');
		expect(lines).toContain('● 1. Critical: streaming is broken');
	});

  it('draws fenced code blocks and keeps their contents verbatim', () => {
    const lines = capture(() => {
      const md = new MarkdownPrinter();
      md.push('```ts\nconst a = **1**;\n```\n');
      md.end();
    }).filter(Boolean);

    expect(lines).toEqual(['● ┌─ ts', '  │ const a = **1**;', '  └─']);
  });

	it('does not repeat the code gutter when a code line arrives in streamed fragments', () => {
		const lines = capture(() => {
			const md = new MarkdownPrinter();
			md.push('```html\n');
			md.flushPartial();
			for (const chunk of ['<script type="', 'module" src="/js/', 'main.js"></script>']) {
				md.push(chunk);
				md.flushPartial();
			}
			md.push('\n```\n');
			md.end();
		}).filter(Boolean);

		expect(lines).toEqual([
			'● ┌─ html',
			'  │ <script type="module" src="/js/main.js"></script>',
			'  └─',
		]);
	});

	it('renders every file change as a colored unified diff with a focused context window', () => {
		const originalContent = ['before', 'old value', 'after', ...Array.from({ length: 8 }, (_, i) => 'context ' + i)].join('\n');
		const proposedContent = ['before', 'new value', 'after', ...Array.from({ length: 8 }, (_, i) => 'context ' + i)].join('\n');
		const change = {
			path: 'src/example.ts',
			originalContent,
			proposedContent,
			diff: { ...computeDiff(originalContent, proposedContent), file: 'src/example.ts' },
			isNewFile: false,
			isDeletion: false,
		};
		const lines = capture(() => printDiffViewer(change)).filter(Boolean);

		expect(lines[0]).toContain('src/example.ts');
		expect(lines[0]).toContain('MODIFY');
		expect(lines[0]).toContain('+1');
		expect(lines[0]).toContain('-1');
		expect(lines.some((line) => line.includes('-   2') && line.includes('old value'))).toBe(true);
		expect(lines.some((line) => line.includes('+   2') && line.includes('new value'))).toBe(true);
	});

	it('prints terminal command output in the chat transcript', () => {
		const lines = capture(() => {
			printToolResult('bash:execute', { success: true, output: 'first line\nsecond line' });
		}).filter(Boolean);

		expect(lines.some((line) => line.includes('✓ terminal output') && line.includes('2 lines'))).toBe(true);
		expect(lines.some((line) => line.includes('inspect the preview above to expand'))).toBe(true);
		expect(lines).not.toContain('     first line');
		expect(lines).not.toContain('     second line');
	});

  it('holds a partial line until it is complete, and flushes it on end()', () => {
    const lines = capture(() => {
      const md = new MarkdownPrinter();
      md.push('par');
      md.push('tial');
      md.end();
    }).filter(Boolean);

    expect(lines).toEqual(['● partial']);
  });

  it('collapses blank lines and skips leading ones', () => {
    const lines = capture(() => {
      const md = new MarkdownPrinter();
      md.push('\n\nA\n\n\n\nB\n');
      md.end();
    });

    // a spacer before the answer, then A, a single blank line, B (and the split's trailing '')
    expect(lines).toEqual(['', '● A', '', '  B', '']);
  });

  it('calls beforeFirstOutput once, before anything is written', () => {
    const order: string[] = [];
    capture((spy) => {
      spy.mockImplementation((data: string | Uint8Array) => {
        order.push('write:' + stripAnsi(String(data)).trim());
        return true;
      });
      const md = new MarkdownPrinter(() => order.push('before'));
      md.push('one\ntwo\n');
      md.end();
    });

    expect(order.filter((o) => o === 'before')).toHaveLength(1);
    expect(order.indexOf('before')).toBeLessThan(order.findIndex((o) => o.includes('one')));
  });
});
