import { defineConfig } from "@playwright/test";

import baseConfig from "./playwright.config.ts";

export default defineConfig({
  ...baseConfig,
  testIgnore: [],
  testMatch: "production.spec.ts",
  use: {
    ...baseConfig.use,
    baseURL: "http://127.0.0.1:4178",
  },
  webServer: {
    command: "pnpm preview:production",
    url: "http://127.0.0.1:4178",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
