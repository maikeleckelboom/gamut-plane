import { expect, test, type Locator, type Page } from "@playwright/test";

async function app(page: Page, width = 440) {
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
async function fixture(page: Page, query: string) {
  await page.goto(`/e2e/fixtures/selectionShell.html${query}`);
  const root = page.locator("#instrument [data-gp-root]");
  await expect(root.locator('[data-gp-part="gamut-trigger"]')).toBeVisible();
  await expect(root.locator('[data-render-color-space="pending"]')).toHaveCount(0);
  return root;
}
function gamuts(root: Locator) {
  return {
    trigger: root.getByRole("button", { name: "Gamuts" }),
    dialog: root.getByRole("dialog", { name: "Gamuts" }),
  };
}
/** The complete instrument plus the anchored surface, which may extend beyond it. */
async function expectOpen(page: Page, root: Locator, name: string) {
  const { trigger, dialog } = gamuts(root);
  if ((await trigger.getAttribute("aria-expanded")) !== "true") await trigger.click();
  await expect(dialog).toBeVisible();
  const instrument = (await root.boundingBox())!;
  const surface = (await dialog.boundingBox())!;
  // Boxes are viewport-relative; a full-page clip is document-relative.
  const [scrollX, scrollY] = await page.evaluate(() => [window.scrollX, window.scrollY]);
  const x = Math.min(instrument.x, surface.x) + scrollX!;
  const y = Math.min(instrument.y, surface.y) + scrollY!;
  await expect(page).toHaveScreenshot(name, {
    fullPage: true,
    clip: {
      x,
      y,
      width: Math.max(instrument.x + instrument.width, surface.x + surface.width) + scrollX! - x,
      height: Math.max(instrument.y + instrument.height, surface.y + surface.height) + scrollY! - y,
    },
  });
}

for (const width of [320, 440])
  test(`open default Gamuts at allocated ${width}px`, async ({ page }) => {
    const root = await app(page, width);
    await expectOpen(page, root, `gamuts-open-${width}.png`);
  });

test("open Gamuts within tolerance", async ({ page }) => {
  const root = await app(page);
  for (const [label, value] of [
    ["Hue", "194.76895989787468"],
    ["Lightness", "0.5415923764146119"],
    ["Chroma", "0.09244884602706227"],
  ]) {
    await root.getByLabel(`${label} numeric value`).fill(value!);
    await root.getByLabel(`${label} numeric value`).press("Enter");
  }
  await expectOpen(page, root, "gamuts-within-tolerance.png");
});

test("open Gamuts with requested boundaries paused during inspection", async ({ page }) => {
  const root = await app(page);
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.locator('[role="option"][data-value="srgb"]').click();
  await expectOpen(page, root, "gamuts-inspect-paused.png");
});

test("open Gamuts with read-only native controls", async ({ page }) => {
  await expectOpen(page, await fixture(page, "?readonly"), "gamuts-read-only.png");
});

test("open Gamuts with enlarged text", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1100 });
  const root = await app(page, 320);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expectOpen(page, root, "gamuts-enlarged.png");
});

test("open Gamuts in forced colors with keyboard focus", async ({ page }) => {
  const root = await app(page);
  const { trigger, dialog } = gamuts(root);
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("checkbox", { name: "sRGB Status" })).toBeFocused();
  await page.emulateMedia({ forcedColors: "active" });
  await expectOpen(page, root, "gamuts-forced-colors.png");
});
