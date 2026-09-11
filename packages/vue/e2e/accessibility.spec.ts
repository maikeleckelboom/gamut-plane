import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const plane of ["oklch", "oklab"] as const) {
  test(`packed ${plane} component accessibility in a narrow desktop panel`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/");
    const first = page.locator('[data-host="first"]');
    await expect(first.locator("[data-render-color-space]")).not.toHaveAttribute(
      "data-render-color-space",
      "pending",
    );
    if (plane === "oklab") await first.getByRole("radio", { name: "OKLab", exact: true }).click();
    const result = await new AxeBuilder({ page }).include('[data-host="first"]').analyze();
    expect(
      result.violations.filter((item) => item.impact === "serious" || item.impact === "critical"),
    ).toEqual([]);
    expect(errors).toEqual([]);
  });
}
