import { expect, test, type Page } from "@playwright/test";

async function openInstrument(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Gamut Plane" })).toBeVisible();
  await expect(page.locator("[data-canvas-capability]")).not.toHaveAttribute(
    "data-canvas-capability",
    "pending",
  );
  return errors;
}

test("loads the standalone OKLCH instrument without console errors", async ({ page }) => {
  const errors = await openInstrument(page);

  await expect(page.getByRole("application", { name: /OKLCH plane/ })).toBeVisible();
  await expect(page.locator('[data-gamut-boundary="display-p3"]')).toBeVisible();
  await expect(page.locator('[data-gamut-boundary="srgb"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test("switches planes and preserves open and closed contour contracts", async ({ page }) => {
  await openInstrument(page);
  const oklchPaths = await page
    .locator("[data-gamut-boundary]")
    .evaluateAll((paths) => paths.map((path) => path.getAttribute("d") ?? ""));
  expect(oklchPaths.every((path) => !path.endsWith(" Z"))).toBe(true);

  await page.getByRole("radio", { name: "OKLab" }).click();
  await expect(page.getByRole("application", { name: /OKLab a\/b plane/ })).toBeVisible();
  await expect(page.locator('[data-instrument-domain="disc"]')).toBeVisible();
  const oklabPaths = await page
    .locator("[data-gamut-boundary]")
    .evaluateAll((paths) => paths.map((path) => path.getAttribute("d") ?? ""));
  expect(oklabPaths.every((path) => path.endsWith(" Z"))).toBe(true);
});

test("hides and restores each gamut boundary as view state", async ({ page }) => {
  await openInstrument(page);
  const p3 = page.getByRole("checkbox", { name: "Display P3" });
  const srgb = page.getByRole("checkbox", { name: "sRGB" });

  await p3.uncheck();
  await expect(page.locator('[data-gamut-boundary="display-p3"]')).toHaveCount(0);
  await expect(page.locator('[data-gamut-boundary="srgb"]')).toHaveCount(1);
  await p3.check();

  await srgb.uncheck();
  await expect(page.locator('[data-gamut-boundary="srgb"]')).toHaveCount(0);
  await expect(page.locator('[data-gamut-boundary="display-p3"]')).toHaveCount(1);
  await srgb.check();
  await expect(page.locator("[data-gamut-boundary]")).toHaveCount(2);
});

test("keyboard and pointer edits update the selected color", async ({ page }) => {
  await openInstrument(page);
  const surface = page.getByRole("application", { name: /OKLCH plane/ });
  const channels = page.locator(".channel-values");
  const beforeKeyboard = await channels.textContent();

  await surface.focus();
  await surface.press("ArrowRight");
  await expect(channels).not.toHaveText(beforeKeyboard ?? "");

  const beforePointer = await channels.textContent();
  const bounds = await surface.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(bounds!.x + bounds!.width * 0.78, bounds!.y + bounds!.height * 0.34);
  await expect(channels).not.toHaveText(beforePointer ?? "");
});

test("fixed-plane movement preserves contours while fixed-axis edits invalidate them", async ({
  page,
}) => {
  await openInstrument(page);
  const surface = page.getByRole("application", { name: /OKLCH plane/ });
  const boundary = page.locator('[data-gamut-boundary="srgb"]');
  const originalPath = await boundary.getAttribute("d");
  const bounds = await surface.boundingBox();
  expect(bounds).not.toBeNull();

  await page.mouse.click(bounds!.x + bounds!.width * 0.32, bounds!.y + bounds!.height * 0.68);
  await expect(boundary).toHaveAttribute("d", originalPath!);

  await page.locator("#picker-hue").evaluate((element: HTMLInputElement) => {
    element.value = "305";
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(boundary).not.toHaveAttribute("d", originalPath!);
});

test("resize preserves the represented color and narrow layout does not overflow", async ({
  page,
}) => {
  await openInstrument(page);
  const selected = page.locator(".css-output code").first();
  const before = await selected.textContent();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(selected).toHaveText(before ?? "");
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    surfaceWidth:
      document.querySelector(".color-plane__surface")?.getBoundingClientRect().width ?? 0,
  }));
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  expect(geometry.surfaceWidth).toBeGreaterThan(240);
});

test("enlarged text, focus visibility, and Canvas capability remain usable and truthful", async ({
  page,
}) => {
  await openInstrument(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const oklab = page.getByRole("radio", { name: "OKLab" });
  await oklab.focus();
  const focusStyle = await oklab.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0);

  const capability = page.locator("[data-canvas-capability]");
  const status = await capability.getAttribute("data-canvas-capability");
  const text = await capability.textContent();
  if (status === "display-p3") expect(text).toContain("may paint P3 colors");
  else if (status === "srgb") expect(text).toContain("P3-only field colors may clip");
  else expect(status).toBe("unavailable");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole("checkbox", { name: "Display P3" })).toBeVisible();
});

test("the current interface uses neutral standalone terminology", async ({ page }) => {
  await openInstrument(page);
  const visibleCopy = (await page.locator("body").innerText()).toLowerCase();
  for (const forbidden of [
    "project source",
    "proof",
    "repair",
    "delivery",
    "readiness",
    "tokens",
  ]) {
    expect(visibleCopy).not.toContain(forbidden);
  }
});
