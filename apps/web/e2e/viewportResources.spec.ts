import { expect, test, type Page } from "@playwright/test";

/**
 * Resource evidence for the field camera. It asserts structure that must not depend on
 * magnification and records timings as annotations; it makes no frame-rate promise.
 */

interface Frame {
  zoom: number;
  backing: [number, number];
  gradients: number;
  stops: number;
  scheduled: number;
  medianMs: number;
  maxMs: number;
}

async function open(page: Page, area: "oklch" | "oklab" | "srgb"): Promise<void> {
  await page.goto("/e2e/fixtures/selectionShell.html?alpha");
  const root = page.locator("#instrument [data-gp-root]");
  await expect(root.locator("[data-render-color-space]")).not.toHaveAttribute(
    "data-render-color-space",
    "pending",
  );
  if (area !== "oklch") {
    await root.getByRole("combobox", { name: "Coordinates" }).click();
    await root.locator(`[role="option"][data-value="${area}"]`).click();
  }
  await expect(root.locator("[data-picker-plane]")).toHaveCount(1);
}

/** Measures camera-driven presentations only: wheel steps, then panning frames at that zoom. */
async function measure(page: Page, zooms: number[]): Promise<Frame[]> {
  return page.evaluate(async (targets) => {
    const surface = document.querySelector<HTMLElement>("#instrument [data-gp-part='surface']")!;
    const canvas = surface.querySelector<HTMLCanvasElement>("canvas")!;
    const plane = surface.closest<HTMLElement>("[data-gp-part='plane']")!;
    const proto = CanvasRenderingContext2D.prototype;
    const originalGradient = proto.createLinearGradient;
    const originalStop = CanvasGradient.prototype.addColorStop;
    let gradients = 0;
    let stops = 0;
    proto.createLinearGradient = function (...args: [number, number, number, number]) {
      gradients += 1;
      return originalGradient.apply(this, args);
    };
    CanvasGradient.prototype.addColorStop = function (offset: number, color: string) {
      stops += 1;
      return originalStop.call(this, offset, color);
    };
    const originalRaf = window.requestAnimationFrame.bind(window);
    let durations: number[] = [];
    let scheduled = 0;
    window.requestAnimationFrame = (callback) => {
      scheduled += 1;
      return originalRaf((time) => {
        const start = performance.now();
        callback(time);
        durations.push(performance.now() - start);
      });
    };
    const box = surface.getBoundingClientRect();
    const frame = () =>
      new Promise<void>((resolve) => originalRaf(() => originalRaf(() => resolve())));
    const wheel = async (deltaY: number) => {
      surface.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          altKey: true,
          deltaY,
          clientX: box.left + box.width / 2,
          clientY: box.top + box.height / 2,
        }),
      );
      await frame();
    };
    const results: Frame[] = [];
    for (const target of targets) {
      while (Number(plane.dataset.gpViewportZoom) < target - 1e-9) await wheel(-240);
      await frame();
      // Pan a little each frame so every presentation is a new window, never a cache hit.
      durations = [];
      gradients = 0;
      stops = 0;
      scheduled = 0;
      const frames = 24;
      for (let index = 0; index < frames; index += 1) {
        surface.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: " ",
            code: "Space",
            bubbles: true,
            cancelable: true,
          }),
        );
        surface.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: index % 2 === 0 ? "ArrowRight" : "ArrowLeft",
            bubbles: true,
            cancelable: true,
          }),
        );
        document.dispatchEvent(
          new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true }),
        );
        await frame();
      }
      const sorted = [...durations].sort((a, b) => a - b);
      results.push({
        zoom: Number(plane.dataset.gpViewportZoom),
        backing: [canvas.width, canvas.height],
        gradients: gradients / frames,
        stops: stops / frames,
        scheduled: scheduled / frames,
        medianMs: sorted[Math.floor(sorted.length / 2)] ?? 0,
        maxMs: sorted.at(-1) ?? 0,
      });
    }
    proto.createLinearGradient = originalGradient;
    CanvasGradient.prototype.addColorStop = originalStop;
    window.requestAnimationFrame = originalRaf;
    return results;
  }, zooms);
}

for (const area of ["oklch", "oklab", "srgb"] as const) {
  test(`${area}: backing store and per-frame work do not grow with magnification`, async ({
    page,
  }, info) => {
    await open(page, area);
    const frames = await measure(page, [1.5, 4, 8]);
    for (const frame of frames) {
      info.annotations.push({
        type: "measurement",
        description: `${area} ${frame.zoom.toFixed(2)}x backing ${frame.backing.join("x")} gradients/frame ${frame.gradients} stops/frame ${frame.stops} median ${frame.medianMs.toFixed(2)}ms max ${frame.maxMs.toFixed(2)}ms`,
      });
    }
    const [first, ...rest] = frames;
    expect(first!.backing[0]).toBeGreaterThan(0);
    for (const frame of rest) {
      // The raster is the visible viewport, whatever the zoom.
      expect(frame.backing).toEqual(first!.backing);
      // Gradient and stop work per presentation is a function of the viewport, not the zoom.
      expect(frame.gradients).toBe(first!.gradients);
      expect(frame.stops).toBe(first!.stops);
    }
    // Each camera step schedules one coalesced presentation frame.
    for (const frame of frames) expect(frame.scheduled).toBeLessThanOrEqual(1.01);
  });
}

test("a high-density display backs the field at viewport times DPR, never zoom squared", async ({
  browser,
}) => {
  const context = await browser.newContext({
    deviceScaleFactor: 2,
    viewport: { width: 1000, height: 900 },
  });
  const page = await context.newPage();
  await open(page, "srgb");
  const sizes = async () =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("#instrument canvas")!;
      const surface = canvas.parentElement!;
      return {
        backing: [canvas.width, canvas.height],
        css: [surface.clientWidth, surface.clientHeight],
      };
    });
  const fitted = await sizes();
  expect(fitted.backing).toEqual([fitted.css[0]! * 2, fitted.css[1]! * 2]);
  await measure(page, [8]);
  expect(await sizes()).toEqual(fitted);
  await context.close();
});
