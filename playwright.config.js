import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  webServer: { command: 'npm run dev:preseason -- --host 127.0.0.1', port: 5173, reuseExistingServer: true },
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
})
