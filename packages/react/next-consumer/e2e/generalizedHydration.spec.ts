import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    generalizedBefore: Element[];
  }
}

test("generalized observation-only server HTML hydrates in place and restores requested guide", async ({
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
    expect(html).toContain("sRGB coordinates");
    expect(html).toContain('data-gp-part="exact-result"');
    expect(html).toContain("sRGB boundary");
    const root = page.locator("[data-gp-root]");
    await expect(root.locator("canvas")).toHaveCount(0);
    await expect(root.getByRole("region", { name: "sRGB coordinates" })).toContainText("Alpha");
    await page.evaluate(() => {
      window.generalizedBefore = [
        document.querySelector("[data-gp-root]")!,
        document.querySelector("[data-gp-part='representation-control'] select")!,
        document.querySelector("[data-gp-part='inspection-readout']")!,
        document.querySelector("[data-gp-part='exact-result']")!,
        document.querySelector("[data-gp-part='gamut-disclosure']")!,
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
        document.querySelector("[data-gp-part='representation-control'] select"),
        document.querySelector("[data-gp-part='inspection-readout']"),
        document.querySelector("[data-gp-part='exact-result']"),
        document.querySelector("[data-gp-part='gamut-disclosure']"),
      ];
      return now.every((node, index) => node === window.generalizedBefore[index]);
    }),
  ).toBe(true);
  const root = page.locator("[data-gp-root]");
  const definition = await page.locator("[data-definition]").getAttribute("data-definition");
  await root.getByLabel("Representation").selectOption("oklch");
  await expect(root.locator("[data-picker-plane]")).toHaveCount(1);
  await expect(root.locator("[data-gamut-boundary='srgb']")).toHaveCount(1);
  await expect(page.locator("[data-definition]")).toHaveAttribute("data-definition", definition!);
  expect(errors).toEqual([]);
});
