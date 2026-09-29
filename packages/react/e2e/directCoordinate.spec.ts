import { expect, test } from "./browserFixture";
import type { Page } from "@playwright/test";
async function ready(page: Page) {
  await page.goto("/");
  const root = page.locator("[data-gp-root]");
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.getByRole("option", { name: /^OKLab/ }).click();
  await expect(root).toHaveAttribute("data-active-plane", "oklab");
  await root.getByRole("spinbutton", { name: "OKLab a numeric value" }).fill("0.1");
  await root.getByRole("spinbutton", { name: "OKLab a numeric value" }).press("Enter");
  return root;
}
async function definition(page: Page) {
  return JSON.parse((await page.locator("[data-definition]").getAttribute("data-definition"))!) as {
    channels: number[];
    alpha: number;
    space: string;
  };
}
test("direct L/a/b keyboard, numeric and pointer edits retain coordinates and nodes", async ({
  page,
}) => {
  const root = await ready(page);
  await expect(root.locator('[data-gp-part="channel-symbol"]')).toHaveText(["L", "a", "b"]);
  await expect(root.locator('[data-gp-part="coordinate-readout"]')).toHaveCount(0);
  await expect(root.locator('[data-gp-part="axis"]')).toHaveCount(2);
  const nodes = await root.locator("input[type=range], input[type=number]").elementHandles();
  for (const coordinate of ["a", "b"] as const) {
    const range = root.getByRole("slider", { name: `OKLab ${coordinate}`, exact: true });
    const number = root.getByRole("spinbutton", { name: `OKLab ${coordinate} numeric value` });
    const index = coordinate === "a" ? 1 : 2;
    const other = coordinate === "a" ? 2 : 1;
    const before = await definition(page);
    const min = Number(await range.getAttribute("min")),
      max = Number(await range.getAttribute("max"));
    expect([await number.getAttribute("min"), await number.getAttribute("max")]).toEqual([
      String(min),
      String(max),
    ]);
    for (const [key, expected] of [
      ["Home", min],
      ["End", max],
      ["ArrowLeft", max - 0.001],
      ["ArrowRight", max],
    ] as const) {
      await range.press(key);
      expect((await definition(page)).channels[index]).toBeCloseTo(expected, 13);
      expect((await definition(page)).channels[other]).toBe(before.channels[other]);
    }
    for (const scalar of [0, 2, -2, 0.05]) {
      await number.fill(String(scalar));
      await number.press("Enter");
      expect((await definition(page)).channels[index]).toBe(Math.min(max, Math.max(min, scalar)));
      expect((await definition(page)).channels[other]).toBe(before.channels[other]);
    }
    const box = (await range.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.mouse.down();
    for (const fraction of [0.3, 0.7, 0.4]) {
      const x = box.x + 5 + (box.width - 10) * fraction;
      await page.mouse.move(x, box.y + box.height / 2, { steps: 4 });
      await expect
        .poll(async () => (await definition(page)).channels[index])
        .toBeCloseTo(min + fraction * (max - min), 2);
      const native = Number(await range.inputValue());
      expect(Math.abs((native - min) / (max - min) - fraction)).toBeLessThan(0.01);
      expect((await definition(page)).channels[other]).toBe(before.channels[other]);
      expect((await definition(page)).channels[0]).toBe(before.channels[0]);
      expect((await definition(page)).alpha).toBe(before.alpha);
      expect([await range.getAttribute("min"), await range.getAttribute("max")]).toEqual([
        String(min),
        String(max),
      ]);
    }
    await page.mouse.up();
    const sibling = root.getByRole("slider", {
      name: `OKLab ${coordinate === "a" ? "b" : "a"}`,
      exact: true,
    });
    const edited = (await definition(page)).channels[index]!;
    const extent = Math.sqrt(0.16 - edited ** 2);
    const bound = Number(await sibling.getAttribute("max"));
    expect(bound).toBeLessThanOrEqual(extent);
    expect(extent - bound).toBeLessThan(1e-12);
  }
  const beforeL = await definition(page);
  await root.getByRole("slider", { name: "Lightness", exact: true }).press("Home");
  expect((await definition(page)).channels).toEqual([0, ...beforeL.channels.slice(1)]);
  await root.locator("summary").click();
  await root.getByLabel("sRGB Status", { exact: true }).uncheck();
  await root.getByLabel("sRGB Boundary", { exact: true }).uncheck();
  await root.getByLabel("Use Display P3 as Reference").check();
  for (const node of nodes)
    expect(await node.evaluate((element) => element.isConnected)).toBe(true);
  await root.getByRole("radio", { name: "Inspect", exact: true }).check();
  for (const node of nodes)
    expect(await node.evaluate((element) => element.isConnected)).toBe(false);
});

test("plane edge edits keep both native thumbs visible and clamped to accepted dynamic bounds", async ({
  page,
}) => {
  const root = await ready(page);
  const plane = root.locator('[data-gp-part="surface"]');
  const box = (await plane.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let index = 0; index < 24; index++) {
    const angle = (index / 24) * Math.PI * 2;
    await page.mouse.move(
      box.x + box.width * (0.5 + Math.cos(angle) * 0.55),
      box.y + box.height * (0.5 + Math.sin(angle) * 0.55),
      { steps: 3 },
    );
    for (const coordinate of ["a", "b"] as const) {
      const range = root.getByRole("slider", { name: `OKLab ${coordinate}`, exact: true });
      await expect
        .poll(async () => {
          const value = (await definition(page)).channels[coordinate === "a" ? 1 : 2]!;
          const min = Number(await range.getAttribute("min")),
            max = Number(await range.getAttribute("max"));
          return Math.abs(Number(await range.inputValue()) - Math.min(max, Math.max(min, value)));
        })
        .toBeLessThan(1e-12);
      expect(
        await range.evaluate(
          (element) => getComputedStyle(element, "::-webkit-slider-thumb").visibility,
        ),
      ).toBe("visible");
    }
  }
  await page.mouse.up();
});
