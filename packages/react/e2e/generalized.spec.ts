import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./browserFixture";
test("installed instrument groups Coordinates, suppresses native self-boundaries and frames only the selected Reference", async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type())) warnings.push(message.text());
  });
  page.on("pageerror", (error) => warnings.push(error.message));
  await page.goto("/");
  const root = page.locator("[data-gp-root]");
  const selector = root.getByRole("combobox", { name: "Coordinates" });
  await selector.press("Enter");
  const list = root.getByRole("listbox", { name: "Coordinates" });
  await expect(list.getByRole("group", { name: "Perceptual" }).getByRole("option")).toHaveCount(2);
  await expect(list.getByRole("group", { name: "RGB" }).getByRole("option")).toHaveCount(2);
  await selector.press("ArrowDown");
  await selector.press("Enter");
  await expect(selector).toContainText("OKLab");
  const lightness = root.getByLabel("Lightness numeric value");
  await lightness.fill("0.08");
  await lightness.press("Enter");
  const gamuts = root.getByRole("button", { name: "Gamut references", exact: true });
  await gamuts.click();
  await root.getByRole("checkbox", { name: "sRGB Boundary", exact: true }).check();
  await root.getByRole("radio", { name: "sRGB", exact: true }).check();
  await gamuts.press("Escape");
  const definition = await page.locator("[data-definition]").getAttribute("data-definition");
  const state = await page
    .locator("[data-generalized-state]")
    .getAttribute("data-generalized-state");
  const framing = root.getByRole("button", { name: "Field framing options", exact: true });
  await framing.click();
  const popup = root.getByRole("dialog", { name: "Field framing", exact: true });
  await popup.getByRole("button", { name: "Fit to Reference Boundary", exact: true }).click();
  await expect(root.locator("[data-gp-viewport-zoom]")).toHaveAttribute(
    "data-gp-viewport-zoom",
    "8",
  );
  await expect(framing).toBeFocused();
  await expect(page.locator("[data-definition]")).toHaveAttribute("data-definition", definition!);
  await expect(page.locator("[data-generalized-state]")).toHaveAttribute(
    "data-generalized-state",
    state!,
  );
  await selector.click();
  await selector.press("s");
  await selector.press("Enter");
  await expect(root.locator('[data-gamut-boundary="srgb"]')).toHaveCount(0);
  await gamuts.click();
  await expect(root.getByRole("checkbox", { name: "sRGB Boundary", exact: true })).toBeChecked();
  await expect(
    root.getByRole("checkbox", { name: "sRGB Boundary", exact: true }),
  ).toHaveAccessibleDescription("");
  await gamuts.press("Escape");
  await framing.click();
  await expect(
    popup.getByRole("button", { name: "Fit to Reference Boundary", exact: true }),
  ).toHaveAccessibleDescription(/native Area domain/);
  await framing.press("Escape");
  await expect(page.locator("[data-definition]")).toHaveAttribute("data-definition", definition!);
  expect(warnings).toEqual([]);
});

test("packed React popup dismissal and replacement preserve focus without Chromium warnings", async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });
  await page.goto("/");
  const root = page.locator("[data-gp-root]");
  const definition = await page.locator("[data-definition]").getAttribute("data-definition");
  const triggers = [
    root.getByRole("combobox", { name: "Coordinates" }),
    root.getByRole("button", { name: "Gamut references", exact: true }),
    root.getByRole("application"),
  ];
  for (const trigger of triggers.slice(0, 2)) {
    await trigger.click();
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
  }
  for (let from = 0; from < triggers.length; from++) {
    for (let to = 0; to < triggers.length; to++) {
      if (from === to) continue;
      for (const index of [from, to]) {
        const trigger = triggers[index]!;
        const box = (await trigger.boundingBox())!;
        // Transient disclosures can cover the field centre. Its far upper corner stays exposed
        // across these compact popups, so replacement still uses an actual pointer event.
        await trigger.click(
          index === 2 ? { button: "right", position: { x: box.width - 8, y: 8 } } : {},
        );
      }
      if (from < 2) await expect(triggers[from]!).toHaveAttribute("aria-expanded", "false");
      await expect(root.locator(":popover-open")).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(root.locator(":popover-open")).toHaveCount(0);
      await expect(triggers[to]!).toBeFocused();
    }
  }
  await expect(page.locator("[data-definition]")).toHaveAttribute("data-definition", definition!);
  expect(warnings).toEqual([]);
});

test("packed React plane context menu reuses accepted gamut actions without authoring", async ({
  page,
}) => {
  await page.goto("/");
  const root = page.locator("[data-gp-root]");
  const plane = root.getByRole("application");
  const popup = root.getByRole("menu", { name: "Gamut actions" });
  const definition = await page.locator("[data-definition]").getAttribute("data-definition");
  await plane.click({ button: "right", position: { x: 30, y: 40 } });
  await expect(popup).toBeVisible();
  await popup.getByRole("menuitemradio", { name: "sRGB", exact: true }).click();
  await expect(popup).toBeHidden();
  await expect(plane).toBeFocused();
  await plane.press("Shift+F10");
  await expect(popup.getByRole("menuitemradio", { name: "sRGB", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(
    popup
      .getByRole("group", { name: "Status" })
      .getByRole("menuitemcheckbox", { name: "sRGB", exact: true }),
  ).toHaveAccessibleDescription("Status off");
  await popup
    .getByRole("group", { name: "Boundary" })
    .getByRole("menuitemcheckbox", { name: "sRGB", exact: true })
    .click();
  await expect(root.locator('[data-gamut-boundary="srgb"]')).toHaveCount(1);
  await plane.press("ContextMenu");
  await popup
    .getByRole("group", { name: "Status" })
    .getByRole("menuitemcheckbox", { name: "sRGB", exact: true })
    .click();
  await root.getByRole("button", { name: "Gamut references" }).click();
  await expect(root.getByRole("checkbox", { name: "sRGB Status" })).toBeChecked();
  await expect(root.getByRole("checkbox", { name: "sRGB Boundary" })).toBeChecked();
  await expect(page.locator("[data-definition]")).toHaveAttribute("data-definition", definition!);
  expect((await new AxeBuilder({ page }).include("[data-gp-root]").analyze()).violations).toEqual(
    [],
  );
});

test("packed React host imports and authors a generalized edit", async ({ page }) => {
  await page.goto("/");
  const root = page.locator("[data-gp-root]");
  const definition = page.locator("[data-definition]");
  const initial = await definition.getAttribute("data-definition");
  await expect(root).toHaveAttribute("data-active-plane", "oklch");
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.locator('[role="option"][data-value="srgb"]').click();
  await expect(root.locator("canvas")).toHaveCount(1);
  await expect(root.locator('[data-gp-control="card"]')).toHaveCount(2);
  await expect(definition).toHaveAttribute("data-definition", initial!);
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.locator('[role="option"][data-value="display-p3"]').click();
  await root.getByRole("combobox", { name: "Area" }).click();
  await root.locator('[role="option"][data-value="display-p3-rb"]').click();
  await root.getByLabel("Green numeric value").fill("-0.125");
  await root.getByLabel("Green numeric value").press("Enter");
  await expect(definition).not.toHaveAttribute("data-definition", initial!);
  await expect(root.getByLabel("Green numeric value")).toHaveValue("-0.1250");
  const authored = JSON.parse((await definition.getAttribute("data-definition"))!);
  expect(authored).toMatchObject({ space: "display-p3", alpha: 0.37 });
  expect(authored.channels[1]).toBe(-0.125);
});

test("packed React anatomy matches the shared visual owner in editable and observation states", async ({
  page,
}) => {
  await page.goto("/");
  const root = page.locator("[data-gp-root]");
  await root.getByRole("button", { name: "Gamut references" }).click();
  await root.getByLabel("sRGB Status", { exact: true }).check();
  await root.getByLabel("sRGB Boundary", { exact: true }).check();
  await root.getByRole("button", { name: "Gamut references" }).press("Escape");
  await expect(root.locator('[data-gp-control="card"]')).toHaveCount(2);
  await expect(root.getByRole("slider")).toHaveCount(1);
  expect(await root.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(root).toHaveScreenshot("generalized-editable-440.png");
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.locator('[role="option"][data-value="srgb"]').click();
  await page.getByRole("button", { name: "Set observation", exact: true }).click();
  await expect(root.locator("canvas")).toHaveCount(0);
  await expect(root).toHaveScreenshot("generalized-observation-440.png");
  const axe = await new AxeBuilder({ page }).include("[data-gp-root]").analyze();
  expect(
    axe.violations.filter((item) => item.impact === "serious" || item.impact === "critical"),
  ).toEqual([]);
});

test("packed native RGB guides resolve partial and empty slices", async ({ page }) => {
  await page.goto("/");
  const root = page.locator("[data-gp-root]");
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.locator('[role="option"][data-value="display-p3"]').click();
  for (const [name, value] of [
    ["Red", "0.9"],
    ["Green", "0.2"],
    ["Blue", "0.4"],
  ]) {
    const input = root.getByLabel(`${name} numeric value`);
    await input.fill(value!);
    await input.press("Enter");
  }
  await root.getByRole("button", { name: "Gamut references" }).click();
  await root.getByRole("checkbox", { name: "sRGB Boundary" }).check();
  await expect(root.locator('[data-gamut-boundary="srgb"]')).toHaveAttribute("d", /^M.+ Z$/);
  await expect(root.locator('[data-gp-channel="b"] [data-gamut-range="srgb"]')).toHaveCount(1);
  await expect(root.getByRole("checkbox", { name: "sRGB Boundary" })).toHaveAccessibleDescription(
    "",
  );
  await root.getByRole("button", { name: "Gamut references" }).press("Escape");
  await root.getByLabel("Blue numeric value").fill("1.2");
  await root.getByLabel("Blue numeric value").press("Enter");
  await expect(root.locator('[data-gamut-boundary="srgb"]')).toHaveCount(0);
  await root.getByRole("button", { name: "Gamut references" }).click();
  await expect(root.getByRole("checkbox", { name: "sRGB Boundary" })).toHaveAccessibleDescription(
    "",
  );
});

test("packed React field viewport zooms, edits through the inverse camera and fits without authoring", async ({
  page,
}) => {
  await page.goto("/");
  const root = page.locator("[data-gp-root]");
  const plane = root.getByRole("application");
  const definition = page.locator("[data-definition]");
  const initial = await definition.getAttribute("data-definition");
  const bounds = (await plane.boundingBox())!;
  const border = await plane.evaluate((element) => element.clientLeft);
  const field = {
    x: bounds.x + border,
    y: bounds.y + border,
    width: bounds.width - border * 2,
    height: bounds.height - border * 2,
  };
  await page.mouse.move(
    Math.round(field.x + field.width / 2),
    Math.round(field.y + field.height / 2),
  );
  await page.keyboard.down("Alt");
  await page.mouse.wheel(0, -240);
  await page.mouse.wheel(0, -240);
  await page.keyboard.up("Alt");
  const zoom = root.locator("[data-gp-viewport-zoom]");
  await expect
    .poll(async () => Number(await zoom.getAttribute("data-gp-viewport-zoom")))
    .toBeCloseTo(2, 6);
  await expect(root.locator('[data-gp-part="gamut-guides"]')).toHaveAttribute(
    "viewBox",
    /^2[45]\d(?:\.\d+)? 2[45]\d(?:\.\d+)? \d+ \d+$/,
  );
  // Camera-only work never authored a color.
  await expect(definition).toHaveAttribute("data-definition", initial!);
  const target = {
    x: Math.round(field.x + field.width * 0.25),
    y: Math.round(field.y + field.height * 0.75),
  };
  await page.mouse.click(target.x, target.y);
  const marker = (await root.locator("[data-active-marker]").boundingBox())!;
  expect(Math.abs(marker.x + marker.width / 2 - target.x)).toBeLessThan(1);
  expect(Math.abs(marker.y + marker.height / 2 - target.y)).toBeLessThan(1);
  await expect(definition).not.toHaveAttribute("data-definition", initial!);
  const edited = await definition.getAttribute("data-definition");
  await root.getByRole("button", { name: "Fit editor field to view" }).click();
  await expect(zoom).toHaveAttribute("data-gp-viewport-zoom", "1");
  await expect(definition).toHaveAttribute("data-definition", edited!);
  await expect(root.locator('[data-gp-part="gamut-guides"]')).toHaveAttribute(
    "viewBox",
    "0 0 1000 1000",
  );
});
