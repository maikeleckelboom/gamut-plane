import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test("touch opens and activates without hover", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4177",
    hasTouch: true,
    viewport: { width: 390, height: 900 },
  });
  const page = await context.newPage();
  const root = await ready(page);
  await root.getByRole("combobox", { name: "Coordinates" }).tap();
  await root.getByRole("option", { name: /^Display P3/ }).tap();
  await expect(root.getByRole("combobox", { name: "Coordinates" })).toContainText("Display P3");
  await expect(page.locator("#events")).toHaveAttribute("data-requests", "1");
  await expect(page.locator("#events")).toHaveAttribute("data-updates", "0");
  await context.close();
});

async function ready(page: Page) {
  await page.goto("/e2e/fixtures/selectionShell.html");
  const root = page.locator("#instrument [data-gp-root]");
  await expect(root.locator('[data-gp-part="surface"]')).toBeVisible();
  return root;
}
test("candidate keyboard, typeahead, accepted checks, Tab and outside dismissal", async ({
  page,
}) => {
  const root = await ready(page);
  const trigger = root.getByRole("combobox", { name: "Coordinates" });
  const events = page.locator("#events");
  const original = await events.getAttribute("data-definition");
  await trigger.focus();
  await trigger.press("Enter");
  await expect(root.locator("[data-highlighted]")).toHaveAttribute("data-value", "oklch");
  await trigger.press("ArrowDown");
  await expect(root.locator("[data-highlighted]")).toHaveAttribute("data-value", "oklab");
  await expect(root.getByRole("option", { selected: true })).toHaveAttribute("data-value", "oklch");
  await trigger.press("End");
  await expect(root.locator("[data-highlighted]")).toHaveAttribute("data-value", "display-p3");
  await trigger.press("Home");
  await trigger.press("s");
  await expect(root.locator("[data-highlighted]")).toHaveAttribute("data-value", "srgb");
  await trigger.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(events).toHaveAttribute("data-requests", "0");
  await expect(events).toHaveAttribute("data-definition", original!);
  await trigger.press("Space");
  await trigger.press("Tab");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(root.getByRole("radio", { name: "Edit", exact: true })).toBeFocused();
  await trigger.press("Alt+ArrowDown");
  await page.getByRole("button", { name: "Reject requests" }).click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  // Pressing the open trigger closes it; native light dismiss must not reopen it on click.
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(
    root.getByRole("listbox", { name: "Coordinates", includeHidden: true }),
  ).toBeHidden();
  await trigger.click();
  await root.getByRole("option", { name: /^sRGB/ }).click();
  await expect(events).toHaveAttribute("data-requests", "1");
  await expect(trigger).toContainText("OKLCH");
  await root.getByRole("radio", { name: "Inspect", exact: true }).click();
  await expect(root.getByRole("radio", { name: "Edit", exact: true })).toBeChecked();
});
test("pending draft completes once in old context before representation or Inspect", async ({
  page,
}) => {
  const root = await ready(page);
  const events = page.locator("#events");
  await root.getByLabel("Hue numeric value").fill("123");
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await expect(events).toHaveAttribute("data-commits", "1");
  await expect(events).toHaveAttribute("data-definition", /123/);
  await root.getByRole("option", { name: "OKLab", exact: true }).click();
  await expect(events).toHaveAttribute("data-commits", "1");
  await expect(events).toHaveAttribute("data-context", "oklab:oklab-ab");
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.getByRole("option", { name: "OKLCH", exact: true }).click();
  await root.getByLabel("Chroma numeric value").fill("0.123");
  await root.getByRole("radio", { name: "Inspect", exact: true }).check();
  await expect(events).toHaveAttribute("data-commits", "2");
  await expect(events).toHaveAttribute("data-context", "oklch:none");
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.getByRole("option", { name: "OKLCH", exact: true }).click();
  await expect(events).toHaveAttribute("data-context", "oklch:none");
  await expect(events).toHaveAttribute("data-commits", "2");
});
test("comparison changes preserve mounted controls and popup candidate", async ({ page }) => {
  const root = await ready(page);
  const trigger = root.getByRole("combobox", { name: "Coordinates" });
  const field = await root.locator('[data-gp-part="surface"]').elementHandle();
  const input = await root.getByLabel("Hue numeric value").elementHandle();
  await trigger.click();
  await trigger.press("ArrowDown");
  await page
    .getByRole("button", { name: "Clear comparison" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(root.locator("[data-highlighted]")).toHaveAttribute("data-value", "oklab");
  await expect(root.locator(".gp-selector-status[data-gp-status]")).toHaveCount(0);
  expect(await field!.evaluate((node) => node.isConnected)).toBe(true);
  expect(await input!.evaluate((node) => node.isConnected)).toBe(true);
  await trigger.press("Escape");
  await expect(page.locator("#events")).toHaveAttribute("data-commits", "0");
});
for (const owner of ["plane", "range"] as const)
  test(`active ${owner} gesture prevents popup focus takeover`, async ({ page }) => {
    const root = await ready(page);
    const trigger = root.getByRole("combobox", { name: "Coordinates" });
    const control =
      owner === "plane"
        ? root.locator('[data-gp-part="surface"]')
        : root.getByRole("slider", { name: "Hue", exact: true });
    const box = (await control.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await trigger.dispatchEvent("pointerdown", { pointerId: 9, pointerType: "touch" });
    await trigger.evaluate((button: HTMLButtonElement) => button.click());
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(control).toBeFocused();
    await page.mouse.up();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
  });
test("future Area admission, no remembered editor, one popup and nested hosts", async ({
  page,
}) => {
  await ready(page);
  const root = page.locator("#area-fixture");
  const area = root.getByRole("combobox", { name: "Area" });
  await expect(area).toContainText("Hue / Chroma");
  await area.click();
  await root.getByRole("option", { name: "Lightness / Chroma" }).click();
  await expect(page.locator("#area-context")).toHaveText("oklch:oklch-lc");
  await area.click();
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await expect(area).toHaveAttribute("aria-expanded", "false");
  await root.getByRole("combobox", { name: "Coordinates" }).press("Escape");
  await root.getByRole("radio", { name: "Inspect", exact: true }).check();
  await expect(area).toHaveCount(0);
  await root.getByRole("radio", { name: "Edit", exact: true }).check();
  await expect(area).toContainText("Lightness / Chroma");
  for (const kind of ["dialog", "popover"]) {
    await page.getByRole("button", { name: `Open host ${kind}` }).click();
    const host = kind === "dialog" ? page.locator("dialog") : page.locator("#host-popover");
    const selector = host.getByRole("combobox", { name: "Coordinates" });
    await selector.click();
    await expect(host).toBeVisible();
    await expect(host.getByRole("listbox")).toBeVisible();
    await selector.press("Escape");
    await expect(host).toBeVisible();
    await expect(selector).toBeFocused();
    await expect(selector).toHaveAttribute("aria-expanded", "false");
    await selector.press("Escape");
    await expect(host).not.toBeVisible();
  }
});
test("open popup accessibility and forced-colors selected versus candidate", async ({ page }) => {
  const root = await ready(page);
  const selector = root.getByRole("combobox", { name: "Coordinates" });
  await selector.click();
  await selector.press("ArrowDown");
  await expect(root.getByRole("option", { name: /sRGB, gamut status Outside/ })).toBeVisible();
  expect((await new AxeBuilder({ page }).include("#instrument").analyze()).violations).toEqual([]);
  await page.emulateMedia({ forcedColors: "active" });
  await expect(root.locator("[data-highlighted]")).toHaveCSS("border-top-style", "solid");
  await expect(
    root.getByRole("option", { selected: true }).locator(".gp-selector-check"),
  ).toHaveText("✓");
  expect(await root.locator("[aria-live]").count()).toBe(0);
});
