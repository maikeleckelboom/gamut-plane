import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("[data-canvas-capability]")).not.toHaveAttribute(
    "data-canvas-capability",
    "pending",
  );
  await expect(page.locator("[data-gamut-boundary]")).toHaveCount(2);
}

test("OKLCH desktop reference", async ({ page }) => {
  await ready(page);
  await expect(page).toHaveScreenshot("oklch-desktop.png", { fullPage: true });
});

test("OKLab desktop reference", async ({ page }) => {
  await ready(page);
  await page.getByRole("radio", { name: "OKLab" }).click();
  await expect(page.getByRole("application", { name: /OKLab a\/b plane/ })).toBeVisible();
  await expect(page).toHaveScreenshot("oklab-desktop.png", { fullPage: true });
});

test("OKLCH narrow reference", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await expect(page).toHaveScreenshot("oklch-narrow.png", { fullPage: true });
});

test("both gamut boundaries reference", async ({ page }) => {
  await ready(page);
  await expect(page.locator(".color-plane__surface")).toHaveScreenshot("boundaries-visible.png");
});
