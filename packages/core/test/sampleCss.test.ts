import { expect, it } from "vitest";
import { serializeOklchSample } from "../src/index.js";

it("emits precise OKLCH CSS from a numeric sample without an RGB output policy", () => {
  expect(serializeOklchSample({ l: 0.62, c: 0.15, h: 200, alpha: 0.5 })).toBe(
    "oklch(62% 0.15 200 / 0.5)",
  );
  expect(serializeOklchSample({ l: 0.62, c: 0.15, h: 200, alpha: 1 })).toBe("oklch(62% 0.15 200)");
});
