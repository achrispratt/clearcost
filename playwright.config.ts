import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke tests against a running site (#33). Defaults to production; point
 * BASE_URL at a local `npm run dev` or another deployment to test that.
 *   npm run test:e2e
 *   BASE_URL=http://localhost:3000 npm run test:e2e
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.BASE_URL ?? "https://www.clearcost.live",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
