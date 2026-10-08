import { expect, test } from "@playwright/test";
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

test("packed Vue plane context menu reuses accepted gamut actions without authoring", async ({
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
});

test("packed Vue host imports, observes, and authors a generalized edit", async ({ page }) => {
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
  await root.getByRole("combobox", { name: "Area" }).click();
  await root.locator('[role="option"][data-value="srgb-rb"]').click();
  await root.getByLabel("Green numeric value").fill("1.125");
  await root.getByLabel("Green numeric value").press("Enter");
  await expect(definition).not.toHaveAttribute("data-definition", initial!);
  await expect(root.getByLabel("Green numeric value")).toHaveValue("1.1250");
  const authored = JSON.parse((await definition.getAttribute("data-definition"))!);
  expect(authored).toMatchObject({ space: "srgb", alpha: 0.37 });
  expect(authored.channels[1]).toBe(1.125);
  expect(await root.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
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
