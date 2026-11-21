import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The app uses Bun's Solid preload in production; Vitest needs its own TSX transform.
  oxc: {
    jsx: { runtime: 'automatic', importSource: '@opentui/solid' },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.ts',
        'vitest.config.ts',
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});