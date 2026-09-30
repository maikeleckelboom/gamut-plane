import { expect, test } from "@playwright/test";

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
  await root.getByRole("button", { name: "Gamuts" }).click();
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
  await root.getByRole("radio", { name: "Inspect", exact: true }).check();
  await expect(root.getByRole("region", { name: "sRGB coordinates" })).toBeVisible();
  await expect(definition).toHaveAttribute("data-definition", initial!);
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.getByRole("radio", { name: "Edit", exact: true }).check();
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
