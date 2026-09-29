import { expect, test, type Page } from "@playwright/test";

async function openInstrument(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("[data-canvas-capability]")).not.toHaveAttribute(
    "data-canvas-capability",
    "pending",
  );
  await expect(page.locator("[data-gp-root]")).toBeVisible();
}

test("starts with an editable OKLCH plane and no requested comparisons", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await openInstrument(page);
  await expect(page.locator("[data-active-plane='oklch']")).toBeVisible();
  await expect(page.locator("[data-gamut-boundary]")).toHaveCount(0);
  await expect(page.locator("[data-gp-part='exact-result']")).toHaveCount(0);
  await expect(page.locator("[data-gp-root]")).toContainText("No gamut checks selected");
  expect(errors).toEqual([]);
});

test("selection, inspection, checks, and guides do not author color", async ({ page }) => {
  await openInstrument(page);
  const initial = await page.locator('[data-css-representation="oklch"] code').textContent();
  const root = page.locator("[data-gp-root]");
  await root.getByLabel("Representation", { exact: true }).selectOption("srgb");
  await expect(root.locator("[data-picker-plane]")).toHaveCount(0);
  await expect(root.getByRole("region", { name: "sRGB coordinates" })).toBeVisible();
  await root.getByText("Gamut checks and guides").click();
  await root.getByRole("group", { name: "Exact checks" }).getByLabel("Display P3").check();
  await root.getByRole("group", { name: "Exact checks" }).getByLabel("sRGB").check();
  await expect(root.locator("[data-gp-part='exact-result']")).toHaveCount(2);
  await expect(root.locator("[data-gp-part='exact-result']").first()).toContainText("sRGB");
  await root.getByRole("group", { name: "Visible guides" }).getByLabel("sRGB boundary").check();
  await expect(root).toContainText("Requested guides will appear");
  await root.getByLabel("Representation", { exact: true }).selectOption("oklch");
  await expect(root.locator("[data-gamut-boundary='srgb']")).toHaveCount(1);
  await root.getByLabel("Edit coordinates").uncheck();
  await expect(root.locator("[data-picker-plane]")).toHaveCount(0);
  await root.getByLabel("Edit coordinates").check();
  await expect(root.locator("[data-picker-plane]")).toHaveCount(1);
  await expect(page.locator('[data-css-representation="oklch"] code')).toHaveText(initial!);
});

test("pointer, keyboard, and numeric edits update the selected color", async ({ page }) => {
  await openInstrument(page);
  const css = page.locator('[data-css-representation="oklch"] code');
  const plane = page.getByRole("application", { name: /OKLCH plane/ });
  const initial = await css.textContent();
  await plane.focus();
  await plane.press("ArrowRight");
  await expect(css).not.toHaveText(initial!);
  const afterKeyboard = await css.textContent();
  const bounds = await plane.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(bounds!.x + bounds!.width * 0.7, bounds!.y + bounds!.height * 0.4);
  await expect(css).not.toHaveText(afterKeyboard!);
  await page.getByLabel("Chroma numeric value").fill("0.25");
  await page.getByLabel("Chroma numeric value").press("Enter");
  await expect(page.getByLabel("Chroma numeric value")).toHaveValue("0.2500");
});

test("alternate editor keeps authored color until an explicit edit", async ({ page }) => {
  await openInstrument(page);
  const css = page.locator('[data-css-representation="oklch"] code');
  const before = await css.textContent();
  await page.getByLabel("Representation", { exact: true }).selectOption("oklab");
  await expect(page.locator("[data-active-plane='oklab']")).toBeVisible();
  await expect(css).toHaveText(before!);
  const plane = page.getByRole("application", { name: /OKLab a\/b plane/ });
  await plane.focus();
  await plane.press("ArrowRight");
  await expect(css).not.toHaveText(before!);
});

test("copy output has honest disabled and success states", async ({ page }) => {
  await openInstrument(page);
  const srgb = page.locator('[data-css-representation="srgb"]');
  await expect(srgb.getByRole("button")).toBeDisabled();
  const p3 = page.locator('[data-css-representation="display-p3"]');
  await p3.getByRole("button").click();
  await expect(p3.getByRole("button")).toHaveText("Copied");
  await expect(page.getByRole("status")).toContainText("Copied Display P3");
});

test("narrow and enlarged text keep editable content in bounds", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 750 });
  await openInstrument(page);
  for (const size of ["100%", "200%"] as const) {
    await page.evaluate((fontSize) => {
      document.documentElement.style.fontSize = fontSize;
    }, size);
    await expect(page.getByLabel("Representation", { exact: true })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const rootOverflow = await page
      .locator("[data-gp-root]")
      .evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(rootOverflow).toBeLessThanOrEqual(0);
  }
});
