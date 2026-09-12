import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement as h, StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { GamutPlane, type OklchColor } from "@gamut-plane/react";

for (const key of [
  "window",
  "document",
  "ResizeObserver",
  "requestAnimationFrame",
  "HTMLCanvasElement",
])
  assert.equal(typeof Reflect.get(globalThis, key), "undefined", `${key} must be absent`);
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
function render(value: OklchColor) {
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
            value,
            onChange: () => events++,
            onCommit: () => events++,
            onCancel: () => events++,
            onCapability: () => events++,
          }),
        ),
      ),
    ),
  );
}
const first = Object.freeze({ l: 0.68, c: 0.52345678, h: 612.123456, alpha: 0.37 });
const other = Object.freeze({ l: 0.21, c: 0.62, h: -42, alpha: 0.19 });
const [html, second, repeated] = await Promise.all([
  Promise.resolve().then(() => render(first)),
  Promise.resolve().then(() => render(other)),
  Promise.resolve().then(() => render(first)),
]);
assert.equal(html, repeated);
assert.notEqual(html, second);
assert.equal(events, 0);
for (const markup of [html, second]) {
  assert.equal((markup.match(/<canvas/g) ?? []).length, 2);
  assert.equal((markup.match(/data-render-color-space="pending"/g) ?? []).length, 2);
  assert.equal((markup.match(/data-active-marker/g) ?? []).length, 2);
  for (const gamut of ["srgb", "display-p3"])
    assert.equal((markup.match(new RegExp(`data-gamut-boundary="${gamut}"`, "g")) ?? []).length, 2);
  const ids = [...markup.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
}
assert.ok(html.includes("0.52345678"));
assert.ok(html.includes("612.123456"));
assert.ok(html.includes("0.37"));
console.log(
  "Packed React ESM import, client directive, request isolation and two-instance SSR passed without browser globals.",
);
