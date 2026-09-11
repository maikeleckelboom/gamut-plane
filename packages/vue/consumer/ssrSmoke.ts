import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { GamutPlane, type OklchColor, type GamutPlaneView } from "@gamut-plane/vue";

assert.equal(typeof window, "undefined");
assert.equal(typeof document, "undefined");
assert.equal(typeof ResizeObserver, "undefined");
assert.equal(typeof requestAnimationFrame, "undefined");
assert.equal(typeof HTMLCanvasElement, "undefined");
const javascript = readFileSync(new URL(import.meta.resolve("@gamut-plane/vue")), "utf8");
assert.doesNotMatch(javascript, /import\s*["'][^"']+\.css["']/);
const hostRequire = createRequire(import.meta.url);
const instrumentRequire = createRequire(import.meta.resolve("@gamut-plane/vue"));
assert.equal(
  realpathSync(hostRequire.resolve("vue")),
  realpathSync(instrumentRequire.resolve("vue")),
);
const color: OklchColor = Object.freeze({ l: 0.68, c: 0.52345678, h: 612.123456, alpha: 0.37 });
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
            onCancel: () => events++,
            onCapability: () => events++,
          }),
        ),
      ),
  });
  const html = await renderToString(app);
  assert.equal((html.match(/<canvas/g) ?? []).length, 2);
  assert.equal((html.match(/data-render-color-space="pending"/g) ?? []).length, 2);
  assert.equal((html.match(/data-active-marker/g) ?? []).length, 2);
  assert.equal((html.match(/data-gamut-boundary="srgb"/g) ?? []).length, 2);
  assert.equal((html.match(/data-gamut-boundary="display-p3"/g) ?? []).length, 2);
  assert.ok(html.includes(`aria-label="${plane === "oklab" ? "OKLab a/b" : "OKLCH"} plane.`));
  assert.ok(html.includes('type="number"'));
  assert.ok(html.includes('value="0.6800"'));
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(events, 0);
  assert.deepEqual(color, original);
}
async function renderRequest(value: OklchColor) {
  return renderToString(createSSRApp({ render: () => h(GamutPlane, { modelValue: value }) }));
}
const other = Object.freeze({ l: 0.21, c: 0.62, h: -42, alpha: 0.19 });
const [first, second, repeated] = await Promise.all([
  renderRequest(color),
  renderRequest(other),
  renderRequest(color),
]);
assert.equal(
  first,
  repeated,
  "Independent documents may reuse IDs; their authored state must be isolated",
);
assert.notEqual(first, second);
assert.ok(second.includes('value="0.2100"'));
console.log("Packed ESM import and two-instance SSR passed in both views without DOM globals.");
