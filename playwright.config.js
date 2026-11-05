import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end configuration.
 *
 * The suite runs against a real Vite dev server with the Supabase REST and
 * auth endpoints intercepted (see e2e/support/supabaseMock.js), so the
 * journeys exercise the actual React application -- routing, guards, forms,
 * state -- without needing a live Supabase project or network access.
 *
 * The database-level rules those journeys depend on are covered separately
 * and for real, against PostgreSQL, by `npm run test:db`. Between the two
 * there is no layer left asserted only by eye.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          // In CI, Playwright installs its own browser and resolves it; the
          // explicit path is for this development container only.
          ...(process.env.CI ? {} : { executablePath: '/opt/pw-browsers/chromium' }),
          args: ['--no-sandbox'],
        },
      },
    },
  ],

  webServer: {
    command: 'npx vite --port 5173 --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      // A syntactically valid but unreachable project: every call to it is
      // intercepted by the test fixture.
      VITE_SUPABASE_URL: 'https://stub.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'stub-anon-key',
      VITE_PAYMENT_GATEWAY: 'test',
    },
  },
})
