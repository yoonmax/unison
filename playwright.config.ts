import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
// Point at a deployed site to test it instead of booting a local stack. Mind the
// production rate limits: run a filtered subset, not the whole suite.
const REMOTE = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [["list"]],
  use: {
    baseURL: REMOTE ?? `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: REMOTE
    ? undefined
    : {
        command: "npx tsx scripts/e2e-server.ts",
        url: `http://localhost:${PORT}`,
        timeout: 240_000,
        reuseExistingServer: !process.env.CI,
        stdout: "pipe",
      },
});
