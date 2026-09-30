import { expect, test, type Locator } from "@playwright/test";

async function coordinates(root: Locator, space: "srgb" | "display-p3", values: readonly number[]) {
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.locator(`[role=option][data-value="${space}"]`).click();
  for (const [index, name] of ["Red", "Green", "Blue"].entries()) {
    const input = root.getByLabel(`${name} numeric value`);
    await input.fill(String(values[index]));
    await input.press("Enter");
  }
}

test("native cross-gamut slice and RGB intervals retain an incompatible Reference warning", async ({
  page,
}) => {
  await page.setViewportSize({ width: 440, height: 1000 });
  await page.goto("/e2e/fixtures/selectionShell.html?alpha");
  const root = page.locator("#instrument [data-gp-root]");
  await coordinates(root, "display-p3", [0.95, 0.1, 0.4]);
  const boundary = root.locator('[data-gamut-boundary="srgb"]');
  await expect(boundary).toHaveAttribute("d", /^M.+ Z$/);
  await expect(root.getByRole("application")).toHaveAccessibleName(/Outside sRGB/);
  await expect(
    root.locator('[data-gp-part="reference-connector"], [data-gp-marker="reference"]'),
  ).toHaveCount(0);
  await expect(root.locator('[data-gp-channel="r"] [data-gamut-range="srgb"]')).toHaveCount(1);
  await expect(root.locator('[data-gp-channel="g"] [data-gamut-range="srgb"]')).toHaveCount(1);
  await expect(root.locator('[data-gp-channel="b"] [data-gamut-range="srgb"]')).toHaveCount(0);
  const authored = await page.locator("#events").getAttribute("data-definition");
  await expect(root).toHaveScreenshot("native-rgb-partial-reference.png");
  await root.getByRole("button", { name: "Gamuts" }).click();
  await expect(root.getByRole("checkbox", { name: "sRGB Boundary" })).toHaveAccessibleDescription(
    "",
  );
  await root.getByRole("checkbox", { name: "sRGB Status" }).uncheck();
  await expect(boundary).toHaveCount(1);
  await expect(page.locator("#events")).toHaveAttribute("data-definition", authored!);
});

test("full and empty RGB slices resolve without Paused and retain independent channel editing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 440, height: 1000 });
  await page.goto("/e2e/fixtures/selectionShell.html?alpha");
  const root = page.locator("#instrument [data-gp-root]");
  await coordinates(root, "srgb", [0.2, 0.4, 0.6]);
  await expect(root.locator('[data-gamut-boundary="srgb"]')).toHaveAttribute("d", /^M.+ Z$/);
  await expect(root.locator('[data-gamut-range="srgb"]')).toHaveCount(3);
  await expect(root).toHaveScreenshot("native-rgb-full.png");
  const blue = root.getByLabel("Blue numeric value");
  await blue.fill("-0.1");
  await blue.press("Enter");
  await expect(root.locator('[data-gamut-boundary="srgb"]')).toHaveCount(0);
  await expect(root.locator('[data-gamut-boundary="display-p3"]')).toHaveCount(1);
  await expect(root.getByRole("slider", { name: "Red", exact: true })).toBeEnabled();
  await expect(root).toHaveScreenshot("native-rgb-empty.png");
  await root.getByRole("button", { name: "Gamuts" }).click();
  await expect(root.getByRole("checkbox", { name: "sRGB Boundary" })).toBeChecked();
  await expect(root.getByRole("checkbox", { name: "sRGB Boundary" })).toHaveAccessibleDescription(
    "",
  );
});
