import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";

import { createViteConfig } from "./vite.config.ts";

export default mergeConfig(
  createViteConfig("test"),
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./test/setup.ts"],
      include: ["./test/**/*.test.ts"],
    },
  }),
);
