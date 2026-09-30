import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("native RGB Area, pointer, keyboard and extended numeric recovery at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/e2e/fixtures/selectionShell.html?alpha");
  const root = page.locator("#instrument [data-gp-root]");
  const events = page.locator("#events");
  const initial = await events.getAttribute("data-definition");
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.locator('[role="option"][data-value="display-p3"]').click();
  const area = root.getByRole("combobox", { name: "Area" });
  await expect(area).toContainText("R / G");
  await area.click();
  const rb = root.locator('[role="option"][data-value="display-p3-rb"]');
  await expect(rb).toHaveAccessibleName(
    /R \/ B · fixed G.*Horizontal Red and vertical Blue with fixed Green/,
  );
  await area.press("ArrowDown");
  await expect(rb).toHaveAttribute("data-highlighted", "");
  await area.press("Enter");
  await expect(area).toBeFocused();
  await expect(area).toContainText("R / B");
  await expect(area).toHaveAccessibleDescription(
    "Horizontal Red and vertical Blue with fixed Green.",
  );
  await expect(events).toHaveAttribute("data-definition", initial!);
  expect(
    await root
      .locator('input[type="number"]')
      .evaluateAll((inputs) => inputs.map((input) => input.getAttribute("aria-label"))),
  ).toEqual(["Red numeric value", "Green numeric value", "Blue numeric value"]);

  const plane = root.getByRole("application", { name: /Display P3 plane/ });
  const box = (await plane.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.75);
  await expect(events).not.toHaveAttribute("data-definition", initial!);
  const pointer = JSON.parse((await events.getAttribute("data-definition"))!);
  expect(pointer.space).toBe("display-p3");
  expect(pointer.alpha).toBe(0.37);
  expect(pointer.channels[0]).toBeCloseTo(0.25, 2);
  expect(pointer.channels[2]).toBeCloseTo(0.25, 2);
  await plane.press("ArrowRight");
  const keyboard = JSON.parse((await events.getAttribute("data-definition"))!);
  expect(keyboard.channels[0]).toBeGreaterThan(pointer.channels[0]);
  expect(keyboard.channels.slice(1)).toEqual(pointer.channels.slice(1));

  const red = root.getByLabel("Red numeric value");
  await red.fill("1.2");
  await red.press("Enter");
  await expect(red).toHaveValue("1.2000");
  expect(
    await root
      .locator("[data-active-marker]")
      .evaluate((element) => (element as HTMLElement).style.left),
  ).toBe("120%");
  await expect(plane).toHaveAccessibleName(/outside the area.*marker may be clipped/);
  await red.fill("1e308");
  await red.press("Enter");
  expect(JSON.parse((await events.getAttribute("data-definition"))!).channels[0]).toBe(1e308);
  expect(
    await root.locator("[data-active-marker]").evaluate((element) => {
      const marker = element as HTMLElement;
      return Number.parseFloat(marker.style.left) > 120;
    }),
  ).toBe(true);
  await root.getByLabel("Green numeric value").fill("-0.1");
  await root.getByLabel("Green numeric value").press("Enter");
  await expect(root.locator("canvas")).toHaveCount(1);
  await expect(root.getByLabel("Blue numeric value")).toBeEnabled();
  await red.fill("0.3");
  await red.press("Enter");
  const recovered = JSON.parse((await events.getAttribute("data-definition"))!);
  expect(recovered).toMatchObject({ space: "display-p3", alpha: 0.37 });
  expect(recovered.channels).toEqual([0.3, -0.1, keyboard.channels[2]]);
  const accepted = await events.getAttribute("data-definition");
  await root.getByRole("radio", { name: "Inspect", exact: true }).check();
  await root.getByRole("radio", { name: "Edit", exact: true }).check();
  await expect(area).toContainText("R / G");
  await expect(events).toHaveAttribute("data-definition", accepted!);

  for (const size of ["100%", "200%"] as const) {
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = size;
    }, size);
    await area.click();
    await expect(root.getByRole("listbox", { name: "Area" })).toBeVisible();
    expect(await root.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await area.press("Escape");
    await expect(area).toBeFocused();
  }
  const axe = await new AxeBuilder({ page }).include("#instrument").analyze();
  expect(
    axe.violations.filter((item) => item.impact === "serious" || item.impact === "critical"),
  ).toEqual([]);
});
