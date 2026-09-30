import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page, width: number) {
  await page.goto("/");
  await expect(page.locator("[data-canvas-capability]")).not.toHaveAttribute(
    "data-canvas-capability",
    "pending",
  );
  await page.locator(".instrument-primary").evaluate((element, width) => {
    (element as HTMLElement).style.width = `${width}px`;
  }, width);
  return page.locator("[data-gp-root]");
}
for (const width of [320, 390, 440, 480])
  test(`shell and technical rail at allocated ${width}px`, async ({ page }) => {
    const root = await ready(page, width);
    const coordinates = root.getByRole("combobox", { name: "Coordinates" });
    const mode = root.getByRole("group", { name: "Interaction mode" });
    const rootBox = (await root.boundingBox())!;
    for (const control of [coordinates, mode]) {
      const box = (await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(rootBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(rootBox.x + rootBox.width);
    }
    const railWidths: number[] = [];
    for (const channel of ["h", "l", "c"]) {
      const row = root.locator(`[data-gp-channel="${channel}"]`);
      const symbol = (await row.locator('[data-gp-part="channel-symbol"]').boundingBox())!;
      const track = (await row.locator('[data-gp-part="channel-track"]').boundingBox())!;
      const label = (await row.locator("label").boundingBox())!;
      expect(symbol.width).toBeGreaterThan(0);
      railWidths.push(symbol.width);
      expect(symbol.height).toBe(track.height);
      expect(Math.abs(symbol.x + symbol.width - track.x)).toBeLessThan(0.5);
      expect(Math.abs(label.x - track.x)).toBeLessThan(0.5);
      await expect(row.locator('[data-gp-part="reference-warning"]')).toBeVisible();
      await expect(row.locator('[data-gp-part="gamut-interval"]')).not.toHaveCount(0);
    }
    expect(new Set(railWidths).size).toBe(1);
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
