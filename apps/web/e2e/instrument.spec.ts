import { expect, test, type Page } from "@playwright/test";
import { moveOutsideSrgb } from "./outsideSrgb";

async function openInstrument(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator("[data-canvas-capability]")).not.toHaveAttribute(
    "data-canvas-capability",
    "pending",
  );
  await expect(page.locator("[data-gp-root]")).toBeVisible();
}

test("starts with both statuses, both boundaries and sRGB Reference", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await openInstrument(page);
  await expect(page.locator("[data-active-plane='oklch']")).toBeVisible();
  await expect(page.locator("[data-gamut-boundary]")).toHaveCount(2);
  await expect(page.locator("[data-gamut-boundary='srgb']")).toHaveCount(1);
  await expect(page.locator("[data-gamut-boundary='display-p3']")).toHaveCount(1);
  await expect(page.locator("[data-gp-channel='h'] [data-gamut-range]")).not.toHaveCount(0);
  await expect(page.locator('[data-gp-control="card"]')).toHaveCount(2);
  await expect(page.locator('[data-gp-part="native-range"]')).toHaveCount(1);
  await expect(page.locator("[data-gp-part='exact-result']")).toHaveCount(2);
  // The initial color is inside sRGB, so there is no excursion to connect to a Reference.
  await expect(page.locator("[data-gp-marker='reference']")).toHaveCount(0);
  await expect(page.locator("[data-gp-root]")).toContainText("Gamut references");
  expect(errors).toEqual([]);
});

test("selection, inspection, checks, and guides do not author color", async ({ page }) => {
  await openInstrument(page);
  const initial = await page.locator('[data-css-representation="oklch"] code').textContent();
  const root = page.locator("[data-gp-root]");
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.locator('[role="option"][data-value="srgb"]').click();
  await expect(root.getByRole("combobox", { name: "Area" })).toContainText("R / G");
  await expect(root.locator("[data-picker-plane]")).toHaveCount(1);
  await expect(root.getByRole("group", { name: "Interaction mode" })).toHaveCount(0);
  await root.getByRole("button", { name: "Gamut references" }).click();
  await root.getByLabel("Display P3 Status", { exact: true }).check();
  await root.getByLabel("sRGB Status", { exact: true }).check();
  await expect(root.locator("[data-gp-part='exact-result']")).toHaveCount(2);
  await expect(root.locator("[data-gp-part='exact-result']").first()).toHaveAttribute(
    "data-gp-gamut",
    "srgb-gamut",
  );
  await root.getByLabel("sRGB Boundary", { exact: true }).uncheck();
  await expect(root.locator("[data-gamut-boundary='srgb']")).toHaveCount(0);
  await root.getByLabel("sRGB Boundary", { exact: true }).check();
  await expect(root.getByRole("checkbox", { name: "sRGB Boundary" })).toHaveAccessibleDescription(
    "",
  );
  await root.getByRole("button", { name: "Gamut references" }).click();
  await expect(root.locator("[data-gp-part='exact-result']")).toHaveCount(2);
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.locator('[role="option"][data-value="oklch"]').click();
  await expect(root.locator("[data-gamut-boundary='srgb']")).toHaveCount(1);
  await expect(root.locator("[data-picker-plane]")).toHaveCount(1);
  await expect(page.locator('[data-css-representation="oklch"] code')).toHaveText(initial!);
});

test("pointer, keyboard, and numeric edits update the selected color", async ({ page }) => {
  await openInstrument(page);
  const css = page.locator('[data-css-representation="oklch"] code');
  const plane = page.getByRole("application", { name: /OKLCH plane/ });
  const initial = await css.textContent();
  await plane.focus();
  await plane.press("ArrowRight");
  await expect(css).not.toHaveText(initial!);
  const afterKeyboard = await css.textContent();
  const bounds = await plane.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.click(bounds!.x + bounds!.width * 0.7, bounds!.y + bounds!.height * 0.4);
  await expect(css).not.toHaveText(afterKeyboard!);
  await page.getByLabel("Chroma numeric value").fill("0.25");
  await page.getByLabel("Chroma numeric value").press("Enter");
  await expect(page.getByLabel("Chroma numeric value")).toHaveValue("0.2500");
});

test("first pointer press and drag keep the marker under the pointer after switching editors", async ({
  page,
}) => {
  await openInstrument(page);
  for (const representation of ["oklch", "oklab", "oklch"] as const) {
    if (
      representation !== "oklch" ||
      (await page.locator("[data-gp-root]").getAttribute("data-active-plane")) !== "oklch"
    ) {
      await page.getByRole("combobox", { name: "Coordinates" }).click();
      await page.locator(`[role="option"][data-value="${representation}"]`).click();
    }
    const surface = page.locator("[data-gp-part='surface']");
    const marker = surface.locator("[data-active-marker]");
    const box = await surface.boundingBox();
    expect(box).not.toBeNull();
    for (const [x, y, action] of [
      [0.64, 0.42, "press"],
      [0.25, 0.68, "drag"],
    ] as const) {
      const pointerX = box!.x + box!.width * x;
      const pointerY = box!.y + box!.height * y;
      await page.mouse.move(pointerX, pointerY);
      if (action === "press") await page.mouse.down();
      const markerBox = await marker.boundingBox();
      expect(markerBox).not.toBeNull();
      expect(Math.abs(markerBox!.x + markerBox!.width / 2 - pointerX)).toBeLessThan(1);
      expect(Math.abs(markerBox!.y + markerBox!.height / 2 - pointerY)).toBeLessThan(1);
      const currentSurface = await surface.boundingBox();
      expect(currentSurface).not.toBeNull();
      expect(Math.abs(currentSurface!.x - box!.x)).toBeLessThan(0.5);
      expect(Math.abs(currentSurface!.y - box!.y)).toBeLessThan(0.5);
    }
    await page.mouse.up();
    const markerBox = await marker.boundingBox();
    expect(markerBox).not.toBeNull();
    expect(
      Math.abs(markerBox!.x + markerBox!.width / 2 - (box!.x + box!.width * 0.25)),
    ).toBeLessThan(1);
    expect(
      Math.abs(markerBox!.y + markerBox!.height / 2 - (box!.y + box!.height * 0.68)),
    ).toBeLessThan(1);
  }
});

test("the first slider drag after an editor switch keeps its track in place", async ({ page }) => {
  await openInstrument(page);
  await page.getByRole("combobox", { name: "Coordinates" }).click();
  await page.locator('[role="option"][data-value="oklab"]').click();
  await expect(page.locator("[data-gp-part='authorship-context']")).toContainText("OKLCH");
  const track = page.locator("[data-gp-channel='l'] [data-gp-part='channel-track']");
  const range = track.locator("[data-gp-part='native-range']");
  const before = await track.boundingBox();
  expect(before).not.toBeNull();
  await page.mouse.move(before!.x + before!.width * 0.55, before!.y + before!.height / 2);
  await page.mouse.down();
  await page.mouse.move(before!.x + before!.width * 0.8, before!.y + before!.height / 2, {
    steps: 8,
  });
  await expect(page.locator("[data-gp-part='authorship-context']")).toHaveCount(0);
  const during = await track.boundingBox();
  expect(during).not.toBeNull();
  expect(Math.abs(during!.x - before!.x)).toBeLessThan(0.5);
  expect(Math.abs(during!.y - before!.y)).toBeLessThan(0.5);
  expect(
    await range.evaluate((element: HTMLInputElement) => element.valueAsNumber),
  ).toBeGreaterThan(0.7);
  await page.mouse.up();
});

test("alternate editor keeps authored color until an explicit edit", async ({ page }) => {
  await openInstrument(page);
  const css = page.locator('[data-css-representation="oklch"] code');
  const before = await css.textContent();
  await page.getByRole("combobox", { name: "Coordinates" }).click();
  await page.locator('[role="option"][data-value="oklab"]').click();
  await expect(page.locator("[data-active-plane='oklab']")).toBeVisible();
  await expect(css).toHaveText(before!);
  const plane = page.getByRole("application", { name: /OKLab a\/b plane/ });
  await plane.focus();
  await plane.press("ArrowRight");
  await expect(css).not.toHaveText(before!);
});

test("copy output has honest disabled and success states", async ({ page }) => {
  await openInstrument(page);
  const srgb = page.locator('[data-css-representation="srgb"]');
  const srgbCopy = srgb.locator("[data-copy-representation]");
  const srgbClip = srgb.locator("[data-clip-representation]");
  await expect(srgbCopy).toBeEnabled();
  await expect(srgbClip).toBeDisabled();
  await moveOutsideSrgb(page.locator("[data-gp-root]"));
  await expect(srgbCopy).toBeDisabled();
  // Clip is always present and becomes available only when strict output is unavailable.
  await expect(srgbClip).toBeEnabled();
  await srgbClip.click();
  await expect(srgbCopy).toBeEnabled();
  await expect(srgbClip).toBeDisabled();
  const p3 = page.locator('[data-css-representation="display-p3"]');
  const p3Copy = p3.locator("[data-copy-representation]");
  await p3Copy.click();
  await expect(p3Copy).toHaveText("Copied");
  await expect(page.getByRole("status")).toContainText("Copied Display P3");
});

test("narrow and enlarged text keep editable content in bounds", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 750 });
  await openInstrument(page);
  for (const size of ["100%", "200%"] as const) {
    await page.evaluate((fontSize) => {
      document.documentElement.style.fontSize = fontSize;
    }, size);
    await expect(page.getByRole("combobox", { name: "Coordinates" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const rootOverflow = await page
      .locator("[data-gp-root]")
      .evaluate((element) => element.scrollWidth - element.clientWidth);
    expect(rootOverflow).toBeLessThanOrEqual(0);
  }
  const root = page.locator("[data-gp-root]");
  await root.getByRole("button", { name: "Gamut references" }).click();
  await root.getByLabel("sRGB Status", { exact: true }).check();
  await root.getByLabel("Display P3 Boundary", { exact: true }).check();
  expect(
    await root.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(0);
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.locator('[role="option"][data-value="srgb"]').click();
  await expect(root.locator('[data-gp-control="card"]')).toHaveCount(2);
  await expect(root.locator("canvas")).toHaveCount(1);
  expect(
    await root.evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(0);
});

test("the reusable instrument keeps its square field and compact width in varied hosts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openInstrument(page);
  for (const hostWidth of [320, 390, 440, 480, 800]) {
    const dimensions = await page.evaluate((width) => {
      const host = document.querySelector<HTMLElement>(".instrument-primary")!;
      host.style.width = `${width}px`;
      const root = host.querySelector<HTMLElement>("[data-gp-root]")!;
      const surface = root.querySelector<HTMLElement>("[data-gp-part='surface']")!;
      return {
        width: root.getBoundingClientRect().width,
        fieldWidth: surface.getBoundingClientRect().width,
        fieldHeight: surface.getBoundingClientRect().height,
        overflow: root.scrollWidth - root.clientWidth,
      };
    }, hostWidth);
    expect(dimensions.width).toBe(Math.min(hostWidth, 480));
    expect(dimensions.fieldWidth).toBe(dimensions.fieldHeight);
    expect(dimensions.overflow).toBeLessThanOrEqual(0);
  }
});
