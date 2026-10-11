/**
 * End-to-end journeys (Phase 22) against the running stack — locally `docker compose up`, in CI the
 * same compose stack. They create their own users (fresh phone numbers) and read the OTP from the
 * page's local-development hint, so they never run against production (the API refuses console SMS
 * there).
 */
import { defineConfig, devices } from '@playwright/test';

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: './tests',
  globalSetup: './support/global-setup.ts',
  fullyParallel: false,
  // Journeys share one database and one IP: run them one after another.
  workers: 1,
  retries: ci ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: ci
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:3000',
    locale: 'ar-EG',
    timezoneId: 'Africa/Cairo',
    // The design honours reduced motion: pages settle at once, and axe measures final colours.
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: ci ? 'retain-on-failure' : 'off',
    // Locally the installed Chrome; CI installs Playwright's Chromium.
    ...(ci ? {} : { channel: 'chrome' }),
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: /mobile.spec.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } },
    },
    {
      name: 'mobile',
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
  ],
});
