import { defineConfig } from "@playwright/test";

import baseConfig from "./playwright.config.ts";

export default defineConfig({
  ...baseConfig,
  testIgnore: [],
  testMatch: "releaseAssets.spec.ts",
  reporter: [["line"]],
});
