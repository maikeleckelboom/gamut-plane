import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["production.spec.ts", "releaseAssets.spec.ts"],
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: "playwright-report" }]]
    : [["line"]],
  snapshotPathTemplate: "{testDir}/screenshots/{arg}-{platform}{ext}",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.003,
    },
  },
  use: {
    baseURL: "http://127.0.0.1:4177",
    colorScheme: "dark",
    contextOptions: {
      reducedMotion: "reduce",
    },
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        deviceScaleFactor: 1,
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: {
    command: "pnpm dev --host 127.0.0.1 --port 4177",
    url: "http://127.0.0.1:4177",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
