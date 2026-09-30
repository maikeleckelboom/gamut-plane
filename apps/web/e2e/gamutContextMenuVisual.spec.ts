import { expect, test, type Locator, type Page } from "@playwright/test";

async function fixture(page: Page, query = "", width = 440) {
  await page.goto(`/e2e/fixtures/selectionShell.html${query}`);
  const root = page.locator("#instrument [data-gp-root]");
  await expect(root.locator('[data-render-color-space="pending"]')).toHaveCount(0);
  await page.locator("#instrument").evaluate((element, width) => {
    (element as HTMLElement).style.width = `${width}px`;
  }, width);
  return root;
}
async function open(root: Locator) {
  await root
    .locator('[data-gp-part="surface"]')
    .click({ button: "right", position: { x: 30, y: 40 } });
  await expect(root.getByRole("menu", { name: "Gamut actions" })).toBeVisible();
}
async function instrumentAndMenu(page: Page, root: Locator, name: string) {
  const instrument = (await root.boundingBox())!;
  const popup = (await root.getByRole("menu").boundingBox())!;
  const [scrollX, scrollY] = await page.evaluate(() => [window.scrollX, window.scrollY]);
  const x = Math.min(instrument.x, popup.x) + scrollX!;
  const y = Math.min(instrument.y, popup.y) + scrollY!;
  await expect(page).toHaveScreenshot(name, {
    fullPage: true,
    clip: {
      x,
      y,
      width: Math.max(instrument.x + instrument.width, popup.x + popup.width) + scrollX! - x,
      height: Math.max(instrument.y + instrument.height, popup.y + popup.height) + scrollY! - y,
    },
  });
}

test("plane context menu at 320px with exact Outside/Inside", async ({ page }) => {
  const root = await fixture(page, "", 320);
  await open(root);
  await instrumentAndMenu(page, root, "gamut-menu-320.png");
});

test("read-only plane context menu", async ({ page }) => {
  const root = await fixture(page, "?readonly");
  await open(root);
  await instrumentAndMenu(page, root, "gamut-menu-read-only.png");
});

test("enlarged plane context menu with longest exact status", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const root = await fixture(page, "?tolerance", 320);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await root.locator('[data-gp-part="surface"]').press("Shift+F10");
  await expect(root.getByRole("menu")).toHaveScreenshot("gamut-menu-enlarged.png");
});

test("forced-colors plane context menu and keyboard focus", async ({ page }) => {
  const root = await fixture(page);
  await page.emulateMedia({ forcedColors: "active" });
  await root.locator('[data-gp-part="surface"]').press("ContextMenu");
  await expect(root.getByRole("menu")).toHaveScreenshot("gamut-menu-forced-colors.png");
});
