import { expect, test } from "@playwright/test";

test("Status, Boundary and Reference have independent observable effects", async ({ page }) => {
  await page.goto("/");
  const root = page.locator("[data-gp-root]");
  const source = page.locator('[data-css-representation="oklch"] code');
  const original = await source.textContent();
  const connector = root.locator('[data-gp-part="reference-connector"]');
  const marker = root.locator('[data-gp-marker="reference"]');
  const warning = root.locator('[data-gamut-warning="planar"]');
  await expect(connector).toHaveCount(1);
  await expect(marker).toHaveCount(1);
  await expect(warning).toHaveCount(1);
  await expect(warning).toHaveCSS("width", "12px");
  await expect(warning).toHaveCSS("height", "12px");
  for (const sliderWarning of await root.locator('[data-gamut-warning="linear"]').all()) {
    await expect(sliderWarning).toHaveCSS("width", "12px");
    await expect(sliderWarning).toHaveCSS("height", "12px");
  }
  const selected = await root.locator('[data-gp-marker="active"]').boundingBox();
  const triangle = await warning.boundingBox();
  expect(triangle!.x).toBeGreaterThan(selected!.x + selected!.width + 2);
  expect(triangle!.y + triangle!.height).toBeLessThan(selected!.y - 2);
  await root.locator("summary").click();
  await root.getByLabel("sRGB Status", { exact: true }).uncheck();
  await expect(connector).toHaveCount(1);
  await expect(warning).toHaveCount(0);
  await root.getByLabel("sRGB Boundary", { exact: true }).uncheck();
  await expect(connector).toHaveCount(0);
  await expect(marker).toHaveCount(0);
  await expect(root.getByLabel("Use sRGB as Reference")).toBeChecked();
  await root.getByLabel("sRGB Status", { exact: true }).check();
  await expect(warning).toHaveCount(1);
  await expect(connector).toHaveCount(0);
  await root.getByLabel("Use Display P3 as Reference").check();
  await expect(connector).toHaveCount(0);
  await expect(marker).toHaveCount(0);
  await expect(warning).toHaveCount(0);
  await root.getByLabel("No Reference").check();
  await expect(connector).toHaveCount(0);
  await expect(root.locator("[data-gamut-boundary]")).toHaveCount(1);
  await expect(root.locator('[data-gp-part="exact-result"]')).toHaveCount(2);
  await expect(source).toHaveText(original!);
});

test("plane warning falls back inside the field at the right corners", async ({ page }) => {
  await page.goto("/");
  const root = page.locator("[data-gp-root]");
  const surface = root.locator('[data-gp-part="surface"]');
  const warning = root.locator('[data-gamut-warning="planar"]');
  for (const nearTop of [true, false]) {
    const field = (await surface.boundingBox())!;
    await surface.click({ position: { x: field.width - 2, y: nearTop ? 2 : field.height - 2 } });
    await expect(warning).toBeVisible();
    const triangle = (await warning.boundingBox())!;
    const selected = (await root.locator('[data-gp-marker="active"]').boundingBox())!;
    expect(triangle.x + triangle.width).toBeLessThan(selected.x - 2);
    expect(triangle.x).toBeGreaterThanOrEqual(field.x);
    expect(triangle.y).toBeGreaterThanOrEqual(field.y);
    expect(triangle.y + triangle.height).toBeLessThanOrEqual(field.y + field.height);
    if (nearTop) expect(triangle.y).toBeGreaterThan(selected.y + selected.height + 2);
    else expect(triangle.y + triangle.height).toBeLessThan(selected.y - 2);
  }
});

test("slider warning stays beside the native Hue thumb at both equivalent endpoints", async ({
  page,
}) => {
  await page.goto("/");
  const root = page.locator("[data-gp-root]");
  await root.getByLabel("Chroma numeric value").fill("0.35");
  await root.getByLabel("Chroma numeric value").press("Enter");
  const hue = root.getByRole("slider", { name: "Hue", exact: true });
  const warning = root.locator('[data-gp-channel="h"] [data-gamut-warning="linear"]');
  for (const [key, value] of [
    ["End", "360"],
    ["Home", "0"],
  ]) {
    await hue.press(key!);
    await expect(hue).toHaveValue(value!);
    await expect(warning).toBeVisible();
    const track = (await hue.boundingBox())!;
    const triangle = (await warning.boundingBox())!;
    if (key === "End") expect(triangle.x).toBeGreaterThan(track.x + track.width - 40);
    else expect(triangle.x + triangle.width).toBeLessThan(track.x + 40);
  }
});

test("Reference radios support keyboard navigation, inspection and returning to editing", async ({
  page,
}) => {
  await page.goto("/");
  const root = page.locator("[data-gp-root]");
  await root.locator("summary").focus();
  await page.keyboard.press("Enter");
  const srgb = root.getByLabel("Use sRGB as Reference");
  await srgb.focus();
  await page.keyboard.press("ArrowDown");
  await expect(root.getByLabel("Use Display P3 as Reference")).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await expect(root.getByLabel("No Reference")).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await expect(srgb).toBeChecked();
  for (const coordinates of ["srgb", "display-p3", "oklab", "oklch"]) {
    await root.getByLabel("Coordinates", { exact: true }).selectOption(coordinates);
    await expect(srgb).toBeChecked();
    await expect(root.locator('[data-gp-marker="reference"]')).toHaveCount(
      coordinates === "oklch" || coordinates === "oklab" ? 1 : 0,
    );
  }
});
