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
  await page.getByLabel("Coordinates", { exact: true }).selectOption("srgb");
  await expect(page.locator("[data-picker-plane]")).toHaveCount(0);
  await expect(page).toHaveScreenshot("generalized-observation-desktop.png", { fullPage: true });
});

test("generalized alternate editor reference", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Coordinates", { exact: true }).selectOption("oklab");
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
  await page.locator("[data-gp-root] summary").click();
  await expect(page).toHaveScreenshot("generalized-editable-enlarged-text.png", {
    fullPage: true,
  });
});

test("Reference warning, Display P3 and no Reference at 440 px", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>(".instrument-primary")!.style.width = "440px";
  });
  const root = page.locator("[data-gp-root]");
  await root.getByLabel("Chroma numeric value").fill("0.24");
  await root.getByLabel("Chroma numeric value").press("Enter");
  await expect(root).toHaveScreenshot("reference-srgb-outside-440.png");
  await root.locator("summary").click();
  await root.getByLabel("Use Display P3 as Reference").check();
  await root.locator("summary").click();
  await expect(root).toHaveScreenshot("reference-display-p3-440.png");
  await root.locator("summary").click();
  await root.getByLabel("No Reference").check();
  await root.locator("summary").click();
  await expect(root).toHaveScreenshot("reference-none-440.png");
});

test("interior OKLab keeps only the active swatch and ordinary boundaries", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Chroma numeric value").fill("0.03");
  await page.getByLabel("Chroma numeric value").press("Enter");
  await page.getByLabel("Coordinates", { exact: true }).selectOption("oklab");
  const root = page.locator("[data-gp-root]");
  await expect(
    root.locator('[data-gp-marker="reference"], [data-gp-part="reference-connector"]'),
  ).toHaveCount(0);
  await expect(root).toHaveScreenshot("reference-inside-oklab.png");
});

test("explicit guides and exact checks reference", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>(".instrument-primary")!.style.width = "440px";
  });
  await page.getByText("Gamuts", { exact: true }).click();
  await page.getByLabel("sRGB Status", { exact: true }).check();
  await page.getByLabel("Display P3 Boundary", { exact: true }).uncheck();
  await expect(page.locator("[data-gamut-boundary='srgb']")).toHaveCount(1);
  await expect(page.locator("[data-gp-part='exact-result']")).toHaveCount(2);
  await expect(page.locator("[data-gp-root]")).toHaveScreenshot("generalized-comparison.png");
});
