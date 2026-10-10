import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { analyzeGamut, createColorValue } from "@gamut-plane/core";
import { generateLightnessSection } from "@gamut-plane/render/internal/spatial";
import { referenceBytes } from "../test/spatialReference";
import type { mountHarness, sectionInput } from "./spatialHarness";

// Phase 3C.1: the linked lightness section. These specs drive the REAL compact instrument and read the
// renderer through the development-only `spatialInspect` and `spatialMetrics` seams.

type Inspect = {
  frames: number;
  pendingFrame: boolean;
  lost: boolean;
  width: number;
  height: number;
  state: { active: string; compare: boolean; mode: string; cut: boolean };
  camera: {
    position: number[];
    target: number[];
    zoom: number;
    projection: number[];
    view: number[];
  };
  drawCalls: number;
  triangles: number;
  geometries: number;
  programs: number;
  resources: { space: string; generationMs: number; uploadMs: number }[];
  section: {
    lightness: number | null;
    capVisible: boolean;
    cutSide: number;
    segments: { srgb: number; "display-p3": number };
    ghostSegments: number;
    footprintSegments: number;
    uploads: { contours: number; footprint: number; marker: number };
    marker: [number, number, number] | null;
  };
};
type Metrics = {
  requests: number;
  computes: number;
  lastComputeMs: number;
  maxComputeMs: number;
  totalComputeMs: number;
  store: { hits: number; misses: number; builds: number; evictions: number; size: number };
};
declare global {
  interface Window {
    spatialHarness: ReturnType<typeof mountHarness>;
  }
}

const stage = (page: Page) => page.locator("[data-spatial-status]");
const inspect = (page: Page) =>
  stage(page).evaluate((el) => (el as unknown as { spatialInspect(): Inspect }).spatialInspect());
const metrics = (page: Page) =>
  stage(page).evaluate((el) => (el as unknown as { spatialMetrics(): Metrics }).spatialMetrics());
const instrument = (page: Page) => page.locator("[data-gp-root]");
const lightness = (page: Page) => page.locator("[data-section-lightness]");
const slider = (page: Page): Locator => page.locator("[data-section-slider]");
const summary = (page: Page) => page.locator("[data-section-summary]");
const canvasOf = (page: Page) => page.getByLabel("Orthographic gamut scene");

async function ready(page: Page) {
  await page.goto("/spatial");
  await expect(stage(page)).toHaveAttribute("data-spatial-status", "ready");
  await expect(stage(page)).not.toHaveAttribute("data-spatial-frames", "0");
  await expect(lightness(page)).toHaveText("L 0.680");
  await expect.poll(async () => (await inspect(page)).section.capVisible).toBe(true);
  await settled(page);
}
/** No frame is pending: everything the last change required has been drawn. */
async function settled(page: Page) {
  await expect.poll(async () => (await inspect(page)).pendingFrame).toBe(false);
}
async function authored(page: Page) {
  const root = page.locator("[data-authored-space]");
  return {
    space: await root.getAttribute("data-authored-space"),
    channels: await root.getAttribute("data-authored-channels"),
  };
}
async function instrumentValues(page: Page) {
  return instrument(page)
    .getByRole("spinbutton")
    .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
}
/** Scene point to canvas pixel through the camera that is actually rendering. */
function toPixel(view: Inspect, point: readonly [number, number, number]) {
  const { camera } = view;
  const m = (matrix: number[], r: number, c: number) => matrix[c * 4 + r]!;
  const eye = [0, 1, 2, 3].map(
    (r) =>
      m(camera.view, r, 0) * point[0] +
      m(camera.view, r, 1) * point[1] +
      m(camera.view, r, 2) * point[2] +
      m(camera.view, r, 3),
  );
  const clip = [0, 1, 2, 3].map(
    (r) =>
      m(camera.projection, r, 0) * eye[0]! +
      m(camera.projection, r, 1) * eye[1]! +
      m(camera.projection, r, 2) * eye[2]! +
      m(camera.projection, r, 3) * eye[3]!,
  );
  const x = clip[0]! / clip[3]!,
    y = clip[1]! / clip[3]!;
  return { ndc: { x, y }, x: ((x + 1) * view.width) / 2, y: ((1 - y) * view.height) / 2 };
}
/** Decode a PNG in the page (no image library needed) and read pixels. */
async function pixels(page: Page, png: Buffer, points: readonly (readonly [number, number])[]) {
  return page.evaluate(
    async ({ base64, points }) => {
      const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      return points.map(([x, y]) =>
        Array.from(context.getImageData(Math.round(x), Math.round(y), 1, 1).data),
      );
    },
    { base64: png.toString("base64"), points },
  );
}
async function capture(page: Page, name: string, testInfo: { outputPath(name: string): string }) {
  const directory = process.env.SPATIAL_SCREENSHOTS;
  if (directory) await mkdir(directory, { recursive: true });
  const path = directory ? `${directory}/${name}.png` : testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
}
async function setOklch(page: Page, l: number, c: number, h: number) {
  const root = instrument(page);
  for (const [name, value] of [
    ["Lightness numeric value", l],
    ["Chroma numeric value", c],
    ["Hue numeric value", h],
  ] as const) {
    const input = root.getByRole("spinbutton", { name });
    await input.fill(String(value));
    await input.press("Enter");
  }
}
async function chooseCoordinates(page: Page, name: RegExp) {
  const root = instrument(page);
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.getByRole("option", { name }).first().click();
}
const oklabOf = (l: number, c: number, h: number) =>
  [c * Math.cos((h * Math.PI) / 180), l, c * Math.sin((h * Math.PI) / 180)] as const;
/** Inside-ness by core's exact analysis, used only to choose fixtures. */
function status(l: number, c: number, h: number, gamut: "srgb-gamut" | "display-p3-gamut") {
  const value = createColorValue({ space: "oklch", channels: [l, c, h], alpha: 1 });
  if (!value.ok) throw new Error("fixture");
  const result = analyzeGamut(value.value, gamut);
  if (!result.ok) throw new Error("fixture");
  return result.value.status;
}
/** A chroma at which the hue ray is inside Display P3 but outside sRGB. */
function p3OnlyChroma(l: number, h: number) {
  let low = 0,
    high = 0.5;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (status(l, mid, h, "srgb-gamut") === "outside") high = mid;
    else low = mid;
  }
  const chroma = high + 0.015;
  expect(status(l, chroma, h, "srgb-gamut")).toBe("outside");
  expect(status(l, chroma, h, "display-p3-gamut")).not.toBe("outside");
  return chroma;
}

test("visual evidence: desktop, narrow, colors, cameras and presentation", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1250 });
  await ready(page);
  await capture(page, "desktop-follow-shape", testInfo);
  await page.getByRole("radio", { name: "Color", exact: true }).check();
  await settled(page);
  await capture(page, "desktop-follow-color", testInfo);
  await page.getByRole("button", { name: "View section" }).click();
  await settled(page);
  await capture(page, "desktop-section-view-color", testInfo);
  await page.getByRole("radio", { name: "Shape", exact: true }).check();
  await settled(page);
  await capture(page, "desktop-section-view-shape", testInfo);
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("radio", { name: "Color", exact: true }).check();
  await settled(page);
  // A P3-only color: outside sRGB, inside Display P3 (chosen with core analysis, not by eye).
  const chroma = p3OnlyChroma(0.62, 145);
  await setOklch(page, 0.62, chroma, 145);
  await expect(summary(page)).toContainText("outside sRGB, inside Display P3");
  await settled(page);
  await capture(page, "desktop-p3-only-color", testInfo);
  await page.getByRole("radio", { name: "Display P3", exact: true }).first().check();
  await settled(page);
  await capture(page, "desktop-p3-surface", testInfo);
  await page.getByRole("radio", { name: "sRGB", exact: true }).first().check();
  await setOklch(page, 0.62, 0.45, 145);
  await expect(summary(page)).toContainText("outside sRGB, outside Display P3");
  await settled(page);
  await capture(page, "desktop-outside-both", testInfo);
  await setOklch(page, 0.68, 0.15, 252);
  await page.getByRole("radio", { name: "Inspect lightness" }).check();
  await slider(page).fill("0.3");
  await settled(page);
  await capture(page, "desktop-inspect-0.3", testInfo);
  await slider(page).fill("0.9");
  await expect(page.locator("[data-marker-note]")).toContainText("behind the surface");
  await settled(page);
  await capture(page, "desktop-marker-hidden", testInfo);
  await page.getByRole("button", { name: "Show selected" }).first().click();
  await settled(page);
  await capture(page, "desktop-show-selected", testInfo);
  await page.setViewportSize({ width: 390, height: 900 });
  await settled(page);
  await capture(page, "phone", testInfo);
});

test("an accepted edit moves the marker; a/b-only edits leave the section alone; L edits follow", async ({
  page,
}) => {
  await ready(page);
  const root = instrument(page);
  const before = await inspect(page);
  const metricsBefore = await metrics(page);
  expect(before.section.marker).toEqual(
    expect.arrayContaining([expect.any(Number), 0.68, expect.any(Number)]),
  );
  const expected = oklabOf(0.68, 0.15, 252);
  expect(before.section.marker![0]).toBeCloseTo(expected[0], 12);
  expect(before.section.marker![1]).toBe(0.68);
  expect(before.section.marker![2]).toBeCloseTo(expected[2], 12);
  // Chroma and hue move a and b at an unchanged lightness.
  for (const [name, value, c, h] of [
    ["Chroma numeric value", "0.1", 0.1, 252],
    ["Hue numeric value", "30", 0.1, 30],
  ] as const) {
    const input = root.getByRole("spinbutton", { name });
    await input.fill(value);
    await input.press("Enter");
    await settled(page);
    const view = await inspect(page);
    const point = oklabOf(0.68, c, h);
    expect(view.section.marker![0]).toBeCloseTo(point[0], 12);
    expect(view.section.marker![1]).toBe(0.68);
    expect(view.section.marker![2]).toBeCloseTo(point[2], 12);
    // The section was not rebuilt, rewritten or even requested again.
    expect(view.section.uploads.contours).toBe(before.section.uploads.contours);
    expect(view.section.uploads.footprint).toBe(before.section.uploads.footprint);
    expect(view.section.uploads.marker).toBeGreaterThan(before.section.uploads.marker);
  }
  const metricsAB = await metrics(page);
  expect(metricsAB.requests).toBe(metricsBefore.requests);
  expect(metricsAB.computes).toBe(metricsBefore.computes);
  expect(metricsAB.store.builds).toBe(metricsBefore.store.builds);
  // A lightness edit moves the followed section.
  const input = root.getByRole("spinbutton", { name: "Lightness numeric value" });
  await input.fill("0.5");
  await input.press("Enter");
  await expect(lightness(page)).toHaveText("L 0.500");
  await settled(page);
  const moved = await inspect(page);
  expect(moved.section.lightness).toBe(0.5);
  expect(moved.section.marker![1]).toBe(0.5);
  expect(moved.section.uploads.contours).toBeGreaterThan(before.section.uploads.contours);
  expect(moved.section.segments.srgb).toBeGreaterThan(50);
  expect(moved.section.segments["display-p3"]).toBeGreaterThan(50);
  expect((await metrics(page)).computes).toBe(metricsBefore.computes + 1);
});

test("an OKLab a/b edit at fixed lightness never rebuilds the section", async ({ page }) => {
  await ready(page);
  await chooseCoordinates(page, /^OKLab/);
  const root = instrument(page);
  await expect(root.getByRole("spinbutton", { name: "OKLab a numeric value" })).toBeVisible();
  await settled(page);
  const before = await inspect(page);
  const metricsBefore = await metrics(page);
  for (const [name, value] of [
    ["OKLab a numeric value", "0.05"],
    ["OKLab b numeric value", "-0.12"],
    ["OKLab a numeric value", "-0.08"],
  ] as const) {
    const input = root.getByRole("spinbutton", { name });
    await input.fill(value);
    await input.press("Enter");
  }
  await settled(page);
  const after = await inspect(page);
  expect(after.section.marker![0]).toBeCloseTo(-0.08, 12);
  expect(after.section.marker![2]).toBeCloseTo(-0.12, 12);
  expect(after.section.marker![1]).toBeCloseTo(before.section.marker![1], 12);
  expect(after.section.uploads.contours).toBe(before.section.uploads.contours);
  expect((await metrics(page)).computes).toBe(metricsBefore.computes);
});

test("inspecting another lightness never authors the color, and Follow restores the accepted one", async ({
  page,
}) => {
  await ready(page);
  const color = await authored(page);
  const values = await instrumentValues(page);
  const markerBefore = (await inspect(page)).section.marker;
  await page.getByRole("radio", { name: "Inspect lightness" }).check();
  await slider(page).fill("0.3");
  await expect(lightness(page)).toHaveText("L 0.300");
  await settled(page);
  let view = await inspect(page);
  expect(view.section.lightness).toBe(0.3);
  // The marker keeps its genuine position; it is not moved or clamped onto the inspected plane.
  expect(view.section.marker).toEqual(markerBefore);
  expect(await authored(page)).toEqual(color);
  expect(await instrumentValues(page)).toEqual(values);
  await expect(summary(page)).toContainText("Section at L 0.300 is inspected separately");
  // The accepted color keeps editing; the inspected section stays put.
  await instrument(page).getByRole("spinbutton", { name: "Chroma numeric value" }).fill("0.05");
  await instrument(page).getByRole("spinbutton", { name: "Chroma numeric value" }).press("Enter");
  await instrument(page).getByRole("spinbutton", { name: "Lightness numeric value" }).fill("0.55");
  await instrument(page)
    .getByRole("spinbutton", { name: "Lightness numeric value" })
    .press("Enter");
  await settled(page);
  view = await inspect(page);
  expect(view.section.lightness).toBe(0.3);
  expect(view.section.marker![1]).toBe(0.55);
  await page.getByRole("radio", { name: "Follow selected color" }).check();
  await expect(lightness(page)).toHaveText("L 0.550");
  await settled(page);
  expect((await inspect(page)).section.lightness).toBe(0.55);
  // Scrubbing alone, from follow mode, also inspects without authoring.
  const edited = await authored(page);
  await slider(page).fill("0.8");
  await expect(page.getByRole("radio", { name: "Inspect lightness" })).toBeChecked();
  await expect(lightness(page)).toHaveText("L 0.800");
  expect(await authored(page)).toEqual(edited);
});

test("switching the instrument's representation does not redefine the color or move anything", async ({
  page,
}) => {
  await ready(page);
  const color = await authored(page);
  const view = await inspect(page);
  const metricsBefore = await metrics(page);
  for (const name of [/^OKLab/, /^sRGB/, /^Display P3/, /^OKLCH/]) {
    await chooseCoordinates(page, name);
    await settled(page);
    expect(await authored(page)).toEqual(color);
    const now = await inspect(page);
    expect(now.section.marker).toEqual(view.section.marker);
    expect(now.section.lightness).toBe(view.section.lightness);
    expect(now.section.uploads.contours).toBe(view.section.uploads.contours);
  }
  expect((await metrics(page)).computes).toBe(metricsBefore.computes);
});

test("camera, visibility and presentation actions preserve the authored color and never regenerate geometry", async ({
  page,
}) => {
  await ready(page);
  const color = await authored(page);
  const values = await instrumentValues(page);
  const initial = await inspect(page);
  const metricsBefore = await metrics(page);
  const click = async (name: string) => {
    await page.getByRole("button", { name, exact: true }).click();
    await settled(page);
  };
  await click("View section");
  await click("Fit visible");
  await click("Home");
  await page.getByRole("radio", { name: "Display P3", exact: true }).first().check();
  await page.getByRole("radio", { name: "Color", exact: true }).check();
  await page.getByRole("checkbox", { name: /outline/ }).uncheck();
  await page.getByRole("checkbox", { name: "Cut away" }).uncheck();
  await page.getByRole("checkbox", { name: "Cut away" }).check();
  const canvas = canvasOf(page);
  await canvas.focus();
  for (const key of ["ArrowLeft", "ArrowUp", "Shift+ArrowRight", "+", "-"]) await canvas.press(key);
  await settled(page);
  expect(await authored(page)).toEqual(color);
  expect(await instrumentValues(page)).toEqual(values);
  const after = await inspect(page);
  // Meshes were generated once at construction and never again.
  expect(after.resources).toEqual(initial.resources);
  expect(after.geometries).toBeGreaterThan(0);
  const metricsAfter = await metrics(page);
  expect(metricsAfter.computes).toBe(metricsBefore.computes);
  expect(metricsAfter.store.builds).toBe(metricsBefore.store.builds);
  // And the scene returns to idle: no frame is requested without a change.
  const frames = (await inspect(page)).frames;
  await page.waitForTimeout(200);
  expect((await inspect(page)).frames).toBe(frames);
});

test("the section view reads a to the right and b up, and its pixels are the OKLab field at L", async ({
  page,
}, testInfo) => {
  await ready(page);
  await page.getByRole("radio", { name: "Color", exact: true }).check();
  await page.getByRole("button", { name: "View section" }).click();
  await settled(page);
  const view = await inspect(page);
  const level = view.section.lightness!;
  // Orientation, from the camera that is rendering.
  const origin = toPixel(view, [0, level, 0]);
  const along = toPixel(view, [0.1, level, 0]);
  const up = toPixel(view, [0, level, 0.1]);
  expect(along.x - origin.x).toBeGreaterThan(0);
  expect(Math.abs(along.y - origin.y)).toBeLessThan(0.5);
  expect(up.y - origin.y).toBeLessThan(0); // canvas y grows downward: +b is up on screen
  expect(Math.abs(up.x - origin.x)).toBeLessThan(0.5);
  expect(Math.abs((along.x - origin.x) / (origin.y - up.y))).toBeCloseTo(1, 3); // equal scale
  expect(view.section.cutSide).toBe(-1); // looking from below, with the near (lower) body cut away
  expect(view.camera.position[1]).toBeLessThan(view.camera.target[1] - 2.9);
  // The L labels would sit on the section itself and are left out in this view.
  await expect(page.locator(".spatial-axis")).not.toContainText(["L 1 · white"]);
  // Rendered pixels: the color at a section point's screen position is exactly OKLab(L, a, b).
  const png = await canvasOf(page).screenshot();
  const sample = generateLightnessSection({ space: "srgb", lightness: level });
  if (!sample.ok) throw new Error(sample.error);
  const loop = sample.value.loops[0]!;
  const points: (readonly [number, number, number])[] = [];
  for (const fraction of [0.15, 0.3, 0.45, 0.6, 0.75]) {
    // Points on chords from the neutral point toward boundary vertices stay inside this section.
    for (let k = 0; k < loop.edges.length; k += Math.floor(loop.edges.length / 6)) {
      const a = loop.positions[3 * k]! * fraction,
        b = loop.positions[3 * k + 2]! * fraction;
      points.push([a, level, b]);
    }
  }
  const spots = points.map((point) => toPixel(view, point));
  const read = await pixels(
    page,
    png,
    spots.map((spot) => [spot.x, spot.y] as const),
  );
  let checked = 0;
  points.forEach((point, index) => {
    const expectedBytes = referenceBytes([level, point[0], point[2]], "srgb");
    // Skip the few samples that land within 3 px of the marker, whose dot covers the field.
    const marker = view.section.marker!;
    const markerSpot = toPixel(view, marker);
    if (Math.hypot(spots[index]!.x - markerSpot.x, spots[index]!.y - markerSpot.y) < 9) return;
    for (let channel = 0; channel < 3; channel++)
      expect(
        Math.abs(read[index]![channel]! - expectedBytes[channel]!),
        `pixel ${index} channel ${channel} at (${point[0].toFixed(3)}, ${point[2].toFixed(3)})`,
      ).toBeLessThanOrEqual(3);
    checked++;
  });
  expect(checked).toBeGreaterThan(20);
  // The marker is where the selected color is: a light disc with a dark halo, depth-visible.
  const marker = toPixel(view, view.section.marker!);
  const [center, halo, field] = await pixels(page, png, [
    [marker.x, marker.y],
    [marker.x + 5, marker.y],
    [marker.x + 30, marker.y],
  ]);
  expect(Math.min(...center!.slice(0, 3))).toBeGreaterThan(235);
  expect(Math.max(...halo!.slice(0, 3))).toBeLessThan(60);
  expect(field).not.toEqual(center);
  await capture(page, "evidence-section-view-pixels", testInfo);
});

test("section contours are drawn at the exact vertices, with sRGB and Display P3 distinguishable", async ({
  page,
}) => {
  await ready(page);
  await page.getByRole("button", { name: "View section" }).click();
  await settled(page);
  const view = await inspect(page);
  const level = view.section.lightness!;
  const png = await canvasOf(page).screenshot();
  const near = async (space: "srgb" | "display-p3", target: readonly [number, number, number]) => {
    const section = generateLightnessSection({ space, lightness: level });
    if (!section.ok) throw new Error(section.error);
    const loop = section.value.loops[0]!;
    const spots: [number, number][] = [];
    for (let k = 0; k < loop.edges.length; k++) {
      const spot = toPixel(view, [loop.positions[3 * k]!, level, loop.positions[3 * k + 2]!]);
      for (let dx = -2; dx <= 2; dx++)
        for (let dy = -2; dy <= 2; dy++) spots.push([spot.x + dx, spot.y + dy]);
    }
    const read = await pixels(page, png, spots);
    const per = 25;
    let hits = 0;
    for (let k = 0; k < loop.edges.length; k++) {
      const found = read
        .slice(k * per, (k + 1) * per)
        .some((p) => target.every((value, c) => Math.abs(p[c]! - value) <= 30));
      if (found) hits++;
    }
    return { hits, total: loop.edges.length };
  };
  // sRGB: solid mint; every vertex of its exact section has the line within 2 px.
  const mint = await near("srgb", [0x6e, 0xe7, 0xc8]);
  expect(mint.hits / mint.total).toBeGreaterThan(0.97);
  // Display P3: dashed amber; dashes leave gaps, but most of its vertices are on a dash.
  const amber = await near("display-p3", [0xf7, 0xb9, 0x55]);
  expect(amber.hits / amber.total).toBeGreaterThan(0.45);
  // The identities do not swap: sRGB's vertices carry no amber.
  const confusion = await near("srgb", [0xf7, 0xb9, 0x55]);
  expect(confusion.hits / confusion.total).toBeLessThan(0.1);
});

test("the section fill ends at its contour: the cap's edge is hidden under the line, not beyond it", async ({
  page,
}, testInfo) => {
  await ready(page);
  await page.getByRole("radio", { name: "Color", exact: true }).check();
  await page.getByRole("button", { name: "View section" }).click();
  await settled(page);
  const view = await inspect(page);
  const level = view.section.lightness!;
  const png = await canvasOf(page).screenshot();
  const section = generateLightnessSection({ space: "srgb", lightness: level });
  if (!section.ok) throw new Error(section.error);
  const loop = section.value.loops[0]!;
  const n = loop.edges.length;
  const screen = Array.from({ length: n }, (_, k) =>
    toPixel(view, [loop.positions[3 * k]!, level, loop.positions[3 * k + 2]!]),
  );
  const stage = [0x19, 0x1d, 0x22];
  const probes: { index: number; inside: [number, number]; outward: [number, number][] }[] = [];
  for (let k = 0; k < n; k += 4) {
    const previous = screen[(k + n - 1) % n]!,
      next = screen[(k + 1) % n]!,
      here = screen[k]!;
    const dx = next.x - previous.x,
      dy = next.y - previous.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) continue;
    // The loop is counterclockwise in (a, b) with b up; on the canvas (y down) the outward normal is (-dy, dx).
    const nx = -dy / length,
      ny = dx / length;
    probes.push({
      index: k,
      inside: [here.x - 4 * nx, here.y - 4 * ny],
      outward: Array.from({ length: 10 }, (_, d) => [here.x + (d + 1) * nx, here.y + (d + 1) * ny]),
    });
  }
  const inside = await pixels(
    page,
    png,
    probes.map((probe) => probe.inside),
  );
  const outward = await pixels(
    page,
    png,
    probes.flatMap((probe) => probe.outward),
  );
  const isStage = (p: number[]) => stage.every((value, c) => Math.abs(p[c]! - value) <= 14);
  let filled = 0;
  const edge: number[] = [];
  probes.forEach((_, k) => {
    // 4 px inside the contour there is the fill, not the stage.
    if (!isStage(inside[k]!)) filled++;
    const row = outward.slice(k * 10, (k + 1) * 10);
    const first = row.findIndex(isStage);
    if (first >= 0) edge.push(first + 1);
  });
  // Where the fill would run past the line, color would remain beyond the 2.5 px half width of the
  // dark casing before the stage color appears.
  const sorted = [...edge].sort((a, b) => a - b);
  const report = {
    probes: probes.length,
    filledInside: filled,
    outwardReachedStage: edge.length,
    distanceToStagePx: { median: sorted[Math.floor(sorted.length / 2)], max: sorted.at(-1) },
  };
  await testInfo.attach("cap edge evidence", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
  if (process.env.SPATIAL_EVIDENCE) {
    await mkdir(process.env.SPATIAL_EVIDENCE, { recursive: true });
    await writeFile(
      `${process.env.SPATIAL_EVIDENCE}/cap-edge.json`,
      JSON.stringify(report, null, 2),
    );
  }
  expect(filled / probes.length).toBeGreaterThan(0.95);
  expect(edge.length / probes.length).toBeGreaterThan(0.9);
  expect(sorted.at(-1)!).toBeLessThanOrEqual(4);
});

test("depth and occlusion: a hidden marker is offered recovery and never drawn over the surface", async ({
  page,
}) => {
  await ready(page);
  await expect(page.locator("[data-marker-note]")).toHaveCount(0);
  const color = await authored(page);
  // Plane above the color: the color is inside the kept lower body, behind the section fill.
  await page.getByRole("radio", { name: "Inspect lightness" }).check();
  await slider(page).fill("0.9");
  await expect(page.locator("[data-marker-note]")).toContainText("behind the surface");
  await settled(page);
  expect((await inspect(page)).section.marker![1]).toBe(0.68);
  // With the cut off the whole body is drawn and the color, inside it, is hidden again.
  await page.getByRole("radio", { name: "Follow selected color" }).check();
  await expect(page.locator("[data-marker-note]")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Cut away" }).uncheck();
  await expect(page.locator("[data-marker-note]")).toContainText("behind the surface");
  await page.locator("[data-marker-note]").getByRole("button", { name: "Show selected" }).click();
  await expect(page.getByRole("checkbox", { name: "Cut away" })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Follow selected color" })).toBeChecked();
  await expect(page.locator("[data-marker-note]")).toHaveCount(0);
  expect(await authored(page)).toEqual(color);
  await settled(page);
  // A color outside both gamuts floats outside the body: visible, not hidden, not clamped.
  await setOklch(page, 0.62, 0.45, 145);
  await expect(summary(page)).toContainText("outside sRGB, outside Display P3");
  await expect(page.locator("[data-marker-note]")).toHaveCount(0);
  const view = await inspect(page);
  const point = oklabOf(0.62, 0.45, 145);
  expect(view.section.marker![0]).toBeCloseTo(point[0], 12);
  expect(view.section.marker![2]).toBeCloseTo(point[2], 12);
});

test("an unobservable color has no marker and no followed section, and inspecting still works", async ({
  page,
}) => {
  await ready(page);
  await chooseCoordinates(page, /^sRGB/);
  const root = instrument(page);
  for (const [name, value] of [
    ["Red numeric value", "1e300"],
    ["Green numeric value", "-1e300"],
    ["Blue numeric value", "1e300"],
  ] as const) {
    const input = root.getByRole("spinbutton", { name });
    await input.fill(value);
    await input.press("Enter");
  }
  await expect(summary(page)).toContainText("cannot be placed in OKLab");
  await expect(lightness(page)).toHaveText("None");
  await settled(page);
  const view = await inspect(page);
  expect(view.section.marker).toBeNull();
  expect(view.section.capVisible).toBe(false);
  expect(view.section.cutSide).toBe(0);
  // Inspecting a lightness is independent of the unavailable observation.
  await slider(page).fill("0.4");
  await expect(lightness(page)).toHaveText("L 0.400");
  await settled(page);
  expect((await inspect(page)).section.capVisible).toBe(true);
});

test("an extended color keeps its true, unclamped position and can be brought into view", async ({
  page,
}) => {
  await ready(page);
  await chooseCoordinates(page, /^sRGB/);
  const root = instrument(page);
  for (const [name, value] of [
    ["Red numeric value", "6"],
    ["Green numeric value", "-2"],
    ["Blue numeric value", "0.4"],
  ] as const) {
    const input = root.getByRole("spinbutton", { name });
    await input.fill(value);
    await input.press("Enter");
  }
  await settled(page);
  const view = await inspect(page);
  expect(view.section.marker).not.toBeNull();
  const [a, l, b] = view.section.marker!;
  expect(Number.isFinite(a) && Number.isFinite(l) && Number.isFinite(b)).toBe(true);
  expect(Math.hypot(a, b)).toBeGreaterThan(0.4); // far outside either gamut, not pulled onto one
  await expect(summary(page)).toContainText("outside sRGB, outside Display P3");
  await page.getByRole("button", { name: "Fit visible" }).click();
  await settled(page);
  const spot = toPixel(await inspect(page), [a, l, b]);
  expect(Math.abs(spot.ndc.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(spot.ndc.y)).toBeLessThanOrEqual(1);
});

test("view changes are immediate and honor reduced motion", async ({ page }) => {
  for (const reducedMotion of ["reduce", "no-preference"] as const) {
    await page.emulateMedia({ reducedMotion });
    await ready(page);
    const before = await inspect(page);
    await page.getByRole("button", { name: "View section" }).click();
    // One frame later the camera is already at the section pose: nothing animates toward it.
    await expect.poll(async () => (await inspect(page)).camera.position[1]).toBeLessThan(0);
    const now = await inspect(page);
    expect(now.camera.position[1]).toBeCloseTo(now.camera.target[1] - 3, 3);
    await settled(page);
    const frames = (await inspect(page)).frames;
    await page.waitForTimeout(150);
    expect((await inspect(page)).frames).toBe(frames);
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect
      .poll(async () => (await inspect(page)).camera.target)
      .toEqual(before.camera.target);
    expect((await inspect(page)).camera.position.map((v) => Number(v.toFixed(6)))).toEqual(
      before.camera.position.map((v) => Number(v.toFixed(6))),
    );
  }
});

test("keyboard: every section action is reachable and the scrub is announced once, settled", async ({
  page,
}) => {
  await ready(page);
  const announcement = page.locator("[data-section-announcement]");
  await expect(announcement).toContainText("Section at lightness 0.680", { timeout: 4000 });
  const color = await authored(page);
  await page.getByRole("radio", { name: "Follow selected color" }).focus();
  await page.keyboard.press("Tab"); // the radio group is one tab stop
  await expect(slider(page)).toBeFocused();
  const seen = new Set<string>();
  const poll = setInterval(
    () => void announcement.textContent().then((t) => seen.add(t ?? "")),
    20,
  );
  for (let step = 0; step < 12; step++) await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: "Inspect lightness" })).toBeChecked();
  await expect(lightness(page)).toHaveText("L 0.668");
  await expect(announcement).toContainText("lightness 0.668", { timeout: 4000 });
  clearInterval(poll);
  // Twelve changes, one settled announcement beyond the first.
  expect([...seen].filter((text) => text.includes("0.66")).length).toBeLessThanOrEqual(1);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "View section" })).toBeFocused();
  await page.keyboard.press("Enter");
  await settled(page);
  expect((await inspect(page)).section.cutSide).toBe(-1);
  expect(await authored(page)).toEqual(color);
  // Slider semantics for assistive technology.
  await expect(slider(page)).toHaveAttribute("aria-valuetext", /L 0\.668, inspected separately/);
  await slider(page).press("Home");
  await expect(summary(page)).toContainText("only the neutral point");
});

test("layout at 390 and 320 px, at enlarged text and at 200 and 400 percent zoom equivalents", async ({
  page,
}, testInfo) => {
  await ready(page);
  for (const [width, height] of [
    [390, 850],
    [320, 700],
    [720, 450],
    [320, 256],
  ] as const) {
    await page.setViewportSize({ width, height });
    await settled(page);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${width}x${height} overflows horizontally`,
    ).toBe(true);
    for (const control of [
      page.getByRole("radio", { name: "Follow selected color" }),
      page.getByRole("radio", { name: "Inspect lightness" }),
      slider(page),
      page.getByRole("button", { name: "View section" }),
      page.getByRole("checkbox", { name: "Cut away" }),
      page.getByRole("button", { name: "Home", exact: true }),
    ]) {
      await control.scrollIntoViewIfNeeded();
      const box = (await control.boundingBox())!;
      expect(
        box.x,
        `${width}: ${await control.evaluate((e) => e.outerHTML.slice(0, 60))}`,
      ).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 0.5);
    }
  }
  // Enlarged text: a 150% root font size must not clip or overflow the section controls.
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.addStyleTag({
    content: "html { font-size: 150% !important; } .spatial-app { font-size: 21px; }",
  });
  await settled(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "View section" }).focus();
  await capture(page, "enlarged-text-focus", testInfo);
});

test("axe finds no violations with the instrument, controls and a live section", async ({
  page,
}) => {
  await ready(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await slider(page).fill("0.4");
  await page.getByRole("button", { name: "View section" }).click();
  await settled(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("a rapid edit burst builds at most one section per frame and settles on the newest", async ({
  page,
}, testInfo) => {
  await ready(page);
  const before = await metrics(page);
  const frames = (await inspect(page)).frames;
  // 150 slider events in one task: far faster than the display could ever draw them.
  await page.evaluate(() => {
    const input = document.querySelector<HTMLInputElement>("[data-section-slider]")!;
    for (let k = 1; k <= 150; k++) {
      input.value = String(0.1 + (k / 150) * 0.8);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await expect(lightness(page)).toHaveText("L 0.900");
  await settled(page);
  const after = await metrics(page);
  expect(after.requests - before.requests).toBeLessThanOrEqual(150);
  expect(after.computes - before.computes).toBeLessThanOrEqual(2);
  expect((await inspect(page)).section.lightness).toBe(0.9);
  // The frame budget, per request, measured in the browser.
  const burst: number[] = [];
  for (let round = 0; round < 3; round++) {
    const start = await metrics(page);
    await page.evaluate(async () => {
      const input = document.querySelector<HTMLInputElement>("[data-section-slider]")!;
      for (let k = 0; k < 60; k++) {
        input.value = String(0.2 + 0.006 * k + 0.0003 * Math.random());
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    });
    await settled(page);
    const end = await metrics(page);
    burst.push((end.totalComputeMs - start.totalComputeMs) / (end.computes - start.computes));
  }
  const report = {
    framesDuringBurst: (await inspect(page)).frames - frames,
    requestsInSingleTaskBurst: after.requests - before.requests,
    computesInSingleTaskBurst: after.computes - before.computes,
    meanComputeMsPerFrameDrag: burst,
    maxComputeMs: (await metrics(page)).maxComputeMs,
    store: (await metrics(page)).store,
  };
  await testInfo.attach("section burst evidence", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
  if (process.env.SPATIAL_EVIDENCE) {
    await mkdir(process.env.SPATIAL_EVIDENCE, { recursive: true });
    await writeFile(`${process.env.SPATIAL_EVIDENCE}/burst.json`, JSON.stringify(report, null, 2));
  }
  // A sanity bound, not the budget: a frame is 16.7 ms and the measured mean is far below it, but a
  // shared CI runner can be several times slower than a workstation.
  expect(Math.max(...burst)).toBeLessThan(50);
});

test("section layers: draw calls, context loss and restore, disposal and remount", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.locator("[data-canvas-capability]")).not.toHaveAttribute(
    "data-canvas-capability",
    "pending",
  );
  const mount = () =>
    page.evaluate(async () => {
      const path = "/e2e/spatialHarness.ts";
      const harness = (await import(/* @vite-ignore */ path)) as {
        mountHarness: typeof mountHarness;
        sectionInput: typeof sectionInput;
      };
      window.spatialHarness = harness.mountHarness();
      const c = window.spatialHarness.controller;
      c.setSection(harness.sectionInput(0.62));
      c.setMarker([0.04, 0.62, -0.08]);
    });
  const read = () =>
    page.evaluate(() => window.spatialHarness.controller.inspect()) as unknown as Promise<Inspect>;
  await mount();
  await expect.poll(async () => (await read()).frames).toBeGreaterThan(0);
  const first = await read();
  // Cap, surface, outline (2), axes, footprint (2), ghost, sRGB and P3 contours (3 each), marker (2),
  // and the drop line is absent because the color is on the plane: 16 draws at Home.
  expect(first.section.capVisible).toBe(true);
  expect(first.section.cutSide).toBe(1);
  expect(first.section.segments.srgb).toBeGreaterThan(50);
  expect(first.drawCalls).toBe(16);
  expect(first.section.uploads.contours).toBe(2);
  await page.evaluate(() => {
    const c = window.spatialHarness.controller;
    c.home();
    c.resize(1000, 800, 2);
    c.update({ active: "display-p3", compare: true, mode: "color" });
    c.update({ active: "srgb", compare: false, mode: "shape", cut: false });
  });
  await expect.poll(async () => (await read()).state.cut).toBe(false);
  await expect.poll(async () => (await read()).pendingFrame).toBe(false);
  const plain = await read();
  expect(plain.section.cutSide).toBe(0);
  expect(plain.section.ghostSegments).toBe(0);
  // None of that rebuilt or rewrote a section.
  expect(plain.section.uploads.contours).toBe(2);
  expect(plain.resources).toEqual(first.resources);
  // The picture itself survives a lost context: the same pixels after restoration, with the section,
  // the cap, the marker and every line layer rebuilt from CPU data.
  await page.evaluate(() => {
    window.spatialHarness.controller.update({
      active: "srgb",
      compare: true,
      mode: "color",
      cut: true,
    });
    window.spatialHarness.controller.home();
  });
  await expect.poll(async () => (await read()).state.cut).toBe(true);
  await expect.poll(async () => (await read()).pendingFrame).toBe(false);
  const drawing = await read();
  expect(drawing.section.capVisible).toBe(true);
  const sheet = page.locator("canvas").last();
  const before = await sheet.screenshot();
  await page.evaluate(() => window.spatialHarness.lose());
  await expect.poll(async () => (await read()).lost).toBe(true);
  expect((await read()).pendingFrame).toBe(false);
  await page.evaluate(() => window.spatialHarness.restore());
  await expect.poll(async () => (await read()).lost).toBe(false);
  await expect.poll(async () => (await read()).frames).toBeGreaterThan(drawing.frames);
  await expect.poll(async () => (await read()).pendingFrame).toBe(false);
  const restored = await read();
  expect(restored.section.uploads).toEqual(drawing.section.uploads);
  expect(restored.resources).toEqual(first.resources);
  expect((await sheet.screenshot()).equals(before)).toBe(true);
  await page.evaluate(() => {
    window.spatialHarness.controller.dispose();
    window.spatialHarness.controller.dispose();
  });
  const disposed = await read();
  expect(disposed.pendingFrame).toBe(false);
  expect(disposed.geometries).toBe(0);
  expect(disposed.programs).toBe(0);
  expect(await page.evaluate(() => window.spatialHarness.listenerDetails())).toEqual([]);
  await page.evaluate(() => window.spatialHarness.releaseAudit());
  // Repeated mount cycles allocate and release the same things.
  for (let cycle = 0; cycle < 3; cycle++) {
    await page.evaluate(() => window.spatialHarness.canvas.remove());
    await mount();
    await expect.poll(async () => (await read()).frames).toBeGreaterThan(0);
    const again = await read();
    expect(again.drawCalls).toBe(first.drawCalls);
    expect(again.geometries).toBe(first.geometries);
    expect(again.programs).toBe(first.programs);
    await page.evaluate(() => {
      window.spatialHarness.controller.dispose();
      window.spatialHarness.releaseAudit();
    });
    expect((await read()).geometries).toBe(0);
  }
  await testInfo.attach("section lifecycle evidence", {
    body: JSON.stringify({ first, plain, restored, disposed }, null, 2),
    contentType: "application/json",
  });
  if (process.env.SPATIAL_EVIDENCE) {
    await mkdir(process.env.SPATIAL_EVIDENCE, { recursive: true });
    await writeFile(
      `${process.env.SPATIAL_EVIDENCE}/section-lifecycle.json`,
      JSON.stringify({ first, plain, restored, disposed }, null, 2),
    );
  }
});

test("without WebGL2 the instrument and the section facts remain usable", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (id: string, ...args: unknown[]) {
      if (id === "webgl2") return null;
      return Reflect.apply(original, this, [id, ...args]);
    } as typeof original;
  });
  await page.goto("/spatial");
  await expect(page.getByText("3D rendering is unavailable", { exact: true })).toBeVisible();
  await expect(lightness(page)).toHaveText("L 0.680");
  await expect(summary(page)).toContainText("Section at L 0.680 follows the selected color");
  await expect(summary(page)).toContainText("sRGB section: a");
  const root = instrument(page);
  const input = root.getByRole("spinbutton", { name: "Lightness numeric value" });
  await input.fill("0.4");
  await input.press("Enter");
  await expect(lightness(page)).toHaveText("L 0.400");
  await expect(summary(page)).toContainText("Section at L 0.400 follows the selected color");
  await slider(page).fill("0.9");
  await expect(summary(page)).toContainText("Section at L 0.900 is inspected separately");
  await expect(page.getByRole("button", { name: "View section" })).toBeDisabled();
});

test.describe("high DPI", () => {
  test.use({ deviceScaleFactor: 2 });
  test("the marker and the section lines keep their CSS size at device pixel ratio 2", async ({
    page,
  }) => {
    await ready(page);
    await page.getByRole("button", { name: "View section" }).click();
    await settled(page);
    const view = await inspect(page);
    const png = await canvasOf(page).screenshot();
    const marker = toPixel(view, view.section.marker!);
    // Device pixels: the screenshot is twice the canvas CSS size.
    const row = await pixels(
      page,
      png,
      Array.from({ length: 41 }, (_, k) => [2 * marker.x - 20 + k, 2 * marker.y] as const),
    );
    const white = row.filter((p) => Math.min(p[0]!, p[1]!, p[2]!) > 235).length;
    // 8 CSS px of light disc, so 16 device px (one pixel either way for the edge).
    expect(white).toBeGreaterThanOrEqual(14);
    expect(white).toBeLessThanOrEqual(18);
    // The sRGB contour is 2.5 CSS px, so about 5 device px, thick wherever a vertical line crosses
    // it at a shallow angle; every run of mint pixels in one column is such a crossing.
    const x = 2 * Math.round(0.55 * view.width);
    const rows = Math.round(2 * view.height);
    const column = await pixels(
      page,
      png,
      Array.from({ length: rows }, (_, y) => [x, y] as const),
    );
    const runs: number[] = [];
    let run = 0;
    for (const p of column) {
      if ([0x6e, 0xe7, 0xc8].every((value, c) => Math.abs(p[c]! - value) <= 12)) run++;
      else {
        if (run > 0) runs.push(run);
        run = 0;
      }
    }
    if (run > 0) runs.push(run);
    expect(runs.length).toBeGreaterThanOrEqual(2); // the top and the bottom edge of the section
    for (const length of runs) {
      expect(length).toBeGreaterThanOrEqual(3);
      expect(length).toBeLessThanOrEqual(6);
    }
  });
});

test("orbiting keeps the section readable: contact sheet at several view directions", async ({
  page,
}, testInfo) => {
  await ready(page);
  await page.getByRole("radio", { name: "Color", exact: true }).check();
  const canvas = canvasOf(page);
  await canvas.focus();
  const seen = new Set<number>();
  for (const [name, key, repeat] of [
    ["orbit-0-home", "ArrowLeft", 0],
    ["orbit-1", "ArrowLeft", 5],
    ["orbit-2", "ArrowLeft", 5],
    ["orbit-3-above", "ArrowUp", 8],
    ["orbit-4-below", "ArrowDown", 20],
  ] as const) {
    for (let step = 0; step < repeat; step++) await canvas.press(key);
    await settled(page);
    const view = await inspect(page);
    // The section is drawn in every pose: lines present, cap present, a cut side chosen.
    expect(view.section.segments.srgb).toBeGreaterThan(50);
    expect(view.section.capVisible).toBe(true);
    seen.add(view.section.cutSide);
    await capture(page, name, testInfo);
  }
  // From above and from below the cut takes the viewer's side of the plane.
  expect(seen.has(1) && seen.has(-1)).toBe(true);
});
