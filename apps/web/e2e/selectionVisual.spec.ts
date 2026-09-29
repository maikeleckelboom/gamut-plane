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
    const selectorBox = (await coordinates.boundingBox())!;
    const modeBox = (await mode.boundingBox())!;
    if (width === 320) expect(modeBox.y).toBeGreaterThan(selectorBox.y + selectorBox.height);
    if (width >= 440) expect(Math.abs(modeBox.y - selectorBox.y)).toBeLessThan(1);
    for (const channel of ["h", "l", "c"]) {
      const row = root.locator(`[data-gp-channel="${channel}"]`);
      const symbol = (await row.locator('[data-gp-part="channel-symbol"]').boundingBox())!;
      const track = (await row.locator('[data-gp-part="channel-track"]').boundingBox())!;
      const label = (await row.locator("label").boundingBox())!;
      expect(symbol.width).toBe(32);
      expect(symbol.height).toBe(track.height);
      expect(Math.abs(symbol.x + symbol.width - track.x)).toBeLessThan(0.5);
      expect(Math.abs(label.x - track.x)).toBeLessThan(0.5);
      await expect(row.locator('[data-gp-part="reference-warning"]')).toBeVisible();
      await expect(row.locator('[data-gp-part="gamut-interval"]')).not.toHaveCount(0);
    }
    expect(await root.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(root).toHaveScreenshot(`shell-rail-${width}.png`);
    await coordinates.click();
    await coordinates.press("ArrowDown");
    const instrumentBox = (await root.boundingBox())!;
    const popupBox = (await root.getByRole("listbox").boundingBox())!;
    await expect(page).toHaveScreenshot(`coordinates-open-${width}.png`, {
      clip: {
        ...instrumentBox,
        width: Math.max(instrumentBox.width, popupBox.x + popupBox.width - instrumentBox.x),
      },
    });
  });
test("inspection, Hue native endpoints and numeric-only coordinates", async ({ page }) => {
  const root = await ready(page, 440);
  const hue = root.getByRole("slider", { name: "Hue", exact: true });
  await hue.focus();
  await hue.press("Home");
  await expect(hue).toHaveValue("0");
  await expect(root).toHaveScreenshot("rail-hue-zero.png");
  await hue.press("End");
  await expect(hue).toHaveValue("360");
  await expect(root).toHaveScreenshot("rail-hue-360.png");
  await root.getByRole("radio", { name: "Inspect", exact: true }).check();
  await expect(root).toHaveScreenshot("shell-inspect-oklch.png");
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.getByRole("option", { name: /^Display P3/ }).click();
  await expect(root.getByRole("group", { name: "Interaction mode" })).toHaveCount(0);
  await expect(root).toHaveScreenshot("shell-inspect-display-p3.png");
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.getByRole("option", { name: "OKLab", exact: true }).click();
  await expect(root.locator('[data-gp-part="channel-symbol"]')).toHaveCount(1);
  await expect(root.locator('[data-gp-part="channel-symbol"]')).toHaveText("L");
  await expect(root.getByLabel("OKLab a numeric value")).toBeVisible();
  await expect(root.getByLabel("OKLab b numeric value")).toBeVisible();
});
test("enlarged text popup and conditional test-only Area", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1100 });
  const root = await ready(page, 320);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  const popup = root.getByRole("listbox");
  expect(await popup.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(page).toHaveScreenshot("shell-enlarged-popup.png", { fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/e2e/fixtures/selectionShell.html");
  const area = page.locator("#area-fixture");
  await expect(area.getByRole("combobox", { name: "Area" })).toBeVisible();
  await expect(area).toHaveScreenshot("shell-future-area.png");
  await area.getByRole("combobox", { name: "Area" }).click();
  await expect(area.getByRole("option", { selected: true })).toHaveText(/Hue \/ Chroma/);
  // Include the top-layer popup below the compact fixture.
  await expect(page).toHaveScreenshot("shell-future-area-open.png", { fullPage: true });
});
