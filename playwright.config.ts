import { defineConfig, devices } from '@playwright/test';
import { loadEnv } from 'vite';

// Make .env and .env.test.local available to the tests (service role key for test users).
Object.assign(process.env, loadEnv('test', process.cwd(), ''));

const PORT = 4174;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices['iPhone 15'],
    // Chromium instead of WebKit keeps the download small; the viewport is still an iPhone.
    browserName: 'chromium',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
