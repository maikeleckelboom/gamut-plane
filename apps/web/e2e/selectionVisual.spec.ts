import { expect, test, type Page } from "@playwright/test";
import { moveOutsideSrgb } from "./outsideSrgb";

async function ready(page: Page, width: number) {
  await page.goto("/");
  await expect(page.locator("[data-canvas-capability]")).not.toHaveAttribute(
    "data-canvas-capability",
    "pending",
  );
  await page.locator(".instrument-primary").evaluate((element, width) => {
    (element as HTMLElement).style.width = `${width}px`;
  }, width);
  const root = page.locator("[data-gp-root]");
  await moveOutsideSrgb(root);
  return root;
}
for (const width of [320, 390, 440, 480])
  test(`compact geometry controls at allocated ${width}px`, async ({ page }) => {
    const root = await ready(page, width);
    const coordinates = root.getByRole("combobox", { name: "Coordinates" });
    const rootBox = (await root.boundingBox())!;
    await expect(root.getByRole("group", { name: "Interaction mode" })).toHaveCount(0);
    for (const control of [coordinates, root.getByRole("button", { name: "Gamut references" })]) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(rootBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(rootBox.x + rootBox.width);
    }
    const rail = root.locator('[data-gp-channel="h"]');
    const railBox = (await rail.boundingBox())!;
    const trackBox = (await rail.locator('[data-gp-part="channel-track"]').boundingBox())!;
    const cards = root.locator('[data-gp-control="card"]');
    const lightness = (await cards.nth(0).boundingBox())!;
    const chroma = (await cards.nth(1).boundingBox())!;
    await expect(rail).toHaveAttribute("data-gp-control", "rail");
    await expect(cards).toHaveCount(2);
    await expect(root.getByRole("slider")).toHaveCount(1);
    await expect(cards.getByRole("slider")).toHaveCount(0);
    expect(trackBox.width).toBeCloseTo(railBox.width, 0);
    expect(lightness.y).toBe(chroma.y);
    expect(lightness.width).toBeCloseTo(chroma.width, 0);
    expect(lightness.x + lightness.width).toBeLessThan(chroma.x);
    expect(lightness.y).toBeGreaterThanOrEqual(railBox.y + railBox.height);
    await expect(rail.locator('[data-gp-part="reference-warning"]')).toHaveCount(0);
    await expect(rail.getByRole("slider")).toHaveAccessibleDescription(/Outside sRGB/);
    await expect(root.locator('[data-gamut-warning="planar"]')).toBeVisible();
    await expect(rail.locator('[data-gp-part="gamut-interval"]')).not.toHaveCount(0);
    expect(await root.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    if (width === 320) await expect(root).toHaveScreenshot("shell-rail-320.png");
    await coordinates.click();
    await coordinates.press("ArrowDown");
    const instrumentBox = (await root.boundingBox())!;
    const popupBox = (await root.getByRole("listbox").boundingBox())!;
    expect(popupBox.x).toBeGreaterThanOrEqual(0);
    expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    if (width === 320)
      await expect(page).toHaveScreenshot("coordinates-open-320.png", {
        clip: {
          ...instrumentBox,
          width: Math.max(instrumentBox.width, popupBox.x + popupBox.width - instrumentBox.x),
        },
      });
  });
test("enlarged text Coordinates popup", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1100 });
  const root = await ready(page, 320);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  const popup = root.getByRole("listbox");
  expect(await popup.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page).toHaveScreenshot("shell-enlarged-popup.png", { fullPage: true });
});
