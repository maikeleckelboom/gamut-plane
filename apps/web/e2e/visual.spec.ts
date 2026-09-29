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

test("generalized observation desktop reference", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Color space", { exact: true }).selectOption("srgb");
  await expect(page.locator("[data-picker-plane]")).toHaveCount(0);
  await expect(page).toHaveScreenshot("generalized-observation-desktop.png", { fullPage: true });
});

test("generalized alternate editor reference", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Color space", { exact: true }).selectOption("oklab");
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
  await expect(page).toHaveScreenshot("generalized-editable-enlarged-text.png", {
    fullPage: true,
  });
});

test("explicit guides and exact checks reference", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>(".instrument-primary")!.style.width = "440px";
  });
  await page.getByText("Gamuts", { exact: true }).click();
  await page.getByRole("group", { name: "Check color in" }).getByLabel("sRGB").check();
  await page
    .getByRole("group", { name: "Show boundaries" })
    .getByLabel("Display P3 boundary")
    .uncheck();
  await expect(page.locator("[data-gamut-boundary='srgb']")).toHaveCount(1);
  await expect(page.locator("[data-gp-part='exact-result']")).toHaveCount(1);
  await expect(page.locator("[data-gp-root]")).toHaveScreenshot("generalized-comparison.png");
});
