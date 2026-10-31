import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/load/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
