import { defineConfig } from "@playwright/test";

const mode = process.env.FIXTURE_MODE ?? "development";
export default defineConfig({
  testDir: "./e2e",
  outputDir: `test-results/${mode}`,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  reporter: [["line"], ["html", { open: "never", outputFolder: `playwright-report/${mode}` }]],
  use: {
    baseURL: "http://127.0.0.1:4180",
    viewport: { width: 1000, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      mode === "development"
        ? "pnpm dev"
        : mode === "generated"
          ? "node serveStatic.ts"
          : "node .output/server/index.mjs",
    env: { PORT: "4180", HOST: "127.0.0.1", NUXT_TELEMETRY_DISABLED: "1" },
    url: "http://127.0.0.1:4180",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
