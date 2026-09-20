import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the production build, because that is what
 * ships — both to a server and, wrapped in Electron, to a desktop.
 */
export default defineConfig({
  testDir: './tests',
  // Only the browser specs. Playwright's default pattern would also collect
  // the node:test unit files next to them, which import a build directory that
  // only exists after `npm test`.
  testMatch: '**/*.spec.ts',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3311',
    trace: 'retain-on-failure',
    // Use the Chromium already present in this environment rather than
    // downloading a second copy. Override with CHROMIUM_PATH if needed.
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
    },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node .next/standalone/server.js',
    url: 'http://127.0.0.1:3311',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      PORT: '3311',
      HOSTNAME: '127.0.0.1',
      EXAMOS_DATA_DIR: process.env.EXAMOS_TEST_DATA_DIR ?? path.join(process.cwd(), '.test-data'),
      EXAMOS_SESSION_SECRET: 'test-secret-not-for-production-use-only',
    },
  },
});
