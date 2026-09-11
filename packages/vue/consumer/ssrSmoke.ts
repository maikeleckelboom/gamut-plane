import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { GamutPlane, type OklchColor, type GamutPlaneView } from "@gamut-plane/vue";

assert.equal(typeof window, "undefined");
assert.equal(typeof document, "undefined");
const hostRequire = createRequire(import.meta.url);
const instrumentRequire = createRequire(import.meta.resolve("@gamut-plane/vue"));
assert.equal(
  realpathSync(hostRequire.resolve("vue")),
  realpathSync(instrumentRequire.resolve("vue")),
);
const color: OklchColor = { l: 0.68, c: 0.52345678, h: 612.123456, alpha: 0.37 };
const original = { ...color };
for (const plane of ["oklch", "oklab"] satisfies GamutPlaneView[]) {
  let events = 0;
  const app = createSSRApp({
    render: () =>
      h(
        "main",
        [0, 1].map(() =>
          h(GamutPlane, {
            modelValue: color,
            plane,
            "onUpdate:modelValue": () => events++,
            onCommit: () => events++,
            onCapability: () => events++,
          }),
        ),
      ),
  });
  const html = await renderToString(app);
  assert.equal((html.match(/<canvas/g) ?? []).length, 2);
  assert.equal((html.match(/data-render-color-space="pending"/g) ?? []).length, 2);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(events, 0);
  assert.deepEqual(color, original);
}
console.log("Packed ESM import and two-instance SSR passed in both views without DOM globals.");
