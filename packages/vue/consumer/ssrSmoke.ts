import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createSSRApp, h } from "vue";
import { renderToString } from "vue/server-renderer";
import { GamutPlane, type ColorValue, type GamutPlaneState } from "@gamut-plane/vue";
import { createColorValue, definingEquals, restoreColor, snapshotColor } from "@gamut-plane/core";

assert.equal(typeof window, "undefined");
assert.equal(typeof document, "undefined");
assert.equal(typeof ResizeObserver, "undefined");
assert.equal(typeof requestAnimationFrame, "undefined");
assert.equal(typeof HTMLCanvasElement, "undefined");
const domain = createColorValue({ space: "oklch", channels: [0.6, -0, null], alpha: 0.372913 });
assert.equal(domain.ok, true);
if (!domain.ok) throw new Error("Packed ColorValue construction failed");
const transported = restoreColor(JSON.parse(JSON.stringify(snapshotColor(domain.value))));
assert.equal(transported.ok, true);
if (!transported.ok) throw new Error("Packed ColorValue transport failed");
assert.equal(definingEquals(domain.value, transported.value), true);
const javascript = readFileSync(new URL(import.meta.resolve("@gamut-plane/vue")), "utf8");
assert.doesNotMatch(javascript, /import\s*["'][^"']+\.css["']/);
const hostRequire = createRequire(import.meta.url);
const instrumentRequire = createRequire(import.meta.resolve("@gamut-plane/vue"));
assert.equal(
  realpathSync(hostRequire.resolve("vue")),
  realpathSync(instrumentRequire.resolve("vue")),
);
const fixture = createColorValue({
  space: "oklch",
  channels: [0.68, 0.52345678, 612.123456],
  alpha: 0.37,
});
if (!fixture.ok) throw new Error("Invalid SSR color");
const color = fixture.value;
const original = snapshotColor(color);
for (const selection of [
  { representationId: "oklch", editorId: "oklch-lc" },
  { representationId: "oklab", editorId: "oklab-ab" },
] as const satisfies readonly GamutPlaneState["selection"][]) {
  let events = 0;
  const app = createSSRApp({
    render: () =>
      h(
        "main",
        [0, 1].map(() =>
          h(GamutPlane, {
            modelValue: color,
            state: {
              selection,
              checkedGamuts: ["srgb-gamut", "display-p3-gamut"],
              visibleGuides: ["srgb-boundary", "display-p3-boundary"],
            },
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
  assert.ok(
    html.includes(
      `aria-label="${selection.editorId === "oklab-ab" ? "OKLab a/b" : "OKLCH"} plane.`,
    ),
  );
  assert.ok(html.includes('type="number"'));
  assert.ok(html.includes('value="0.6800"'));
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(events, 0);
  assert.deepEqual(snapshotColor(color), original);
}
async function renderRequest(value: ColorValue) {
  return renderToString(createSSRApp({ render: () => h(GamutPlane, { modelValue: value }) }));
}
const otherResult = createColorValue({ space: "oklch", channels: [0.21, 0.62, -42], alpha: 0.19 });
if (!otherResult.ok) throw new Error("Invalid alternate SSR color");
const other = otherResult.value;
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
console.log("Packed ESM import and generalized two-instance SSR passed without DOM globals.");
