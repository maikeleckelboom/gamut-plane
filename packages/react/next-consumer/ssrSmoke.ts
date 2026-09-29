import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement as h, StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { GamutPlane, type ColorValue, type GamutPlaneState } from "@gamut-plane/react";
import { createColorValue, definingEquals, restoreColor, snapshotColor } from "@gamut-plane/core";

for (const key of [
  "window",
  "document",
  "ResizeObserver",
  "requestAnimationFrame",
  "HTMLCanvasElement",
])
  assert.equal(typeof Reflect.get(globalThis, key), "undefined", `${key} must be absent`);
const domain = createColorValue({ space: "oklch", channels: [0.6, -0, null], alpha: 0.372913 });
assert.equal(domain.ok, true);
if (!domain.ok) throw new Error("Packed ColorValue construction failed");
const transported = restoreColor(JSON.parse(JSON.stringify(snapshotColor(domain.value))));
assert.equal(transported.ok, true);
if (!transported.ok) throw new Error("Packed ColorValue transport failed");
assert.equal(definingEquals(domain.value, transported.value), true);
const hostRequire = createRequire(import.meta.url);
const packageRequire = createRequire(import.meta.resolve("@gamut-plane/react"));
assert.equal(
  realpathSync(hostRequire.resolve("react")),
  realpathSync(packageRequire.resolve("react")),
);
const entry = readFileSync(new URL(import.meta.resolve("@gamut-plane/react")), "utf8");
assert.match(entry, /^"use client";/);
assert.doesNotMatch(entry, /import\s*["'][^"']+\.css["']/);
let events = 0;
const alternateState: GamutPlaneState = {
  selection: { representationId: "oklab", editorId: "oklab-ab" },
  checkedGamuts: ["srgb-gamut", "display-p3-gamut"],
  referenceGamutId: null,
  visibleGuides: ["srgb-boundary", "display-p3-boundary"],
};
function render(value: ColorValue) {
  return renderToString(
    h(
      StrictMode,
      null,
      h(
        "main",
        null,
        ...[0, 1].map((key) =>
          h(GamutPlane, {
            key,
            ...(key === 1 ? { defaultState: alternateState } : {}),
            legend: h("p", null, "SSR legend"),
            value,
            onValueChange: () => events++,
            onValueCommit: () => events++,
            onCancel: () => events++,
            onCanvasColorSpaceChange: () => events++,
          }),
        ),
      ),
    ),
  );
}
const firstResult = createColorValue({
  space: "oklch",
  channels: [0.68, 0.52345678, 612.123456],
  alpha: 0.37,
});
const otherResult = createColorValue({ space: "oklch", channels: [0.21, 0.62, -42], alpha: 0.19 });
if (!firstResult.ok || !otherResult.ok) throw new Error("Invalid SSR color");
const first = firstResult.value;
const other = otherResult.value;
const [html, second, repeated] = await Promise.all([
  Promise.resolve().then(() => render(first)),
  Promise.resolve().then(() => render(other)),
  Promise.resolve().then(() => render(first)),
]);
assert.equal(html, repeated);
assert.notEqual(html, second);
assert.equal(events, 0);
assert.ok(html.includes('data-gp-part="exact-result"'));
assert.ok(html.includes("OKLab a numeric value"));
assert.ok(html.includes("SSR legend"));
assert.equal(snapshotColor(first).channels[1], 0.52345678);
for (const markup of [html, second]) {
  assert.equal((markup.match(/<canvas/g) ?? []).length, 2);
  assert.equal((markup.match(/data-render-color-space="pending"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-active-marker/g) ?? []).length, 2);
  for (const gamut of ["srgb", "display-p3"])
    assert.equal((markup.match(new RegExp(`data-gamut-boundary="${gamut}"`, "g")) ?? []).length, 2);
  const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
}
assert.ok(html.includes("0.5235"));
assert.ok(html.includes("612.1"));
assert.ok(html.includes("0.37"));
console.log(
  "Packed React ESM import, client directive, request isolation and two-instance SSR passed without browser globals.",
);
