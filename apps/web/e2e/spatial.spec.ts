import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFile, mkdir } from "node:fs/promises";
import type { mountHarness, colorProbes } from "./spatialHarness";

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
  await page.getByRole("button", { name: "Color", exact: true }).click();
  await capture("desktop-color");
  await page.getByRole("button", { name: "Focus Display P3" }).click();
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
  await page.getByRole("button", { name: "Color", exact: true }).click();
  await expect(stage).not.toHaveAttribute("data-spatial-frames", initialFrame!);
  expect((await canvas.screenshot()).equals(shape)).toBe(false);
  await expect(
    page.getByText("Colors outside sRGB are clipped for display.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Focus Display P3" }).click();
  await expect(page.locator(".spatial-stage-caption strong")).toHaveText("Display P3");
  await page.getByRole("checkbox", { name: "Show Display P3" }).uncheck();
  await expect(page.locator(".spatial-stage-caption strong")).toHaveText("sRGB");
  await page.getByRole("checkbox", { name: "Show sRGB" }).uncheck();
  await expect(page.getByText("Select a gamut to inspect its surface.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Fit visible" })).toBeDisabled();
  await page.getByRole("button", { name: "Focus sRGB" }).click();
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
  expect(initial.drawCalls).toBe(4);
  expect(initial.triangles).toBe(49152);
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
