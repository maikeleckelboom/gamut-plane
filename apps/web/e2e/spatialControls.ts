import { type Page } from "@playwright/test";

/** Exercise the public disclosure path instead of reaching hidden buttons. */
export async function spatialAction(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  if (!(await button.isVisible())) {
    const label = ["View section", "Fit section", "Flip cut"].includes(name) ? "Section" : "View";
    await page
      .locator(".spatial-disclosure > summary")
      .filter({ hasText: new RegExp(`^${label}$`) })
      .click();
  }
  await button.click();
}
export async function inspectSection(page: Page) {
  await page.getByRole("combobox", { name: "Section value source" }).selectOption("inspect");
}
