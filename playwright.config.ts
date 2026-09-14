import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end suite (see TESTING.md).
 *   npm run test:e2e                                        reuses (or starts) the dev server on :3456
 *   PLAYWRIGHT_BASE_URL=http://localhost:3460 npm run test:e2e   targets an already running server, e.g. `next start`
 * The target must use the seeded catalogue, EMAIL_DRIVER=log and PAYMENT_PROVIDERS including sandbox.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3456";

export default defineConfig({
  testDir: "e2e",
  // Flows share one database, rate limits and the dev mailbox, so they run one at a time.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 120_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"], testIgnore: /auth\.setup\.ts/ },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : { command: "npm run dev -- -p 3456", url: `${baseURL}/robots.txt`, reuseExistingServer: true, timeout: 240_000 },
});
