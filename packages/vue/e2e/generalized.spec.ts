import { expect, test } from "@playwright/test";

test("packed Vue host imports, observes, and authors a generalized edit", async ({ page }) => {
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
  expect(await root.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});
