import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e/rtc',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173/speed-card-game/', trace: 'retain-on-failure' },
  projects: [{ name: 'rtc-chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/speed-card-game/',
    reuseExistingServer: false,
  },
})
