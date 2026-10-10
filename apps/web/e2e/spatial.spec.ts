import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile, mkdir } from "node:fs/promises";
import type { mountHarness, colorProbes } from "./spatialHarness";

// Radial boundary at m = 64: three 2 m^2 upper grids plus three fans of 2 m triangles, 6 m^2 + 6 m.
const SURFACE_TRIANGLES = 6 * 64 * 64 + 6 * 64;

declare global {
  interface Window {
    spatialHarness: ReturnType<typeof mountHarness>;
  }
}
test("spatial visual evidence at desktop and phone sizes", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 1150 });
  await page.goto("/spatial");
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("[data-spatial-frames]")).not.toHaveAttribute(
    "data-spatial-frames",
    "0",
  );
  const capture = async (name: string) => {
    const path = process.env.SPATIAL_SCREENSHOTS
      ? `${process.env.SPATIAL_SCREENSHOTS}/${name}.png`
      : testInfo.outputPath(`${name}.png`);
    if (process.env.SPATIAL_SCREENSHOTS)
      await mkdir(process.env.SPATIAL_SCREENSHOTS, { recursive: true });
    await page.screenshot({ path, fullPage: true });
  };
  await capture("desktop-shape");
  await page.getByRole("radio", { name: "Color", exact: true }).check();
  await capture("desktop-color");
  await page.getByRole("radio", { name: "Display P3", exact: true }).check();
  await capture("desktop-p3");
  await page.setViewportSize({ width: 390, height: 850 });
  await page.getByRole("button", { name: "Fit visible" }).click();
  await capture("phone-p3");
});
test("spatial surface, controls, responsive layout and no idle animation", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") errors.push(e.text());
  });
  await page.goto("/spatial");
  const stage = page.locator("[data-spatial-status]");
  await expect(stage).toHaveAttribute("data-spatial-status", "ready");
  await expect(stage).not.toHaveAttribute("data-spatial-frames", "0");
  const canvas = page.getByLabel("Orthographic gamut scene");
  const initialFrame = await stage.getAttribute("data-spatial-frames");
  // Bounded observation window is evidence of idleness, not a readiness sleep.
  await page.waitForTimeout(200);
  expect(await stage.getAttribute("data-spatial-frames")).toBe(initialFrame);
  const shape = await canvas.screenshot();
  await page.getByRole("radio", { name: "Color", exact: true }).check();
  await expect(stage).not.toHaveAttribute("data-spatial-frames", initialFrame!);
  expect((await canvas.screenshot()).equals(shape)).toBe(false);
  await expect(page.getByText("without clipping", { exact: false })).toBeVisible();
  // One surface at a time: focus and comparison are separate, never an invalid empty state.
  await expect(page.getByRole("checkbox", { name: "Show Display P3 outline" })).toBeChecked();
  await page.getByRole("radio", { name: "Display P3", exact: true }).check();
  await expect(page.locator(".spatial-caption strong")).toHaveText("Display P3");
  await expect(page.locator(".spatial-legend")).toHaveText("sRGB outline");
  await expect(page.getByText("clips those colors for display", { exact: false })).toBeVisible();
  await page.getByRole("checkbox", { name: "Show sRGB outline" }).uncheck();
  await expect(page.locator(".spatial-legend")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Show sRGB outline" }).check();
  // Native radio semantics: arrow keys move the selection inside the group.
  await page.getByRole("radio", { name: "Display P3", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("radio", { name: "sRGB", exact: true })).toBeChecked();
  await expect(page.locator(".spatial-caption strong")).toHaveText("sRGB");
  await canvas.focus();
  await canvas.press("ArrowLeft");
  await canvas.press("Shift+ArrowUp");
  await canvas.press("+");
  await page.getByRole("button", { name: "Fit visible" }).click();
  await page.getByRole("button", { name: "Home", exact: true }).click();
  const bounds = (await canvas.boundingBox())!;
  const beforeDrag = await canvas.screenshot();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 80, bounds.y + bounds.height / 2 + 20, {
    steps: 4,
  });
  await page.mouse.up();
  expect((await canvas.screenshot()).equals(beforeDrag)).toBe(false);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 850 });
    await expect(canvas).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(page.getByRole("button", { name: "Home", exact: true })).toBeInViewport();
    // Every control stays reachable inside the viewport when the toolbar wraps.
    for (const control of [
      page.getByRole("radio", { name: "Display P3", exact: true }),
      page.getByRole("checkbox", { name: /outline/ }),
      page.getByRole("radio", { name: "Color", exact: true }),
      page.getByRole("button", { name: "Fit visible" }),
    ]) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    }
  }
  expect(errors).toEqual([]);
});

test("WebGL2 fallback is explicit", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (id: string, ...args: unknown[]) {
      if (id === "webgl2") return null;
      return Reflect.apply(original, this, [id, ...args]);
    } as typeof original;
  });
  await page.goto("/spatial");
  await expect(page.getByText("3D rendering is unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the compact instrument" })).toHaveAttribute(
    "href",
    "/",
  );
});

test("GPU color and drawing-buffer probes against independent CPU XYZ references", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const path = "/e2e/spatialHarness.ts";
    const harness = (await import(/* @vite-ignore */ path)) as { colorProbes: typeof colorProbes };
    return [harness.colorProbes("srgb"), harness.colorProbes("display-p3")];
  });
  for (const result of results) {
    expect(result.error).toBe(0);
    expect(result.backface).toEqual([0, 0, 0, 255]);
    if (result.output === "srgb") expect(result.granted).toBe("srgb");
    for (const row of result.rows) {
      row.bytes.forEach((v, axis) =>
        expect(Math.abs(v - row.expected[axis]!), row.name).toBeLessThanOrEqual(1),
      );
      row.raw?.forEach((v, axis) =>
        expect(Math.abs(v - row.expectedLinear[axis]!), row.name).toBeLessThan(4e-6),
      );
    }
  }
  await testInfo.attach("GPU color evidence", {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });
  if (process.env.SPATIAL_EVIDENCE) {
    await mkdir(process.env.SPATIAL_EVIDENCE, { recursive: true });
    await writeFile(`${process.env.SPATIAL_EVIDENCE}/color.json`, JSON.stringify(results, null, 2));
  }
});

test("mounted GPU lifecycle: suspend, zero size, restore, dispose and remount", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.locator("[data-canvas-capability]")).not.toHaveAttribute(
    "data-canvas-capability",
    "pending",
  );
  await page.evaluate(async () => {
    const path = "/e2e/spatialHarness.ts";
    const harnessModule = (await import(/* @vite-ignore */ path)) as {
      mountHarness: typeof mountHarness;
    };
    window.spatialHarness = harnessModule.mountHarness();
  });
  const inspect = () => page.evaluate(() => window.spatialHarness.controller.inspect());
  await expect.poll(async () => (await inspect()).frames).toBeGreaterThan(0);
  const initial = await inspect();
  expect(await page.evaluate(() => window.spatialHarness.listenerCount())).toBeGreaterThan(0);
  // Surface, outline in front, outline stippled behind the surface, and the axes.
  expect(initial.drawCalls).toBe(4);
  expect(initial.reference!.silhouetteTruncated).toBe(false);
  // Surface triangles plus two triangles per drawn line instance (outline twice, seven axis segments).
  expect(initial.triangles).toBe(
    SURFACE_TRIANGLES + 2 * (2 * initial.reference!.silhouetteSegments + 7),
  );
  await page.locator("canvas").last().scrollIntoViewIfNeeded();
  const canvasBox = (await page.locator("canvas").last().boundingBox())!;
  await page.mouse.move(canvasBox.x + 450, canvasBox.y + 350);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(canvasBox.x + 490, canvasBox.y + 380, { steps: 3 });
  await page.mouse.up({ button: "right" });
  expect((await inspect()).camera.target).not.toEqual(initial.camera.target);
  await page.mouse.wheel(0, -180);
  await expect.poll(async () => (await inspect()).camera.zoom).toBeGreaterThan(initial.camera.zoom);
  await page.evaluate(() => window.spatialHarness.controller.home());
  await expect.poll(async () => (await inspect()).camera.zoom).toBe(1);
  expect((await inspect()).camera.target).toEqual(initial.camera.target);
  await page.evaluate(() => {
    const c = window.spatialHarness.controller;
    c.setVisible(false);
    c.home();
  });
  const hidden = await inspect();
  expect(hidden.pendingFrame).toBe(false);
  await page.waitForTimeout(100);
  expect((await inspect()).frames).toBe(hidden.frames);
  await page.evaluate(() => {
    const c = window.spatialHarness.controller;
    c.resize(0, 0, 2);
    c.setVisible(true);
  });
  expect((await inspect()).pendingFrame).toBe(false);
  await page.evaluate(() => window.spatialHarness.controller.resize(3840, 2160, 3));
  await expect.poll(async () => (await inspect()).frames).toBeGreaterThan(hidden.frames);
  const resized = await inspect();
  expect(resized.backing.width * resized.backing.height).toBeLessThanOrEqual(3_000_000);
  await page.evaluate(() => window.spatialHarness.lose());
  await expect.poll(async () => (await inspect()).lost).toBe(true);
  expect((await inspect()).pendingFrame).toBe(false);
  await page.evaluate(() => window.spatialHarness.restore());
  await expect.poll(async () => (await inspect()).lost).toBe(false);
  await expect.poll(async () => (await inspect()).frames).toBeGreaterThan(resized.frames);
  const restored = await inspect();
  expect(restored.resources).toEqual(initial.resources); // No regeneration on resize/camera/context restore.
  await page.evaluate(() => {
    window.spatialHarness.controller.dispose();
    window.spatialHarness.controller.dispose();
  });
  const disposed = await inspect();
  expect(disposed.pendingFrame).toBe(false);
  expect(disposed.geometries).toBe(0);
  expect(disposed.programs).toBe(0);
  expect(await page.evaluate(() => window.spatialHarness.listenerDetails())).toEqual([]);
  await page.evaluate(() => window.spatialHarness.releaseAudit());
  await page.evaluate(() => {
    const c = window.spatialHarness.controller;
    c.resize(10, 10, 1);
    c.home();
    c.setVisible(true);
  });
  expect((await inspect()).pendingFrame).toBe(false);
  await testInfo.attach("GPU lifecycle evidence", {
    body: JSON.stringify({ initial, resized, restored, disposed }, null, 2),
    contentType: "application/json",
  });
  if (process.env.SPATIAL_EVIDENCE)
    await writeFile(
      `${process.env.SPATIAL_EVIDENCE}/lifecycle.json`,
      JSON.stringify({ initial, resized, restored, disposed }, null, 2),
    );
  await page.evaluate(async () => {
    window.spatialHarness.canvas.remove();
    const path = "/e2e/spatialHarness.ts";
    const harnessModule = (await import(/* @vite-ignore */ path)) as {
      mountHarness: typeof mountHarness;
    };
    window.spatialHarness = harnessModule.mountHarness();
  });
  await expect.poll(async () => (await inspect()).frames).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.spatialHarness.controller.dispose();
    window.spatialHarness.releaseAudit();
  });
});

test("reference outline is correct for every surface, comparison and presentation state", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("[data-canvas-capability]")).not.toHaveAttribute(
    "data-canvas-capability",
    "pending",
  );
  await page.evaluate(async () => {
    const path = "/e2e/spatialHarness.ts";
    const harnessModule = (await import(/* @vite-ignore */ path)) as {
      mountHarness: typeof mountHarness;
    };
    window.spatialHarness = harnessModule.mountHarness();
  });
  const inspect = () => page.evaluate(() => window.spatialHarness.controller.inspect());
  await expect.poll(async () => (await inspect()).frames).toBeGreaterThan(0);
  for (const active of ["srgb", "display-p3"] as const)
    for (const compare of [false, true])
      for (const mode of ["shape", "color"] as const) {
        const before = (await inspect()).frames;
        await page.evaluate((state) => window.spatialHarness.controller.update(state), {
          active,
          compare,
          mode,
        });
        await expect.poll(async () => (await inspect()).frames).toBeGreaterThan(before);
        const view = await inspect();
        const label = `${active} compare=${compare} ${mode}`;
        // Only the compared gamut's outline adds draw calls; its geometry is never regenerated.
        expect(view.drawCalls, label).toBe(compare ? 4 : 2);
        if (compare) {
          expect(view.reference!.space, label).toBe(active === "srgb" ? "display-p3" : "srgb");
          expect(view.reference!.silhouetteSegments, label).toBeGreaterThan(100);
          expect(view.reference!.silhouetteTruncated, label).toBe(false);
        } else expect(view.reference, label).toBeNull();
        const lineInstances = (compare ? 2 * view.reference!.silhouetteSegments : 0) + 7;
        expect(view.triangles, label).toBe(SURFACE_TRIANGLES + 2 * lineInstances);
      }
  // Orbit sweep through the keyboard path: the outline follows the view, never overflows, and the
  // scene returns to idle with no pending frame.
  await page.evaluate(() => {
    window.spatialHarness.canvas.scrollIntoView();
    window.spatialHarness.canvas.focus();
  });
  const seen = new Set<number>();
  for (let step = 0; step < 40; step++) {
    const before = (await inspect()).frames;
    await page.keyboard.press(step % 7 === 6 ? "ArrowUp" : "ArrowLeft");
    await expect.poll(async () => (await inspect()).frames).toBeGreaterThan(before);
    const view = await inspect();
    expect(view.reference!.silhouetteTruncated).toBe(false);
    expect(view.reference!.silhouetteSegments).toBeGreaterThan(100);
    seen.add(view.reference!.silhouetteSegments);
  }
  expect(seen.size).toBeGreaterThan(5); // The outline is recomputed for each view, not frozen.
  await expect.poll(async () => (await inspect()).pendingFrame).toBe(false);
  const idle = (await inspect()).frames;
  await page.waitForTimeout(150);
  expect((await inspect()).frames).toBe(idle);
  await page.evaluate(() => {
    window.spatialHarness.controller.dispose();
    window.spatialHarness.releaseAudit();
  });
});

test("axis labels name the opponent axes and never label through the focused body", async ({
  page,
}) => {
  await page.goto("/spatial");
  const stage = page.locator("[data-spatial-status]");
  await expect(stage).toHaveAttribute("data-spatial-status", "ready");
  const labels = page.locator(".spatial-axis");
  const texts = () => labels.allTextContents();
  await expect
    .poll(texts)
    .toEqual(["L 1 · white", "+a red", "−a green", "+b yellow", "−b blue", "L 0 · black"]);
  const canvas = page.getByLabel("Orthographic gamut scene");
  await canvas.focus();
  for (let step = 0; step < 8; step++) await canvas.press("ArrowLeft");
  // From the far side the green end of the a axis is hidden behind the body.
  await expect.poll(texts).not.toContain("−a green");
  expect(await texts()).toContain("L 1 · white");
  expect(await texts()).toContain("L 0 · black");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await expect.poll(async () => (await texts()).length).toBe(6);
});

test("the whole stage fits common laptop viewports", async ({ page }) => {
  for (const [width, height] of [
    [1440, 900],
    [1280, 720],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/spatial");
    await expect(page.locator("[data-spatial-status]")).toHaveAttribute(
      "data-spatial-status",
      "ready",
    );
    const stage = (await page.locator(".spatial-stage").boundingBox())!;
    expect(stage.y + stage.height, `${width}x${height}`).toBeLessThanOrEqual(height);
  }
});
