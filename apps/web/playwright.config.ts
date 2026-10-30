import { defineConfig, devices } from '@playwright/test';

const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  reporter: isCi ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-pixel-7', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev',
    cwd: '../..',
    env: { SOURCES_MODE: 'fixtures' },
    url: 'http://localhost:5173',
    reuseExistingServer: !isCi,
    timeout: 120_000,
  },
});
