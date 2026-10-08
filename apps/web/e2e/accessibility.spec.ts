import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function expectNoHighImpactViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => ({
        id: violation.id,
        targets: violation.nodes.map((node) => node.target),
      })),
  ).toEqual([]);
}

test("editable, alternate editor, and observation states remain accessible", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-gp-root]")).toBeVisible();
  await expectNoHighImpactViolations(page);
  await page.getByRole("combobox", { name: "Coordinates" }).click();
  await page.locator('[role="option"][data-value="oklab"]').click();
  await expect(page.locator("[data-active-plane='oklab']")).toBeVisible();
  await expectNoHighImpactViolations(page);
  await page.getByRole("combobox", { name: "Coordinates" }).click();
  await page.locator('[role="option"][data-value="srgb"]').click();
  await expect(page.getByRole("combobox", { name: "Area" })).toBeVisible();
  await expectNoHighImpactViolations(page);
  await page.goto("/e2e/fixtures/selectionShell.html");
  const root = page.locator("#instrument [data-gp-root]");
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.locator('[data-value="srgb"]').click();
  await page.getByRole("button", { name: "Set observation", exact: true }).click();
  await expect(root.getByRole("region", { name: "sRGB coordinates" })).toBeVisible();
  await expectNoHighImpactViolations(page);
});

test("narrow layout, landmarks, and exact status retain their semantics", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Gamut Plane instrument" })).toHaveCount(1);
  await expect(page.getByRole("complementary", { name: "Output examples" })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1, name: "Gamut Plane" })).toHaveCount(1);
  await page.getByRole("button", { name: "Gamut references" }).click();
  await page.getByLabel("sRGB Status", { exact: true }).check();
  await expect(page.locator("[data-gp-part='exact-result']").first()).toContainText(
    /Inside|Outside/,
  );
  await expectNoHighImpactViolations(page);
});
