import { expect, test } from "@playwright/test";

test("every admitted editor arranges one fixed rail and two labelled numeric cards without reauthoring", async ({
  page,
}) => {
  await page.goto("/e2e/fixtures/selectionShell.html?alpha");
  const root = page.locator("#instrument [data-gp-root]");
  const original = await page.locator("#events").getAttribute("data-definition");
  for (const [representation, area, channels] of [
    ["oklch", null, ["h", "l", "c"]],
    ["oklab", null, ["l", "a", "b"]],
    ["srgb", "rg", ["b", "r", "g"]],
    ["srgb", "rb", ["g", "r", "b"]],
    ["srgb", "gb", ["r", "g", "b"]],
    ["display-p3", "rg", ["b", "r", "g"]],
    ["display-p3", "rb", ["g", "r", "b"]],
    ["display-p3", "gb", ["r", "g", "b"]],
  ] as const) {
    await root.getByRole("combobox", { name: "Coordinates" }).click();
    await root.locator('[role="option"][data-value="' + representation + '"]').click();
    if (area) {
      await root.getByRole("combobox", { name: "Area" }).click();
      await root
        .locator('[role="option"][data-value="' + representation + "-" + area + '"]')
        .click();
    }
    await expect(root.locator('[data-gp-part="channel"]')).toHaveCount(3);
    expect(
      await root
        .locator('[data-gp-part="channel"]')
        .evaluateAll((nodes) =>
          nodes.map((node) => [
            node.getAttribute("data-gp-channel"),
            node.getAttribute("data-gp-control"),
          ]),
        ),
    ).toEqual(channels.map((channel, index) => [channel, index === 0 ? "rail" : "card"]));
    await expect(root.getByRole("slider")).toHaveCount(1);
    await expect(root.getByRole("spinbutton")).toHaveCount(3);
    await expect(root.getByRole("group", { name: "Interaction mode" })).toHaveCount(0);
    const card = root.locator('[data-gp-control="card"]').first();
    await card.locator("label").click();
    await expect(card.getByRole("spinbutton")).toBeFocused();
    await expect(page.locator("#events")).toHaveAttribute("data-definition", original!);
  }
});

for (const width of [320, 375, 390, 480])
  test(
    "OKLCH continuous rail and paired numeric cards at " + width + "px host",
    async ({ page }) => {
      await page.goto("/");
      await page.locator(".instrument-primary").evaluate((element, width) => {
        (element as HTMLElement).style.width = width + "px";
      }, width);
      const root = page.locator("[data-gp-root]");
      await expect(root).toHaveAttribute("data-active-plane", "oklch");
      const rail = (await root.locator('[data-gp-control="rail"]').boundingBox())!,
        left = (await root.locator('[data-gp-channel="l"]').boundingBox())!,
        right = (await root.locator('[data-gp-channel="c"]').boundingBox())!;
      expect(Math.abs(rail.x - left.x)).toBeLessThan(0.5);
      expect(Math.abs(rail.x + rail.width - right.x - right.width)).toBeLessThan(0.5);
      expect(Math.abs(left.y - right.y)).toBeLessThan(0.5);
      expect(Math.abs(left.width - right.width)).toBeLessThan(0.5);
      expect(left.y).toBeGreaterThan(rail.y + rail.height);
      expect(await root.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      const value = root.getByRole("spinbutton", { name: "Lightness numeric value" });
      await value.fill("0.123456789123");
      await value.press("Escape");
      await expect(value).toHaveValue("0.6800");
    },
  );

test("missing Hue remains unset until explicitly authored, including cancellation and card recovery", async ({
  page,
}) => {
  await page.goto("/e2e/fixtures/selectionShell.html?missinghue");
  const root = page.locator("#instrument [data-gp-root]"),
    events = page.locator("#events");
  const hue = root.getByRole("spinbutton", { name: "Hue numeric value" }),
    chroma = root.getByRole("spinbutton", { name: "Chroma numeric value" });
  await expect(hue).toHaveValue("");
  await expect(hue).toHaveAttribute("placeholder", "unset");
  await hue.press("Enter");
  await expect(events).toHaveAttribute("data-updates", "0");
  await hue.fill("252");
  await hue.press("Escape");
  await expect(hue).toHaveValue("");
  await expect(events).toHaveAttribute("data-cancels", "1");
  await chroma.fill("0.15");
  await chroma.press("Enter");
  await expect(chroma).toHaveValue("0.0000");
  expect(JSON.parse((await events.getAttribute("data-definition"))!).channels[2]).toBeNull();
  await hue.fill("0");
  await hue.press("Enter");
  await chroma.fill("0.15");
  await chroma.press("Tab");
  expect(JSON.parse((await events.getAttribute("data-definition"))!)).toMatchObject({
    space: "oklch",
    channels: [0.68, 0.15, 0],
    alpha: 0.37,
  });
});
