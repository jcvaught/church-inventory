// @ts-check
import { defineConfig } from '@playwright/test';

const HAS_MEMBER_B = !!process.env.E2E_MEMBER_B_EMAIL;
const BASE_URL = process.env.E2E_BASE_URL || 'https://churchopshub.com';

// Mirrors the Court Climber + MasteryHelp pattern: auth state is captured per
// account into separate state files (Firebase v12 stores auth in IndexedDB,
// not localStorage, so we inject IndexedDB via fixtures). Per-spec teardown
// keeps prod data clean.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,                 // serial — multiple specs share the same church and would race
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'list' : 'html',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    ignoreHTTPSErrors: true,
    // Realistic Chrome UA so Vercel's bot protection doesn't challenge us.
    // Without this, repeated E2E runs trip Vercel's "Failed to verify your
    // browser / Code 21" challenge and the auth setup loops forever.
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'setup-admin',    testMatch: 'auth.setup.admin.js' },
    { name: 'setup-member-a', testMatch: 'auth.setup.member-a.js' },
    ...(HAS_MEMBER_B ? [{ name: 'setup-member-b', testMatch: 'auth.setup.member-b.js' }] : []),
    {
      name: 'authenticated',
      testMatch: 'authenticated/**/*.spec.js',
      dependencies: ['setup-admin', 'setup-member-a', ...(HAS_MEMBER_B ? ['setup-member-b'] : [])],
    },
  ],
});
