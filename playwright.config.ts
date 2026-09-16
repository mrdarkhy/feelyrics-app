import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

const PORT = Number(process.env.PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * Some sandboxes and CI images ship a Chromium that does not match the revision
 * this Playwright version would download. `PLAYWRIGHT_CHROMIUM_EXECUTABLE`
 * points at whatever is actually installed; when it is unset (a normal machine,
 * or CI after `npx playwright install`) Playwright resolves its own.
 */
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const executablePath =
  chromiumPath && fs.existsSync(chromiumPath) ? chromiumPath : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'line',
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL,
    trace: 'on-first-retry',
    launchOptions: executablePath ? { executablePath } : {},
  },

  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // The catalogue's readers are overwhelmingly on phones, so the mobile
    // viewport is a first-class target rather than an afterthought.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],

  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
