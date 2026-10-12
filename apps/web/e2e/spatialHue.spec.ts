import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { linearRgbToOklabBatch } from "@gamut-plane/core/internal/capabilities";
import { analyzeGamut, createColorValue } from "@gamut-plane/core";
import { generateHueSection } from "@gamut-plane/render/internal/spatial";
import { hueSegments } from "../../../packages/render/experiments/spatial/hueSectionOracle.ts";
import { SegmentIndex } from "../../../packages/render/experiments/spatial/silhouette.ts";
import type { SpatialScene } from "../src/spatial/spatialScene";
import type { mountHarness } from "./spatialHarness";

const evidence = process.env.SPATIAL_HUE_EVIDENCE;
test.use({ video: evidence ? { mode: "on", size: { width: 1366, height: 900 } } : "off" });
const stage = (p: Page) => p.locator("[data-spatial-status]");
const facts = (p: Page) =>
  stage(p).evaluate((el) =>
    (el as unknown as { spatialInspect(): ReturnType<SpatialScene["inspect"]> }).spatialInspect(),
  );
const metrics = (p: Page) =>
  stage(p).evaluate((el) =>
    (
      el as unknown as {
        spatialMetrics(): { computes: number; maxComputeMs: number; hueStore: { builds: number } };
      }
    ).spatialMetrics(),
  );
const authored = (p: Page) =>
  p.locator("[data-authored-channels]").getAttribute("data-authored-channels");
async function settle(p: Page) {
  await expect.poll(async () => (await facts(p)).pendingFrame).toBe(false);
}
async function ready(p: Page) {
  await p.goto("/spatial");
  await expect(stage(p)).toHaveAttribute("data-spatial-status", "ready");
  await expect(p.locator("[data-section-lightness]")).toHaveText("L 0.680");
  await settle(p);
}
async function hueMode(p: Page) {
  await p.getByRole("radio", { name: "Hue section", exact: true }).check();
  await expect.poll(async () => (await facts(p)).section.type).toBe("hue");
  await expect.poll(async () => (await facts(p)).section.capVisible).toBe(true);
  await settle(p);
}
async function inspectHue(p: Page, h: number) {
  const input = p.getByRole("spinbutton", { name: "Inspected hue in degrees" });
  await input.fill(String(h));
  await input.press("Enter");
  const remainder = h % 360;
  await expect
    .poll(async () => (await facts(p)).section.hue)
    .toBe(remainder < 0 ? remainder + 360 : remainder);
  await settle(p);
}
async function action(p: Page, name: string) {
  await p.getByRole("button", { name, exact: true }).click();
  await settle(p);
}
async function coordinates(p: Page, name: RegExp) {
  await p.getByRole("combobox", { name: "Coordinates" }).click();
  await p.getByRole("option", { name }).first().click();
}
async function edit(p: Page, name: string, value: number) {
  const input = p
    .locator("[data-gp-root]")
    .getByRole("spinbutton", { name: `${name} numeric value` });
  await input.fill(String(value));
  await input.press("Enter");
  await settle(p);
}
async function capture(p: Page, name: string) {
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  await p.screenshot({ path: `${evidence}/${name}.png`, fullPage: true });
}

test("linked hue journey preserves authorship, both inspections, camera ownership and recovery", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await ready(page);
  const checkpoints: unknown[] = [];
  async function frame(name: string) {
    await settle(page);
    if (evidence) {
      await mkdir(evidence, { recursive: true });
      // Full-page capture temporarily changes the viewport and pollutes the interaction video.
      await page.screenshot({ path: `${evidence}/${name}.png` });
    }
    checkpoints.push({
      name,
      facts: await facts(page),
      metrics: await metrics(page),
      authored: await authored(page),
    });
  }
  await page.locator("[data-section-slider]").fill("0.3");
  await frame("00-horizontal");
  const original = await authored(page),
    camera = (await facts(page)).camera;
  await hueMode(page);
  await frame("01-vertical");
  expect(await authored(page)).toBe(original);
  expect((await facts(page)).camera).toEqual(camera);
  await coordinates(page, /^OKLCH/);
  expect(await authored(page)).toBe(original);
  await edit(page, "Hue", 30);
  await frame("02-editor-hue");
  expect((await facts(page)).section.hue).toBe(30);
  const builds = (await metrics(page)).hueStore.builds;
  await edit(page, "Lightness", 0.6);
  await edit(page, "Chroma", 0.12);
  await frame("03-marker-only");
  expect((await metrics(page)).hueStore.builds).toBe(builds);
  await action(page, "View section");
  await frame("04-aligned");
  expect((await facts(page)).section.sectionOnly).toBe(true);
  const aligned = (await facts(page)).camera;
  await edit(page, "Hue", 80);
  await frame("05-rotated-camera-stays");
  expect((await facts(page)).camera).toEqual(aligned);
  expect((await facts(page)).section.sectionOnly).toBe(false);
  const color = await authored(page);
  await inspectHue(page, 260);
  await frame("06-opposite");
  await expect(page.locator("[data-section-relationship]")).toContainText("opposite radial side");
  await action(page, "Show selected");
  await frame("07-recovery");
  expect(await authored(page)).toBe(color);
  expect((await facts(page)).section.hue).toBe(260);
  expect((await facts(page)).section.revealed).toBe(true);
  await action(page, "Restore surface");
  await page.getByRole("radio", { name: "Lightness section", exact: true }).check();
  await expect(page.locator("[data-section-lightness]")).toHaveText("L 0.300");
  await frame("08-lightness-restored");
  await hueMode(page);
  expect((await facts(page)).section.hue).toBe(260);
  await page.getByRole("radio", { name: "Follow selected color" }).check();
  await expect.poll(async () => (await facts(page)).section.hue).toBe(80);
  await frame("09-follow-restored");
  await edit(page, "Chroma", 0);
  await frame("10-neutral-retained");
  await expect(page.locator("[data-hue-direction]")).toContainText("Retaining H 80.0°");
  expect((await facts(page)).section.marker?.[0]).toBe(0);
  await edit(page, "Chroma", 0.15);
  await frame("11-chromatic-restored");
  if (evidence) {
    await writeFile(`${evidence}/checkpoints.json`, JSON.stringify(checkpoints, null, 2));
    const video = page.video();
    await page.close();
    await video?.saveAs(`${evidence}/interaction.webm`);
  }
  await info.attach("hue-journey", {
    body: JSON.stringify(checkpoints),
    contentType: "application/json",
  });
});

test("multi-sector, isolated contact, numerical failure and recovery never show stale hue geometry", async ({
  page,
}) => {
  await ready(page);
  await hueMode(page);
  await inspectHue(page, 264.1);
  await action(page, "View section");
  await expect(page.locator("[data-section-summary]")).toContainText("2 area sectors");
  await capture(page, "multi-sector");
  const blue = linearRgbToOklabBatch(new Float64Array([0, 0, 1]), "srgb");
  if (!blue.ok) throw new Error("fixture");
  const h = (Math.atan2(blue.value[2]!, blue.value[1]!) * 180) / Math.PI;
  await inspectHue(page, h);
  await action(page, "View section");
  expect((await facts(page)).section.contacts.srgb).toBe(1);
  expect((await facts(page)).section.neutralSegments).toBe(1);
  await capture(page, "blue-contact");
  const color = await authored(page);
  await inspectHue(page, h + 1e-12);
  await expect(page.locator("[data-section-summary]")).toContainText("sRGB section unavailable");
  expect((await facts(page)).section.segments.srgb).toBe(0);
  expect((await facts(page)).section.contacts.srgb).toBe(0);
  expect((await facts(page)).section.capVisible).toBe(false);
  await capture(page, "unavailable");
  expect(await authored(page)).toBe(color);
  await inspectHue(page, 30);
  expect((await facts(page)).section.capVisible).toBe(true);
  await page.getByRole("radio", { name: "Display P3", exact: true }).check();
  await action(page, "View section");
  await capture(page, "p3-aligned");
  await page.getByRole("radio", { name: "Color", exact: true }).check();
  await settle(page);
  await capture(page, "p3-color");
});

test("cyclic inspection, rapid accepted hue edits, camera and presentation do not rebuild unchanged geometry", async ({
  page,
}) => {
  await ready(page);
  await hueMode(page);
  await inspectHue(page, 359);
  const input = page.getByRole("spinbutton", { name: "Inspected hue in degrees" });
  await input.press("ArrowUp");
  await expect(input).toHaveValue("0");
  await input.press("ArrowDown");
  await expect(input).toHaveValue("359");
  // The numeric value updates before the prior arrow's scheduled section computation.
  await settle(page);
  const before = await metrics(page);
  await page.locator("[data-section-slider]").evaluate((el) => {
    for (const h of [20, 40, 120, 210, 300]) {
      (el as HTMLInputElement).value = String(h);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  await expect.poll(async () => (await facts(page)).section.hue).toBe(300);
  await settle(page);
  expect((await metrics(page)).computes - before.computes).toBe(1);
  const stable = await metrics(page);
  for (const command of ["View section", "Fit section", "Fit visible", "Home"])
    await action(page, command);
  await page.getByRole("radio", { name: "Color", exact: true }).check();
  await settle(page);
  for (let i = 0; i < 30; i++)
    await page.getByLabel("Orthographic gamut scene").press("ArrowRight");
  await settle(page);
  expect((await metrics(page)).hueStore.builds).toBe(stable.hueStore.builds);
  expect((await facts(page)).section.cutSide).toBe(1);
  const frames = (await facts(page)).frames;
  await page.waitForTimeout(250);
  expect((await facts(page)).frames).toBe(frames);
  const rendered = await page.evaluate(async () => {
    const element = document.querySelector("[data-spatial-status]")!;
    const snapshots: { hue: number | null; capVisible: boolean }[] = [];
    const observer = new MutationObserver(() => {
      const view = (
        element as unknown as { spatialInspect(): ReturnType<SpatialScene["inspect"]> }
      ).spatialInspect();
      snapshots.push({ hue: view.section.hue, capVisible: view.section.capVisible });
    });
    observer.observe(element, { attributes: true, attributeFilter: ["data-spatial-frames"] });
    const slider = document.querySelector("[data-section-slider]") as HTMLInputElement;
    slider.value = "120";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
    observer.disconnect();
    return snapshots;
  });
  expect(rendered.length).toBeGreaterThan(0);
  expect(rendered.every((frame) => frame.hue === 120 && frame.capVisible)).toBe(true);
  await inspectHue(page, 300);
  await coordinates(page, /^OKLCH/);
  await edit(page, "Chroma", 0.7);
  const color = await authored(page);
  await action(page, "Show selected");
  expect((await facts(page)).section.hue).toBe(300);
  expect((await facts(page)).section.marker).not.toBeNull();
  expect(await authored(page)).toBe(color);
  await expect(page.locator("[data-section-summary]")).toContainText(
    "outside sRGB, outside Display P3",
  );
});

test("actual hue fill agrees with core away from boundaries in both gamuts and at the sector gap", async ({
  page,
}) => {
  await ready(page);
  await hueMode(page);
  const report: unknown[] = [];
  for (const space of ["srgb", "display-p3"] as const)
    for (const h of [30, 180, 264.1]) {
      await page
        .getByRole("radio", { name: space === "srgb" ? "sRGB" : "Display P3", exact: true })
        .check();
      await inspectHue(page, h);
      await action(page, "View section");
      const view = await facts(page);
      const pixelsPerUnit = (view.height * view.camera.projection[5]!) / 2;
      const contours = ["srgb", "display-p3"].map((gamut) => {
        const result = generateHueSection({ space: gamut as "srgb" | "display-p3", hue: h });
        if (!result.ok) throw new Error(result.detail);
        return new SegmentIndex(hueSegments(result.value));
      });
      const samples: [number, number, boolean][] = [];
      for (const l of [0.1, 0.25, 0.44, 0.65, 0.85])
        for (const c of [0.04, 0.1, 0.17, 0.28, 0.4]) {
          // Stroke/casing and MSAA pixels are not fill pixels. Exclude their screen-space
          // neighborhoods using independently interpreted scientific contours for BOTH lines.
          if (contours.some((index) => index.nearest(l, c) * pixelsPerUnit < 6)) continue;
          const color = createColorValue({ space: "oklch", channels: [l, c, h], alpha: 1 });
          if (!color.ok) throw new Error("fixture");
          const membership = analyzeGamut(
            color.value,
            space === "srgb" ? "srgb-gamut" : "display-p3-gamut",
          );
          if (!membership.ok) throw new Error("fixture");
          samples.push([l, c, membership.value.status !== "outside"]);
        }
      const png = await page.getByLabel("Orthographic gamut scene").screenshot();
      const read = await page.evaluate(
        async ({ base64, samples, h, view }) => {
          const bitmap = await createImageBitmap(
            await (await fetch(`data:image/png;base64,${base64}`)).blob(),
          );
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height),
            ctx = canvas.getContext("2d")!;
          ctx.drawImage(bitmap, 0, 0);
          const multiply = (m: number[], p: number[]) =>
            [0, 1, 2, 3].map(
              (r) => m[r]! * p[0]! + m[r + 4]! * p[1]! + m[r + 8]! * p[2]! + m[r + 12]! * p[3]!,
            );
          return samples.map(([l, c]) => {
            const clip = multiply(
              view.camera.projection,
              multiply(view.camera.view, [
                c * Math.cos((h * Math.PI) / 180),
                l,
                c * Math.sin((h * Math.PI) / 180),
                1,
              ]),
            );
            const x = ((clip[0]! + 1) * view.width) / 2,
              y = ((1 - clip[1]!) * view.height) / 2;
            return Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data);
          });
        },
        { base64: png.toString("base64"), samples, h, view },
      );
      samples.forEach(([l, c, inside], i) => {
        const pixel = read[i]!;
        expect(
          pixel[0]! > 180 && pixel[1]! > 180 && pixel[2]! > 180,
          `${space} h${h} L${l} C${c} pixel ${pixel}`,
        ).toBe(inside);
      });
      expect(samples.length).toBeGreaterThan(10);
      report.push({ space, h, samples, pixels: read, excludedStrokeRadiusCssPixels: 6 });
    }
  if (evidence) await writeFile(`${evidence}/fill-pixels.json`, JSON.stringify(report, null, 2));
});

test("hue layout remains accessible at laptop, narrow and enlarged text sizes", async ({
  page,
}) => {
  for (const [width, height, text] of [
    [1366, 768, 100],
    [390, 844, 100],
    [320, 800, 100],
    [1000, 900, 200],
  ]) {
    await page.setViewportSize({ width: width!, height: height! });
    await ready(page);
    await hueMode(page);
    await action(page, "View section");
    if (text === 200)
      await page.addStyleTag({ content: "html {font-size:200% !important} * {font-size:inherit}" });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
    await capture(page, `workspace-${width}-${text}`);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
});

test("hue resources survive context restoration, stay bounded while scrubbing and fully dispose", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-canvas-capability]")).not.toHaveAttribute(
    "data-canvas-capability",
    "pending",
  );
  await page.evaluate(async () => {
    const path = "/e2e/spatialHarness.ts",
      model = "/src/spatial/hueModel.ts";
    const harness = (await import(/* @vite-ignore */ path)) as {
      mountHarness: typeof mountHarness;
    };
    const { createHueStore } = (await import(/* @vite-ignore */ model)) as {
      createHueStore: typeof import("../src/spatial/hueModel").createHueStore;
    };
    window.spatialHarness = harness.mountHarness();
    const c = window.spatialHarness.controller;
    c.setSection({
      type: "hue",
      hue: 264.1,
      lightness: null,
      outcomes: createHueStore().outcomes(264.1),
    });
    c.home();
  });
  const read = () => page.evaluate(() => window.spatialHarness.controller.inspect());
  await expect.poll(async () => (await read()).frames).toBeGreaterThan(0);
  await expect.poll(async () => (await read()).pendingFrame).toBe(false);
  const first = await read(),
    sheet = page.locator("canvas").last(),
    before = await sheet.screenshot();
  await page.evaluate(() => window.spatialHarness.lose());
  await expect.poll(async () => (await read()).lost).toBe(true);
  await page.evaluate(() => window.spatialHarness.restore());
  await expect.poll(async () => (await read()).lost).toBe(false);
  await expect.poll(async () => (await read()).frames).toBeGreaterThan(first.frames);
  await expect.poll(async () => (await read()).pendingFrame).toBe(false);
  expect((await sheet.screenshot()).equals(before)).toBe(true);
  await page.evaluate(async () => {
    const model = "/src/spatial/hueModel.ts";
    const { createHueStore } = (await import(/* @vite-ignore */ model)) as {
      createHueStore: typeof import("../src/spatial/hueModel").createHueStore;
    };
    const store = createHueStore(),
      c = window.spatialHarness.controller;
    for (let h = 0; h < 360; h += 10) {
      c.setSection({ type: "hue", hue: h, lightness: null, outcomes: store.outcomes(h) });
      await new Promise(requestAnimationFrame);
    }
  });
  await expect.poll(async () => (await read()).pendingFrame).toBe(false);
  expect((await read()).geometries).toBe(first.geometries);
  await page.evaluate(() => window.spatialHarness.controller.dispose());
  const disposed = await read();
  expect(disposed.geometries).toBe(0);
  expect(disposed.programs).toBe(0);
  expect(disposed.pendingFrame).toBe(false);
  expect(await page.evaluate(() => window.spatialHarness.listenerDetails())).toEqual([]);
  await page.evaluate(() => window.spatialHarness.releaseAudit());
});
