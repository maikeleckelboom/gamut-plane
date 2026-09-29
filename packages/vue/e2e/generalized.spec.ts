import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("packed generalized instrument preserves authorship through inspection, checks and guides", async ({
  page,
}) => {
  await page.goto("/?generalized");
  const root = page.locator("[data-gp-root]");
  const definition = page.locator("[data-definition]");
  const initial = await definition.getAttribute("data-definition");
  await expect(root).toHaveAttribute("data-active-plane", "oklch");
  await root.getByLabel("Representation").selectOption("srgb");
  await expect(root.locator("[data-picker-plane]")).toHaveCount(0);
  await expect(root.getByRole("region", { name: "sRGB coordinates" })).toContainText("Red (R)");
  await expect(root.getByRole("region", { name: "sRGB coordinates" })).toContainText("Alpha");
  await expect(definition).toHaveAttribute("data-definition", initial!);

  await root.getByText("Gamut checks and guides").click();
  const checks = root.getByRole("group", { name: "Exact checks" });
  const guides = root.getByRole("group", { name: "Visible guides" });
  await checks.getByLabel("sRGB").check();
  await expect(root.locator("[data-gp-part='exact-result']")).toHaveCount(1);
  await checks.getByLabel("Display P3").check();
  await expect(root.locator("[data-gp-part='exact-result']")).toHaveCount(2);
  await checks.getByLabel("sRGB").uncheck();
  await checks.getByLabel("Display P3").uncheck();
  await expect(root).toContainText("No gamut checks selected");
  await guides.getByLabel("sRGB boundary").check();
  await expect(root.locator("[data-picker-plane]")).toHaveCount(0);
  await expect(guides.getByLabel("sRGB boundary")).toBeChecked();
  await expect(root).toContainText("Requested guides will appear");
  await expect(definition).toHaveAttribute("data-definition", initial!);

  await root.getByLabel("Representation").selectOption("oklch");
  await expect(root.locator("[data-gamut-boundary='srgb']")).toHaveCount(1);
  await expect(root.locator("[data-gp-part='exact-result']")).toHaveCount(0);
  await expect(definition).toHaveAttribute("data-definition", initial!);
  await root.getByLabel("Chroma numeric value").fill("0.25");
  await root.getByLabel("Chroma numeric value").press("Enter");
  await expect(definition).not.toHaveAttribute("data-definition", initial!);
  const authored = JSON.parse((await definition.getAttribute("data-definition"))!) as {
    definition: { space: string; channels: number[] };
  };
  expect(JSON.stringify(authored)).toContain("oklch");
  expect(JSON.stringify(authored)).toContain("0.25");
  const edited = await definition.getAttribute("data-definition");
  await root.getByLabel("Representation").focus();
  await root.getByLabel("Representation").press("End");
  await expect(root.getByLabel("Representation")).toHaveValue("display-p3");
  await expect(root.getByRole("region", { name: "Display P3 coordinates" })).toBeVisible();
  await root.getByLabel("Representation").press("Home");
  await expect(root.getByLabel("Representation")).toHaveValue("oklch");
  await guides.getByLabel("sRGB boundary").focus();
  await guides.getByLabel("sRGB boundary").press("Space");
  await expect(guides.getByLabel("sRGB boundary")).not.toBeChecked();
  await expect(definition).toHaveAttribute("data-definition", edited!);
});

test("packed generalized instrument fits a 440px host and narrow viewport with accessible controls", async ({
  page,
}) => {
  await page.goto("/?generalized");
  const root = page.locator("[data-gp-root]");
  await root.getByText("Gamut checks and guides").click();
  await root.getByRole("group", { name: "Exact checks" }).getByLabel("sRGB").check();
  await root.getByRole("group", { name: "Visible guides" }).getByLabel("sRGB boundary").check();
  expect(await root.evaluate((element) => element.getBoundingClientRect().width)).toBeCloseTo(
    440,
    0,
  );
  expect(await root.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(root).toHaveScreenshot("generalized-editable-440.png");
  await root.getByLabel("Representation").selectOption("srgb");
  await expect(root.locator("canvas")).toHaveCount(0);
  await expect(root).toHaveScreenshot("generalized-observation-440.png");
  const axe = await new AxeBuilder({ page }).include("[data-gp-root]").analyze();
  expect(
    axe.violations.filter((item) => item.impact === "serious" || item.impact === "critical"),
  ).toEqual([]);
  await page.setViewportSize({ width: 320, height: 750 });
  expect(await root.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await expect(root.getByLabel("Representation")).toBeVisible();
  await expect(
    root.getByRole("group", { name: "Visible guides" }).getByLabel("sRGB boundary"),
  ).toBeVisible();
  await expect(root).toHaveScreenshot("generalized-observation-mobile.png");
});
