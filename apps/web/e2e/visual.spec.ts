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
  await page.getByRole("combobox", { name: "Coordinates" }).click();
  await page.locator('[role="option"][data-value="srgb"]').click();
  await expect(page.locator("[data-picker-plane]")).toHaveCount(0);
  await expect(page).toHaveScreenshot("generalized-observation-desktop.png", { fullPage: true });
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
  await page.getByRole("button", { name: "Gamuts" }).click();
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
  await root.getByRole("button", { name: "Gamuts" }).click();
  await root.getByLabel("sRGB Status", { exact: true }).uncheck();
  await root.getByRole("button", { name: "Gamuts" }).click();
  await expect(root.locator("[data-gamut-warning]")).toHaveCount(0);
  await expect(root.locator('[data-gp-part="reference-connector"]')).toHaveCount(0);
  await expect(root.locator('[data-gp-marker="reference"]')).toHaveCount(0);
  await expect(root.locator("[data-gamut-boundary]")).toHaveCount(2);
  await expect(root).toHaveScreenshot("reference-srgb-unchecked-440.png");
  await root.getByRole("button", { name: "Gamuts" }).click();
  await root.getByLabel("sRGB Status", { exact: true }).check();
  await root.getByRole("radio", { name: "Display P3", includeHidden: true }).check();
  await root.getByRole("button", { name: "Gamuts" }).click();
  await expect(root).toHaveScreenshot("reference-display-p3-440.png");
  await root.getByRole("button", { name: "Gamuts" }).click();
  await root.getByRole("radio", { name: "None", includeHidden: true }).check();
  await root.getByRole("button", { name: "Gamuts" }).click();
  await expect(root).toHaveScreenshot("reference-none-440.png");
});

test("interior OKLCH and OKLab keep ordinary boundaries without excursion annotations", async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel("Chroma numeric value").fill("0.03");
  await page.getByLabel("Chroma numeric value").press("Enter");
  const root = page.locator("[data-gp-root]");
  const connector = root.locator('[data-gp-part="reference-connector"]');
  const marker = root.locator('[data-gp-marker="reference"]');
  await expect(connector).toHaveCount(0);
  await expect(marker).toHaveCount(0);
  await expect(root.locator("[data-gamut-boundary]")).toHaveCount(2);
  await expect(root.locator("[data-gamut-warning]")).toHaveCount(0);
  await expect(root).toHaveScreenshot("reference-inside-oklch.png");
  const source = await page.locator('[data-css-representation="oklch"] code').textContent();
  await root.getByRole("button", { name: "Gamuts" }).click();
  await root.getByLabel("sRGB Status", { exact: true }).uncheck();
  await root.getByRole("button", { name: "Gamuts" }).click();
  await expect(connector).toHaveCount(0);
  await expect(marker).toHaveCount(0);
  await expect(root.locator("[data-gamut-boundary]")).toHaveCount(2);
  await expect(
    root.getByRole("radio", { name: "sRGB", exact: true, includeHidden: true }),
  ).toBeChecked();
  await expect(page.locator('[data-css-representation="oklch"] code')).toHaveText(source!);
  // The complete instrument must remain visually identical when only an interior Status is disabled.
  await root.getByLabel("Chroma numeric value").focus();
  await expect(root).toHaveScreenshot("reference-inside-oklch.png");
  await root.getByRole("button", { name: "Gamuts" }).click();
  await root.getByLabel("sRGB Status", { exact: true }).check();
  await root.getByRole("button", { name: "Gamuts" }).click();
  await page.getByRole("combobox", { name: "Coordinates" }).click();
  await page.locator('[role="option"][data-value="oklab"]').click();
  await expect(
    root.locator('[data-gp-marker="reference"], [data-gp-part="reference-connector"]'),
  ).toHaveCount(0);
  await expect(root.locator("[data-gamut-warning]")).toHaveCount(0);
  await expect(root.locator("[data-gamut-boundary]")).toHaveCount(2);
  await expect(root).toHaveScreenshot("reference-inside-oklab.png");
});

test("within-tolerance exact status keeps ordinary boundaries without excursion annotations", async ({
  page,
}) => {
  await ready(page);
  const root = page.locator("[data-gp-root]");
  // OKLCH observation of authored sRGB [-1e-10, 0.5, 0.5], preserving numeric precision.
  for (const [label, value] of [
    ["Hue", "194.76895989787468"],
    ["Lightness", "0.5415923764146119"],
    ["Chroma", "0.09244884602706227"],
  ]) {
    await root.getByLabel(`${label} numeric value`).fill(value!);
    await root.getByLabel(`${label} numeric value`).press("Enter");
  }
  await root.getByRole("button", { name: "Gamuts" }).click();
  await expect(
    root.locator('[data-gp-part="exact-result"]').filter({ hasText: "Within tolerance" }),
  ).toHaveCount(1);
  await root.getByRole("button", { name: "Gamuts" }).click();
  await expect(root.locator('[data-gp-part="reference-connector"]')).toHaveCount(0);
  await expect(root.locator('[data-gp-marker="reference"]')).toHaveCount(0);
  await expect(root.locator("[data-gamut-boundary]")).toHaveCount(2);
  await expect(root.locator("[data-gamut-warning]")).toHaveCount(0);
  await expect(root).toHaveScreenshot("reference-within-tolerance.png");
});

test("explicit guides and exact checks reference", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    document.querySelector<HTMLElement>(".instrument-primary")!.style.width = "440px";
  });
  await page.getByRole("button", { name: "Gamuts" }).click();
  await page.getByLabel("sRGB Status", { exact: true }).check();
  await page.getByLabel("Display P3 Boundary", { exact: true }).uncheck();
  await expect(page.locator("[data-gamut-boundary='srgb']")).toHaveCount(1);
  await expect(page.locator("[data-gp-part='exact-result']")).toHaveCount(2);
  await expect(page.locator("[data-gp-root]")).toHaveScreenshot("generalized-comparison.png");
});
