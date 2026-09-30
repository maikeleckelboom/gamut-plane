import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    generalizedBefore: Element[];
  }
}

test("native RGB server HTML hydrates raw placement in place and preserves requested guides", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" ||
      (/hydrat|mismatch/i.test(message.text()) && message.type() === "warning")
    )
      errors.push(message.text());
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "script") await gate;
    await route.continue();
  });
  try {
    const response = await page.goto("/generalized", { waitUntil: "commit" });
    const html = await response!.text();
    expect(html).toContain("sRGB plane.");
    expect(html).toContain("color(srgb 1.2 0.4 -0.1)");
    expect(html).toMatch(/left:120(?:\.0+)?%/);
    expect(html).toContain('data-gp-part="exact-result"');
    expect(html).toContain('aria-label="sRGB Boundary"');
    expect(html).toContain('data-gamut-boundary="display-p3"');
    expect(html).toContain('data-gamut-range="display-p3"');
    const root = page.locator("[data-gp-root]");
    await expect(root.locator("canvas")).toHaveCount(1);
    await expect(root.getByLabel("Red numeric value")).toHaveValue("1.2000");
    await expect(root.getByRole("combobox", { name: "Area" })).toContainText("R / G");
    await page.evaluate(() => {
      window.generalizedBefore = [
        document.querySelector("[data-gp-root]")!,
        document.querySelector("[data-gp-part='representation-control'] [role=combobox]")!,
        document.querySelector("[data-gp-part='surface']")!,
        document.querySelector("[data-active-marker]")!,
        document.querySelector("[data-gamut-boundary='display-p3']")!,
        document.querySelector("[data-gamut-range='display-p3']")!,
        document.querySelector("[role=combobox][id$='-area']")!,
        document.querySelector("[data-gp-part='exact-result']")!,
        document.querySelector("[data-gp-part='gamut-trigger']")!,
        document.querySelector("[data-gp-part='gamut-popup']")!,
      ];
    });
  } finally {
    release();
  }
  await expect(page.locator("[data-generalized-host]")).toHaveAttribute(
    "data-generalized-hydrated",
    "true",
  );
  expect(
    await page.evaluate(() => window.generalizedBefore.every((node) => document.contains(node))),
  ).toBe(true);
  expect(
    await page.evaluate(() => {
      const now = [
        document.querySelector("[data-gp-root]"),
        document.querySelector("[data-gp-part='representation-control'] [role=combobox]"),
        document.querySelector("[data-gp-part='surface']"),
        document.querySelector("[data-active-marker]"),
        document.querySelector("[data-gamut-boundary='display-p3']"),
        document.querySelector("[data-gamut-range='display-p3']"),
        document.querySelector("[role=combobox][id$='-area']"),
        document.querySelector("[data-gp-part='exact-result']"),
        document.querySelector("[data-gp-part='gamut-trigger']"),
        document.querySelector("[data-gp-part='gamut-popup']"),
      ];
      return now.every((node, index) => node === window.generalizedBefore[index]);
    }),
  ).toBe(true);
  const root = page.locator("[data-gp-root]");
  const definition = await page.locator("[data-definition]").getAttribute("data-definition");
  expect(JSON.parse(definition!)).toMatchObject({
    space: "srgb",
    channels: [1.2, 0.4, -0.1],
    alpha: 0.37,
  });
  expect(
    await root
      .locator("[data-active-marker]")
      .evaluate((element) => (element as HTMLElement).style.left),
  ).toBe("120%");
  // Hydration leaves Gamuts closed and unfocused; the mounted controller then opens it on request.
  const gamuts = root.getByRole("button", { name: "Gamuts" });
  await expect(gamuts).toHaveAttribute("aria-expanded", "false");
  await expect(root.locator("[data-gp-part='gamut-popup']")).toBeHidden();
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await gamuts.click();
  await expect(root.getByRole("dialog", { name: "Gamuts" })).toBeVisible();
  await expect(root.getByRole("checkbox", { name: "sRGB Boundary" })).toBeChecked();
  await expect(root.getByRole("checkbox", { name: "sRGB Boundary" })).toHaveAccessibleDescription(
    "",
  );
  await gamuts.press("Escape");
  await expect(root.getByRole("dialog", { name: "Gamuts" })).toBeHidden();
  await expect(page.locator("[data-definition]")).toHaveAttribute("data-definition", definition!);
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.locator('[role="option"][data-value="oklch"]').click();
  await expect(root.locator("[data-picker-plane]")).toHaveCount(1);
  await expect(root.locator("[data-gamut-boundary='srgb']")).toHaveCount(1);
  await expect(page.locator("[data-definition]")).toHaveAttribute("data-definition", definition!);
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.locator('[role="option"][data-value="srgb"]').click();
  await root.getByLabel("Green numeric value").fill("0.2");
  await root.getByLabel("Green numeric value").press("Enter");
  expect(
    JSON.parse((await page.locator("[data-definition]").getAttribute("data-definition"))!),
  ).toMatchObject({ space: "srgb", channels: [1.2, 0.2, -0.1], alpha: 0.37 });
  await root.getByRole("radio", { name: "Inspect", exact: true }).check();
  await expect(root.getByRole("region", { name: "sRGB coordinates" })).toContainText("Alpha");
  expect(errors).toEqual([]);
});
