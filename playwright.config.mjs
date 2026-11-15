import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: process.env.NETEXPERT_PLAYWRIGHT_OUTPUT || './test-results',
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
  },
});
