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
  await page.getByLabel("Representation", { exact: true }).selectOption("oklab");
  await expect(page.locator("[data-active-plane='oklab']")).toBeVisible();
  await expectNoHighImpactViolations(page);
  await page.getByLabel("Representation", { exact: true }).selectOption("srgb");
  await expect(
    page.locator("[data-gp-root]").getByRole("region", { name: "sRGB coordinates" }),
  ).toBeVisible();
  await expectNoHighImpactViolations(page);
});

test("narrow layout, landmarks, and exact status retain their semantics", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Gamut Plane instrument" })).toHaveCount(1);
  await expect(page.getByRole("complementary", { name: "Selected color" })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1, name: "Gamut Plane" })).toHaveCount(1);
  await expect(page.locator('[data-exact-gamut-status="srgb"]')).toContainText(/Inside|Outside/);
  await expect(page.locator('[data-exact-gamut-status="display-p3"]')).toContainText(
    /Inside|Outside/,
  );
  await expectNoHighImpactViolations(page);
});
