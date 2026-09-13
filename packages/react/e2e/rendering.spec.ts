import type { Page } from "@playwright/test";
import { expect, test } from "./browserFixture";
async function openInstrument(page: Page) {
  await page.goto("/?single");
  await expect(page.locator("[data-render-color-space]")).not.toHaveAttribute(
    "data-render-color-space",
    "pending",
  );
}

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
