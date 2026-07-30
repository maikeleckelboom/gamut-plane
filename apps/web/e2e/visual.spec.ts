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

test("OKLCH laptop-height reference", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await ready(page);
  await expect(page).toHaveScreenshot("oklch-laptop.png", { fullPage: true });
});

test("OKLCH enlarged-text reference", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(page).toHaveScreenshot("oklch-enlarged-text.png", { fullPage: true });
});

test("both gamut boundaries reference", async ({ page }) => {
  await ready(page);
  await expect(page.locator(".color-plane__surface")).toHaveScreenshot("boundaries-visible.png");
});

test("one gamut boundary hidden reference", async ({ page }) => {
  await ready(page);
  await page.getByRole("checkbox", { name: "sRGB" }).uncheck();
  await expect(page.locator('[data-gamut-boundary="srgb"]')).toHaveCount(0);
  await expect(page.locator(".plane-instrument__field")).toHaveScreenshot(
    "srgb-boundary-hidden.png",
  );
});

test("outside-sRGB disabled copy reference", async ({ page }) => {
  await ready(page);
  const representation = page.locator('[data-css-representation="srgb"]');
  await expect(representation.getByRole("button")).toBeDisabled();
  await expect(representation).toHaveScreenshot("outside-srgb-copy-disabled.png");
});

test("copied confirmation reference", async ({ page }) => {
  await ready(page);
  const representation = page.locator('[data-css-representation="display-p3"]');
  await representation.getByRole("button").click();
  await expect(representation.getByRole("button")).toHaveText("Copied");
  await expect(representation).toHaveScreenshot("copied-confirmation.png");
});
