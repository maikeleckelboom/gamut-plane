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
    // One row per channel: [symbol or name] [track] [value]; rows share their columns.
    const columns: { rail: number; track: number; value: number }[] = [];
    for (const channel of ["h", "l", "c"]) {
      const row = root.locator(`[data-gp-channel="${channel}"]`);
      const symbol = (await row.locator('[data-gp-part="channel-symbol"]').boundingBox()) ?? null;
      const label = (await row.locator("label").boundingBox())!;
      const track = (await row.locator('[data-gp-part="channel-track"]').boundingBox())!;
      const input = (await row.locator('[data-gp-part="numeric-input"]').boundingBox())!;
      // Compact shows the symbol; wide shows the channel name instead.
      const rail = symbol ?? label;
      expect(rail.width).toBeGreaterThan(0);
      if (symbol) expect(symbol.height).toBe(track.height);
      expect(rail.x + rail.width).toBeLessThanOrEqual(track.x);
      expect(track.x + track.width).toBeLessThanOrEqual(input.x);
      columns.push({ rail: rail.x + rail.width, track: track.x, value: input.x + input.width });
      await expect(row.locator('[data-gp-part="reference-warning"]')).toBeVisible();
      await expect(row.locator('[data-gp-part="gamut-interval"]')).not.toHaveCount(0);
    }
    for (const key of ["rail", "track", "value"] as const)
      expect(new Set(columns.map((column) => Math.round(column[key]))).size).toBe(1);
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
