import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next dev -p 3100",
    env: {
      E2E_TEST_MODE: "1",
      NEXT_PUBLIC_E2E_TEST_MODE: "1",
    },
    url: "http://127.0.0.1:3100",
    reuseExistingServer: true,
  },
});
