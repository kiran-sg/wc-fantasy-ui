import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4200',
    headless: true,
    video: 'on',
    screenshot: 'on',
    trace: 'on',
  },
  outputDir: './e2e/test-results',
  reporter: [['html', { outputFolder: './e2e/playwright-report' }]],
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});
