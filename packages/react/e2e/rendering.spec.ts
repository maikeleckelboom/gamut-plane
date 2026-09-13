import type { Page } from "@playwright/test";
import { expect, test } from "./browserFixture";
async function openInstrument(page: Page) {
  await page.goto("/?single");
  await expect(page.locator("[data-render-color-space]")).not.toHaveAttribute(
    "data-render-color-space",
    "pending",
  );
}

test("unavailable Hue preview buffer keeps a painted full-quality field and can recover", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      options?: unknown,
    ) {
      if (
        type === "2d" &&
        !this.isConnected &&
        this.width === 192 &&
        document.documentElement.dataset.failPreview === "true"
      )
        return null;
      return Reflect.apply(getContext, this, [type, options]);
    } as typeof getContext;
  });
  await openInstrument(page);
  const plane = page.locator("[data-picker-plane]");
  const surface = page.getByRole("application");
  const canvas = surface.locator("canvas");
  const capability = await surface.getAttribute("data-render-color-space");
  const original = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await page.locator("html").evaluate((element: HTMLElement) => {
    element.dataset.failPreview = "true";
  });
  const hue = page.locator('[data-picker-control="h"] input[type="range"]');
  await hue.scrollIntoViewIfNeeded();
  const bounds = (await hue.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await expect
    .poll(() => canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL()))
    .not.toBe(original);
  await expect(surface).toHaveAttribute("data-render-color-space", capability!);
  await expect(plane).toHaveAttribute("data-field-quality", "full");
  const variation = await canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("2d")!;
    const samples = [0.1, 0.9].map((y) => {
      const pixel = context.getImageData(element.width / 2, element.height * y, 1, 1).data;
      return pixel[0]! + pixel[1]! + pixel[2]!;
    });
    return Math.abs(samples[0]! - samples[1]!);
  });
  expect(variation).toBeGreaterThan(100);
  const fallback = await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL());
  await page.mouse.up();
  await expect(plane).toHaveAttribute("data-field-quality", "full");
  expect(await canvas.evaluate((element: HTMLCanvasElement) => element.toDataURL())).toBe(fallback);
  await page.locator("html").evaluate((element: HTMLElement) => {
    delete element.dataset.failPreview;
  });
  await page.mouse.move(bounds.x + bounds.width * 0.75, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await expect(plane).toHaveAttribute("data-field-quality", "preview");
  await expect(surface).toHaveAttribute("data-render-color-space", capability!);
  await page.mouse.up();
  await expect(plane).toHaveAttribute("data-field-quality", "full");
});

test("switches planes and preserves open and closed contour contracts", async ({ page }) => {
  await openInstrument(page);
  const oklchPaths = await page
    .locator("[data-gamut-boundary]")
    .evaluateAll((paths) => paths.map((path) => path.getAttribute("d") ?? ""));
  expect(oklchPaths.every((path) => !path.endsWith(" Z"))).toBe(true);

  await page.getByRole("radio", { name: "OKLab" }).click();
  await expect(page.getByRole("application", { name: /OKLab a\/b plane/ })).toBeVisible();
  await expect(page.locator('[data-instrument-domain="disc"]')).toBeVisible();
  const oklabPaths = await page
    .locator("[data-gamut-boundary]")
    .evaluateAll((paths) => paths.map((path) => path.getAttribute("d") ?? ""));
  expect(oklabPaths.every((path) => path.endsWith(" Z"))).toBe(true);
});

test("fixed-plane movement preserves contours while fixed-axis edits invalidate them", async ({
  page,
}) => {
  await openInstrument(page);
  const surface = page.getByRole("application", { name: /OKLCH plane/ });
  const boundary = page.locator('[data-gamut-boundary="srgb"]');
  const originalPath = await boundary.getAttribute("d");
  const bounds = await surface.boundingBox();
  expect(bounds).not.toBeNull();

  await page.mouse.click(bounds!.x + bounds!.width * 0.32, bounds!.y + bounds!.height * 0.68);
  await expect(boundary).toHaveAttribute("d", originalPath!);

  await page
    .locator('[data-picker-control="h"] input[type="range"]')
    .evaluate((element: HTMLInputElement) => {
      element.value = "305";
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    });
  await expect(boundary).not.toHaveAttribute("d", originalPath!);
});

test("Hue dragging previews only the field and settles at full quality", async ({ page }) => {
  await openInstrument(page);
  const plane = page.locator("[data-picker-plane]");
  const hue = page.locator('[data-picker-control="h"] input[type="range"]');
  const boundary = page.locator('[data-gamut-boundary="srgb"]');
  const originalPath = await boundary.getAttribute("d");
  const bounds = await hue.boundingBox();
  expect(bounds).not.toBeNull();

  await expect(plane).toHaveAttribute("data-field-quality", "full");
  expect(await hue.evaluate((element) => getComputedStyle(element).cursor)).toBe("pointer");

  await hue.dispatchEvent("pointerdown", { pointerId: 41, pointerType: "mouse", button: 0 });
  await expect(plane).toHaveAttribute("data-field-quality", "full");
  await hue.dispatchEvent("pointerup", { pointerId: 41, pointerType: "mouse", button: 0 });
  await expect(plane).toHaveAttribute("data-field-quality", "full");

  await page.mouse.move(bounds!.x + bounds!.width * 0.25, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await expect(plane).toHaveAttribute("data-field-quality", "preview");
  expect(await hue.evaluate((element) => getComputedStyle(element).cursor)).toBe("grabbing");
  await page.mouse.move(bounds!.x + bounds!.width * 0.75, bounds!.y + bounds!.height / 2, {
    steps: 8,
  });
  await expect(boundary).not.toHaveAttribute("d", originalPath!);

  await page.mouse.up();
  await expect(plane).toHaveAttribute("data-field-quality", "full");
  expect(await hue.evaluate((element) => getComputedStyle(element).cursor)).toBe("pointer");

  const beforeKeyboard = await hue.getAttribute("aria-label");
  await hue.focus();
  await hue.press("ArrowLeft");
  await expect(hue).not.toHaveAttribute("aria-label", beforeKeyboard!);
  await expect(plane).toHaveAttribute("data-field-quality", "full");
});
