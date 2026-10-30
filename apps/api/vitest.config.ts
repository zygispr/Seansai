import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Load tests start a real server for ~20 s; they run separately via `npm run test:load`.
    exclude: [...configDefaults.exclude, 'tests/load/**'],
  },
});
