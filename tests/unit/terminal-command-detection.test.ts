import { describe, expect, it } from 'vitest';
import { isLongRunningServerCommand } from '../../src/tools/index.js';

describe('long-running server command detection', () => {
  it('recognizes common development and preview servers', () => {
    expect(isLongRunningServerCommand('npm run dev')).toBe(true);
    expect(isLongRunningServerCommand('pnpm run preview -- --host 0.0.0.0')).toBe(true);
    expect(isLongRunningServerCommand('bun start')).toBe(true);
    expect(isLongRunningServerCommand('python3 -m http.server 8000')).toBe(true);
  });

  it('does not background ordinary project checks', () => {
    expect(isLongRunningServerCommand('npm run test')).toBe(false);
    expect(isLongRunningServerCommand('pnpm run build')).toBe(false);
    expect(isLongRunningServerCommand('bun run typecheck')).toBe(false);
  });
});
