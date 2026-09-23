import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 30_000,
  reporter: [["line"], ["html", { open: "never" }]],
  snapshotPathTemplate: "{testDir}/screenshots/{arg}-{platform}{ext}",
  expect: { toHaveScreenshot: { animations: "disabled", maxDiffPixelRatio: 0.003 } },
  use: {
    baseURL: "http://127.0.0.1:4182",
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
    colorScheme: "dark",
    contextOptions: { reducedMotion: "reduce" },
    deviceScaleFactor: 1,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm exec vite preview --host 127.0.0.1 --port 4182 --strictPort",
    url: "http://127.0.0.1:4182",
    reuseExistingServer: false,
  },
});
