import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./browserFixture";

test("packed React host imports and authors a generalized edit", async ({ page }) => {
  await page.goto("/");
  const root = page.locator("[data-gp-root]");
  const definition = page.locator("[data-definition]");
  const initial = await definition.getAttribute("data-definition");
  await expect(root).toHaveAttribute("data-active-plane", "oklch");
  await root.getByLabel("Representation", { exact: true }).selectOption("srgb");
  await expect(root.getByRole("region", { name: "sRGB coordinates" })).toBeVisible();
  await expect(definition).toHaveAttribute("data-definition", initial!);
  await root.getByLabel("Representation", { exact: true }).selectOption("oklch");
  await root.getByLabel("Chroma numeric value").fill("0.25");
  await root.getByLabel("Chroma numeric value").press("Enter");
  await expect(definition).not.toHaveAttribute("data-definition", initial!);
});

test("packed React anatomy matches the shared visual owner in editable and observation states", async ({
  page,
}) => {
  await page.goto("/");
  const root = page.locator("[data-gp-root]");
  await root.getByText("Gamut checks and guides").click();
  await root.getByRole("group", { name: "Exact checks" }).getByLabel("sRGB").check();
  await root.getByRole("group", { name: "Visible guides" }).getByLabel("sRGB boundary").check();
  expect(await root.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(root).toHaveScreenshot("generalized-editable-440.png");
  await root.getByLabel("Representation", { exact: true }).selectOption("srgb");
  await expect(root.locator("canvas")).toHaveCount(0);
  await expect(root).toHaveScreenshot("generalized-observation-440.png");
  const axe = await new AxeBuilder({ page }).include("[data-gp-root]").analyze();
  expect(
    axe.violations.filter((item) => item.impact === "serious" || item.impact === "critical"),
  ).toEqual([]);
});
