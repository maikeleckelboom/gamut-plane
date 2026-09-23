import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function openInstrument(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Gamut Plane" })).toBeVisible();
  await expect(page.locator("[data-canvas-capability]")).not.toHaveAttribute(
    "data-canvas-capability",
    "pending",
  );
}

async function expectNoHighImpactViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({ page }).analyze();
  const highImpactViolations = result.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target),
    }));

  expect(highImpactViolations).toEqual([]);
}

test("default OKLCH mode has no serious or critical accessibility violations", async ({ page }) => {
  await openInstrument(page);
  await expectNoHighImpactViolations(page);
});

test("OKLab mode has no serious or critical accessibility violations", async ({ page }) => {
  await openInstrument(page);
  await page.getByRole("radio", { name: "OKLab" }).click();
  await expect(page.getByRole("application", { name: /OKLab a\/b plane/ })).toBeVisible();
  await expectNoHighImpactViolations(page);
});

test("narrow OKLCH mode has no serious or critical accessibility violations", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openInstrument(page);
  await expectNoHighImpactViolations(page);
});

test("heading, landmark, and text-status semantics remain explicit", async ({ page }) => {
  await openInstrument(page);

  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Gamut Plane instrument" })).toHaveCount(1);
  await expect(page.getByRole("complementary", { name: "OKLCH coordinates" })).toHaveCount(1);

  const headingLevels = await page
    .locator("h1, h2, h3, h4, h5, h6")
    .evaluateAll((headings) => headings.map((heading) => Number(heading.tagName.slice(1))));
  expect(headingLevels.filter((level) => level === 1)).toHaveLength(1);
  for (let index = 1; index < headingLevels.length; index += 1) {
    expect(headingLevels[index]! - headingLevels[index - 1]!).toBeLessThanOrEqual(1);
  }

  await expect(page.locator('[data-exact-gamut-status="display-p3"]')).toContainText(
    /Inside|Outside/,
  );
  await expect(page.locator('[data-exact-gamut-status="srgb"]')).toContainText(/Inside|Outside/);
  await expect(page.locator(".gamut-facts")).toContainText("Exact gamut status");
  await expect(page.getByRole("radiogroup", { name: "Coordinate view" })).toHaveCount(1);
});
