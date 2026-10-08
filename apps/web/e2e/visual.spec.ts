import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("[data-canvas-capability]")).not.toHaveAttribute(
    "data-canvas-capability",
    "pending",
  );
  await expect(page.locator("[data-gp-root]")).toHaveAttribute("data-active-plane", "oklch");
}

test("compact editable instrument in a 440 px host", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>(".instrument-primary")!.style.width = "440px";
  });
  await expect(page.locator("[data-gp-root]")).toHaveScreenshot("compact-editable-440.png");
});

test("native RGB field and production Area at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await ready(page);
  await page.locator(".instrument-primary").evaluate((element) => {
    (element as HTMLElement).style.width = "320px";
  });
  await page.getByRole("combobox", { name: "Coordinates" }).click();
  await page.locator('[role="option"][data-value="srgb"]').click();
  await page.getByLabel("Blue numeric value").fill("-0.1");
  await page.getByLabel("Blue numeric value").press("Enter");
  await page.getByLabel("Red numeric value").fill("1.2");
  await page.getByLabel("Red numeric value").press("Enter");
  await page.getByRole("combobox", { name: "Area" }).click();
  const popup = page.getByRole("listbox", { name: "Area" });
  const bounds = (await popup.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  // Page capture includes the complete top-layer popup outside the instrument root.
  await expect(page).toHaveScreenshot("native-rgb-area-320.png", { fullPage: true });
});

test("generalized alternate editor reference", async ({ page }) => {
  await ready(page);
  await page.getByRole("combobox", { name: "Coordinates" }).click();
  await page.locator('[role="option"][data-value="oklab"]').click();
  await expect(page.locator("[data-gp-root]")).toHaveAttribute("data-active-plane", "oklab");
  await expect(page).toHaveScreenshot("generalized-oklab-desktop.png", { fullPage: true });
});

test("generalized narrow and enlarged-text references", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await expect(page).toHaveScreenshot("generalized-editable-narrow.png", { fullPage: true });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await page.getByRole("button", { name: "Gamut references" }).click();
  await expect(page).toHaveScreenshot("generalized-editable-enlarged-text.png", {
    fullPage: true,
  });
});

test("outside Reference excursion at 440 px", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>(".instrument-primary")!.style.width = "440px";
  });
  const root = page.locator("[data-gp-root]");
  await root.getByLabel("Chroma numeric value").fill("0.24");
  await root.getByLabel("Chroma numeric value").press("Enter");
  await expect(root).toHaveScreenshot("reference-srgb-outside-440.png");
});
