import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/load/**/*.test.ts'],
    testTimeout: 60_000,
    // Remove once T096 adds the peak load test.
    passWithNoTests: true,
  },
});
