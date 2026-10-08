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
    const area = { r: "gb", g: "rb", b: "rg" }[channel];
    await root.getByRole("combobox", { name: "Area" }).click();
    await root.locator('[data-value="display-p3-' + area + '"]').click();
    const interval = root.locator(`[data-gp-channel="${channel}"] [data-gamut-range="srgb"]`);
    await expect(interval).toHaveCount(1);
    expect(Number(await interval.getAttribute("data-range-end"))).toBeCloseTo(1, 12);
  }
  const definition = JSON.parse((await page.locator("#events").getAttribute("data-definition"))!);
  expect(definition).toMatchObject({ space: "display-p3", channels: [1, 1, 1], alpha: 0.37 });
});

test("native cross-gamut slice connects its Reference and retains independent RGB intervals", async ({
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
  ).toHaveCount(2);
  await expect(root.locator('[data-gp-control="card"] [data-gamut-range="srgb"]')).toHaveCount(0);
  await expect(root.locator('[data-gp-channel="b"] [data-gamut-range="srgb"]')).toHaveCount(0);
  const authored = await page.locator("#events").getAttribute("data-definition");
  await expect(root).toHaveScreenshot("native-rgb-partial-reference.png");
  await root.getByRole("button", { name: "Gamut references" }).click();
  await expect(root.getByRole("checkbox", { name: "sRGB Boundary" })).toHaveAccessibleDescription(
    "",
  );
  await root.getByRole("checkbox", { name: "sRGB Status" }).uncheck();
  await expect(root.locator('[data-gp-part="reference-connector"]')).toHaveCount(0);
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
  await expect(root.locator('[data-gamut-range="srgb"]')).toHaveCount(1);
  await expect(root).toHaveScreenshot("native-rgb-full.png");
  const blue = root.getByLabel("Blue numeric value");
  await blue.fill("-0.1");
  await blue.press("Enter");
  await expect(root.locator('[data-gamut-boundary="srgb"]')).toHaveCount(0);
  await expect(root.locator('[data-gamut-boundary="display-p3"]')).toHaveCount(1);
  await expect(root.getByRole("slider", { name: "Blue", exact: true })).toBeEnabled();
  await expect(root).toHaveScreenshot("native-rgb-empty.png");
  await root.getByRole("button", { name: "Gamut references" }).click();
  await expect(root.getByRole("checkbox", { name: "sRGB Boundary" })).toBeChecked();
  await expect(root.getByRole("checkbox", { name: "sRGB Boundary" })).toHaveAccessibleDescription(
    "",
  );
});

test("reported green RGB colors connect to the visible slice and respect comparison controls", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto("/");
  const root = page.locator("[data-gp-root]");
  const connector = root.locator('[data-gp-part="reference-connector"]');
  const marker = root.locator('[data-gp-marker="reference"]');
  for (const values of [
    [0.130072, 0.831742, 0.510769],
    [0.134845, 0.756961, 0.510769],
  ]) {
    await coordinates(root, "display-p3", values);
    await expect(connector).toHaveCount(1);
    await expect(marker).toHaveAccessibleName("Nearest slice sRGB Reference boundary");
    for (const area of ["rg", "rb", "gb", "rg"]) {
      await root.getByRole("combobox", { name: "Area", exact: true }).click();
      await root.locator(`[role=option][data-value="display-p3-${area}"]`).click();
      await expect(connector).toHaveCount(1);
      const distance = await root.evaluate((element) => {
        const line = element.querySelector<SVGLineElement>('[data-gp-part="reference-connector"]')!;
        const path = element.querySelector<SVGPathElement>('[data-gamut-boundary="srgb"]')!;
        const endpoint = { x: line.x2.baseVal.value, y: line.y2.baseVal.value };
        let nearest = Infinity;
        for (let at = 0; at <= path.getTotalLength(); at += 0.1) {
          const p = path.getPointAtLength(at);
          nearest = Math.min(nearest, Math.hypot(p.x - endpoint.x, p.y - endpoint.y));
        }
        return nearest;
      });
      // Browser SVG geometry, in the 1000-unit viewbox, independently verifies the landing point.
      expect(distance).toBeLessThan(0.12);
    }
  }
  await page.screenshot({
    path: testInfo.outputPath("reported-rgb-reference.png"),
    fullPage: true,
  });
  const authored = await page.locator('[data-css-representation="oklch"] code').textContent();
  await root.getByRole("button", { name: "Gamut references" }).click();
  await root.getByRole("radio", { name: "Display P3", exact: true, includeHidden: true }).check();
  await expect(connector).toHaveCount(0);
  await expect(root.locator('[data-gamut-warning="planar"]')).toHaveCount(0);
  await root.getByRole("radio", { name: "sRGB", exact: true, includeHidden: true }).check();
  await expect(connector).toHaveCount(1);
  await root.getByLabel("sRGB Boundary", { exact: true }).uncheck();
  await expect(connector).toHaveCount(0);
  await expect(root.locator('[data-gamut-warning="planar"]')).toHaveCount(1);
  await root.getByLabel("sRGB Boundary", { exact: true }).check();
  await root.getByLabel("sRGB Status", { exact: true }).uncheck();
  await expect(connector).toHaveCount(0);
  await expect(root.locator('[data-gamut-boundary="srgb"]')).toHaveCount(1);
  await root.getByLabel("sRGB Status", { exact: true }).check();
  await expect(connector).toHaveCount(1);
  await expect(page.locator('[data-css-representation="oklch"] code')).toHaveText(authored!);
});
