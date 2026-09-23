import { defineConfig } from "@playwright/test";

const mode = process.env.FIXTURE_MODE ?? "development";
export default defineConfig({
  testDir: "./e2e",
  testMatch: mode === "strict" ? "strict.spec.ts" : "hydration.spec.ts",
  outputDir: `test-results/${mode}`,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 60_000,
  reporter: [["line"], ["html", { open: "never", outputFolder: `playwright-report/${mode}` }]],
  use: {
    baseURL: "http://127.0.0.1:4181",
    viewport: { width: 1000, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      mode === "strict"
        ? "pnpm exec vite diagnostic --host 127.0.0.1 --port 4181 --strictPort"
        : mode === "development"
          ? "pnpm dev"
          : "pnpm start",
    env: { NEXT_TELEMETRY_DISABLED: "1" },
    url: "http://127.0.0.1:4181",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
