import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
async function ready(page: Page, a = 0.1, b = 0.2, width = 440) {
  await page.goto("/e2e/fixtures/selectionShell.html?lab&a=" + a + "&b=" + b);
  const root = page.locator("#instrument [data-gp-root]");
  await page.locator("#instrument").evaluate((el, width) => {
    (el as HTMLElement).style.width = width + "px";
  }, width);
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.getByRole("option", { name: /^OKLab/ }).click();
  await expect(root).toHaveAttribute("data-active-plane", "oklab");
  await expect(root.locator('[data-render-color-space="pending"]')).toHaveCount(0);
  return root;
}
async function definition(page: Page) {
  return JSON.parse((await page.locator("#events").getAttribute("data-definition"))!) as {
    channels: number[];
    alpha: number;
    space: string;
  };
}
test("OKLab cards preserve precise scalar authorship, stepping, siblings, alpha and native nodes", async ({
  page,
}) => {
  const root = await ready(page);
  await expect(root.getByRole("slider")).toHaveCount(1);
  await expect(root.locator('[data-gp-control="card"]')).toHaveCount(2);
  const nodes = await root.locator("input[type=range], input[type=number]").elementHandles();
  for (const coordinate of ["a", "b"] as const) {
    const number = root.getByRole("spinbutton", { name: "OKLab " + coordinate + " numeric value" });
    const index = coordinate === "a" ? 1 : 2,
      other = coordinate === "a" ? 2 : 1;
    const before = await definition(page);
    const min = Number(await number.getAttribute("min")),
      max = Number(await number.getAttribute("max"));
    for (const scalar of [0, 2, -2, 0.05, 0.123456789123]) {
      await number.fill(String(scalar));
      await number.press("Enter");
      const after = await definition(page);
      expect(after.channels[index]).toBe(Math.min(max, Math.max(min, scalar)));
      expect(after.channels[other]).toBe(before.channels[other]);
      expect(after.channels[0]).toBe(before.channels[0]);
      expect(after.alpha).toBe(before.alpha);
    }
    await number.fill("0");
    await number.press("Enter");
    await number.press("ArrowUp");
    expect((await definition(page)).channels[index]).toBeGreaterThan(0);
    expect((await definition(page)).channels[index]).toBeLessThanOrEqual(0.001);
    const edited = (await definition(page)).channels[index]!;
    const sibling = root.getByRole("spinbutton", {
      name: "OKLab " + (coordinate === "a" ? "b" : "a") + " numeric value",
    });
    const extent = Math.sqrt(0.16 - edited ** 2),
      bound = Number(await sibling.getAttribute("max"));
    expect(bound).toBeLessThanOrEqual(extent);
    expect(extent - bound).toBeLessThan(1e-12);
  }
  const beforeL = await definition(page);
  await root.getByRole("slider", { name: "Lightness", exact: true }).press("Home");
  expect((await definition(page)).channels).toEqual([0, ...beforeL.channels.slice(1)]);
  await root.getByRole("button", { name: "Gamut references" }).click();
  await root.getByLabel("sRGB Status", { exact: true }).uncheck();
  await root.getByLabel("sRGB Boundary", { exact: true }).uncheck();
  await root.getByRole("radio", { name: "Display P3", includeHidden: true }).check();
  for (const node of nodes) expect(await node.evaluate((el) => el.isConnected)).toBe(true);
  await page.getByRole("button", { name: "Set observation", exact: true }).click();
  for (const node of nodes) expect(await node.evaluate((el) => el.isConnected)).toBe(false);
});
for (const width of [320, 375, 390, 440, 480])
  test("OKLab rail and peer card layout " + width, async ({ page }) => {
    const root = await ready(page, 0.03, 0.02, width);
    const rail = (await root.locator('[data-gp-control="rail"]').boundingBox())!;
    const cards = await root.locator('[data-gp-control="card"]').all();
    const a = (await cards[0]!.boundingBox())!,
      b = (await cards[1]!.boundingBox())!;
    expect(Math.abs(a.y - b.y)).toBeLessThan(0.5);
    expect(Math.abs(a.width - b.width)).toBeLessThan(0.5);
    expect(Math.abs(a.x - rail.x)).toBeLessThan(0.5);
    expect(Math.abs(b.x + b.width - rail.x - rail.width)).toBeLessThan(0.5);
    expect(a.y).toBeGreaterThan(rail.y + rail.height);
    expect(await root.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    if (width === 320) await expect(root).toHaveScreenshot("oklab-direct-320.png");
  });
for (const [name, a, b] of [
  ["overflow", 0.35, 0.3],
  ["unavailable", 0.1, 0.5],
] as const)
  test("OKLab card recovery " + name, async ({ page }) => {
    const root = await ready(page, a, b);
    await expect(page.locator("#events")).toHaveAttribute("data-updates", "0");
    await expect(
      root.getByRole("slider", { name: "Lightness", exact: true }),
    ).toHaveAccessibleDescription(/outside the OKLab editing disc/);
    const numeric = root.getByRole("spinbutton", { name: "OKLab a numeric value" });
    if (name === "overflow") {
      await expect(root.locator('[data-gp-channel="a"]')).toHaveAttribute(
        "data-gp-overflow",
        "true",
      );
      await expect(numeric).toHaveValue("0.3500");
    } else {
      await expect(numeric).toHaveAttribute("readonly", "");
      await expect(numeric).toHaveValue("0.1000");
      await expect(numeric).toHaveAccessibleDescription(/Direct a editing is unavailable/);
    }
    expect((await new AxeBuilder({ page }).include("#instrument").analyze()).violations).toEqual(
      [],
    );
    await expect(root).toHaveScreenshot("oklab-direct-" + name + ".png");
    if (name === "unavailable") {
      const sibling = root.getByRole("spinbutton", { name: "OKLab b numeric value" });
      await sibling.fill("0");
      await sibling.press("Enter");
      await expect(numeric).not.toHaveAttribute("readonly", "");
      expect((await definition(page)).channels[1]).toBe(0.1);
    }
  });
test("OKLab enlarged text and forced-colors card focus", async ({ page }) => {
  const root = await ready(page, 0.03, 0.02, 320);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(await root.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(root).toHaveScreenshot("oklab-direct-enlarged.png");
  await page.emulateMedia({ forcedColors: "active" });
  const a = root.getByRole("spinbutton", { name: "OKLab a numeric value" });
  await a.focus();
  await a.press("ArrowUp");
  await expect(a).toBeFocused();
  await expect(root.locator('[data-gp-channel="a"]')).toHaveCSS("outline-style", "solid");
  await expect(a).toHaveCSS("outline-style", "none");
  await expect(root).toHaveScreenshot("oklab-direct-forced-colors.png");
});
test("plane edge edits expose authored values in both cards without clamping their readouts", async ({
  page,
}) => {
  const root = await ready(page),
    plane = root.locator('[data-gp-part="surface"]'),
    box = (await plane.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    await page.mouse.move(
      box.x + box.width * (0.5 + Math.cos(angle) * 0.55),
      box.y + box.height * (0.5 + Math.sin(angle) * 0.55),
      { steps: 3 },
    );
    for (const coordinate of ["a", "b"] as const)
      await expect
        .poll(async () => {
          const value = (await definition(page)).channels[coordinate === "a" ? 1 : 2]!;
          return (
            (await root
              .getByRole("spinbutton", { name: "OKLab " + coordinate + " numeric value" })
              .inputValue()) === value.toFixed(4)
          );
        })
        .toBe(true);
  }
  await page.mouse.up();
});
