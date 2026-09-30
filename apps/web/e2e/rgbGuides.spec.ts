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

test("closed P3 boundaries retain the genuine sRGB line and white channel endpoints", async ({
  page,
}) => {
  await page.goto("/e2e/fixtures/selectionShell.html?alpha");
  const root = page.locator("#instrument [data-gp-root]");
  await coordinates(root, "display-p3", [1, 1, 0.5]);
  const blue = root.locator('[data-gp-channel="b"] [data-gamut-range="srgb"]');
  await expect(blue).toHaveCount(1);
  expect(Number(await blue.getAttribute("data-range-start"))).toBeLessThanOrEqual(0.5);
  expect(Number(await blue.getAttribute("data-range-end"))).toBeCloseTo(1, 12);
  await root.getByRole("combobox", { name: "Area", exact: true }).click();
  await root.locator('[role="option"][data-value="display-p3-rb"]').click();
  const boundary = root.locator('[data-gamut-boundary="srgb"]');
  await expect(boundary).toHaveAttribute("d", /^M.+ L.+/);
  expect(await boundary.getAttribute("d")).not.toContain("Z");
  const input = root.getByLabel("Blue numeric value");
  await input.fill("1");
  await input.press("Enter");
  for (const channel of ["r", "g", "b"]) {
    const interval = root.locator(`[data-gp-channel="${channel}"] [data-gamut-range="srgb"]`);
    await expect(interval).toHaveCount(1);
    expect(Number(await interval.getAttribute("data-range-end"))).toBeCloseTo(1, 12);
  }
  const definition = JSON.parse((await page.locator("#events").getAttribute("data-definition"))!);
  expect(definition).toMatchObject({ space: "display-p3", channels: [1, 1, 1], alpha: 0.37 });
});

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
