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
  await expect(page.locator(".color-inspector .channel-values")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("bundled Geist and inspector rows retain their hierarchy across coordinate views", async ({
  page,
}) => {
  await openInstrument(page);
  await page.evaluate(() => document.fonts.ready);
  const typography = await page.evaluate(() => ({
    sansLoaded: document.fonts.check('600 16px "Geist Variable"'),
    monoLoaded: document.fonts.check('400 16px "Geist Mono Variable"'),
    titleFamily: getComputedStyle(document.querySelector("h1")!).fontFamily,
    valueFamily: getComputedStyle(document.querySelector(".coordinate-summary__value")!).fontFamily,
    copyFamily: getComputedStyle(document.querySelector(".css-output button")!).fontFamily,
    remoteFonts: performance
      .getEntriesByType("resource")
      .filter((entry) => /fonts\.googleapis|fonts\.gstatic|cdn\./.test(entry.name)).length,
  }));
  expect(typography.sansLoaded).toBe(true);
  expect(typography.monoLoaded).toBe(true);
  expect(typography.titleFamily).toContain("Geist Variable");
  expect(typography.valueFamily).toContain("Geist Mono Variable");
  expect(typography.copyFamily).toContain("Geist Variable");
  expect(typography.remoteFonts).toBe(0);

  await expect(page.getByRole("heading", { name: "OKLCH coordinates" })).toBeVisible();
  await expect(page.locator(".coordinate-summary__value")).toHaveText("oklch(68% 0.18 252)");
  await page.getByRole("radio", { name: "OKLab" }).click();
  await expect(page.getByRole("heading", { name: "OKLab coordinates" })).toBeVisible();
  await expect(page.locator(".coordinate-summary__value")).toHaveText(/^oklab\(68% /);

  const row = page.locator('[data-css-representation="display-p3"]');
  const aligned = await row.evaluate((element) => {
    const swatch = element.querySelector(".css-representation__swatch")!.getBoundingClientRect();
    const button = element.querySelector("button")!.getBoundingClientRect();
    const text = element.getBoundingClientRect();
    const middle = text.top + text.height / 2;
    return [swatch.top + swatch.height / 2, button.top + button.height / 2].every(
      (center) => Math.abs(center - middle) < 2,
    );
  });
  expect(aligned).toBe(true);
});

test("the active coordinate view keeps its background as the view changes", async ({ page }) => {
  await openInstrument(page);
  const oklch = page.getByRole("radio", { name: "OKLCH" });
  const oklab = page.getByRole("radio", { name: "OKLab" });
  const background = (radio: typeof oklch) =>
    radio.evaluate((element) => getComputedStyle(element).backgroundColor);

  const activeBackground = await background(oklch);
  expect(activeBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(await background(oklab)).toBe("rgba(0, 0, 0, 0)");
  await oklab.click();
  await expect(oklab).toHaveAttribute("aria-checked", "true");
  expect(await background(oklab)).toBe(activeBackground);
  expect(await background(oklch)).toBe("rgba(0, 0, 0, 0)");
});

test("hides and restores each gamut boundary as view state", async ({ page }) => {
  await openInstrument(page);
  const p3 = page.getByRole("checkbox", { name: "Display P3" });
  const srgb = page.getByRole("checkbox", { name: "sRGB" });
  const selected = page.locator('[data-css-representation="oklch"] code');
  const originalSelection = await selected.textContent();

  await expect(page.locator(".plane-instrument__field > [data-gamut-reference]")).toBeVisible();

  await p3.uncheck();
  await expect(page.locator('[data-gamut-boundary="display-p3"]')).toHaveCount(0);
  await expect(page.locator('[data-gamut-boundary="srgb"]')).toHaveCount(1);
  await expect(selected).toHaveText(originalSelection ?? "");
  await p3.check();

  await srgb.uncheck();
  await expect(page.locator('[data-gamut-boundary="srgb"]')).toHaveCount(0);
  await expect(page.locator('[data-gamut-boundary="display-p3"]')).toHaveCount(1);
  await srgb.check();
  await expect(page.locator("[data-gamut-boundary]")).toHaveCount(2);
  await expect(selected).toHaveText(originalSelection ?? "");
});

test("target selection is exclusive, keyboard operable, and independent from visibility", async ({
  page,
}) => {
  await openInstrument(page);
  const targetResult = page.locator("[data-boundary-target-result]");
  const srgbTarget = page.getByRole("radio", { name: "sRGB" });
  const p3Target = page.getByRole("radio", { name: "Display P3" });
  const selected = page.locator('[data-css-representation="oklch"] code');
  const originalSelection = await selected.textContent();
  const srgbSwatch = await page.locator("[data-boundary-guide-swatch]").getAttribute("style");
  const targetSwatchX = await page
    .locator("[data-boundary-guide-swatch]")
    .evaluate((element) => element.getBoundingClientRect().left);

  await expect(srgbTarget).toBeChecked();
  await expect(p3Target).not.toBeChecked();
  await expect(targetResult).toHaveAttribute("data-boundary-target", "srgb");
  await expect(targetResult).toContainText("Target · sRGB");
  await expect(page.locator('[data-marker-role="target-boundary-projection"]')).toHaveCount(1);
  await expect(page.locator('[data-gamut-range="srgb"]')).not.toHaveCount(0);
  await expect(
    page.locator('[data-picker-control="c"] [data-slider-boundary-preview]'),
  ).toHaveCount(1);
  await expect(page.locator(".channel-control__tick")).toHaveCount(0);

  await p3Target.click();
  await expect(p3Target).toBeChecked();
  await expect(srgbTarget).not.toBeChecked();
  await expect(targetResult).toHaveAttribute("data-boundary-target", "display-p3");
  await expect(targetResult).toContainText("Target · Display P3");
  expect(await page.locator("[data-boundary-guide-swatch]").getAttribute("style")).not.toBe(
    srgbSwatch,
  );
  expect(
    await page
      .locator("[data-boundary-guide-swatch]")
      .evaluate((element) => element.getBoundingClientRect().left),
  ).toBeCloseTo(targetSwatchX, 0);
  await expect(
    page.locator('[data-picker-control="c"] [data-slider-boundary-preview]'),
  ).toHaveCount(1);
  await expect(selected).toHaveText(originalSelection ?? "");

  await p3Target.focus();
  await p3Target.press("ArrowLeft");
  await expect(srgbTarget).toBeChecked();
  await expect(targetResult).toHaveAttribute("data-boundary-target", "srgb");
  await page.getByRole("checkbox", { name: "sRGB" }).uncheck();
  await expect(srgbTarget).toBeChecked();
  await expect(page.locator('[data-gamut-boundary="srgb"]')).toHaveCount(0);
  await expect(page.locator('[data-gamut-range="srgb"]')).toHaveCount(0);
  await expect(page.locator("[data-slider-boundary-preview]")).toHaveCount(0);
  await expect(page.locator('[data-gamut-marker="srgb-boundary-guide"]')).toHaveCount(0);
  await expect(page.locator('[data-marker-role="target-boundary-projection"]')).toHaveCount(0);
  await expect(page.locator('[data-gamut-marker="srgb-boundary-projection"]')).toHaveCount(0);
  await expect(page.locator(".color-plane__projection-connector")).toHaveCount(0);
  await expect(targetResult).toHaveAttribute("data-boundary-target", "srgb");
  await expect(selected).toHaveText(originalSelection ?? "");

  await page.getByRole("checkbox", { name: "Display P3" }).uncheck();
  await expect(page.locator("[data-gamut-boundary]")).toHaveCount(0);
  await expect(page.locator("[data-gamut-range]")).toHaveCount(0);
  await expect(page.locator('[data-gamut-marker$="boundary-guide"]')).toHaveCount(0);
  await expect(page.locator('[data-marker-role="target-boundary-projection"]')).toHaveCount(0);
  await expect(page.locator(".color-plane__projection-connector")).toHaveCount(0);
  await page.getByRole("checkbox", { name: "sRGB" }).check();
  await p3Target.click();
  await expect(p3Target).toBeChecked();
  await expect(page.locator('[data-gamut-marker="display-p3-boundary-projection"]')).toHaveCount(0);
  await expect(page.locator('[data-marker-role="target-boundary-projection"]')).toHaveCount(0);
  await expect(page.locator(".color-plane__projection-connector")).toHaveCount(0);
  await expect(targetResult).toContainText("Guide C");
  await expect(selected).toHaveText(originalSelection ?? "");
});

test("keyboard and pointer edits update the selected color", async ({ page }) => {
  await openInstrument(page);
  const surface = page.locator(".color-plane__surface");
  const channels = page.locator('[data-css-representation="oklch"] code');
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

test("plane focus ring follows keyboard use through repeated pointer interaction", async ({
  page,
}) => {
  await openInstrument(page);
  const surface = page.locator(".color-plane__surface");
  const visibleFocus = () =>
    surface.evaluate((element) => {
      const style = getComputedStyle(element);
      return style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0;
    });

  await surface.click({ position: { x: 40, y: 40 } });
  await expect(surface).toBeFocused();
  expect(await visibleFocus()).toBe(false);
  await page.getByRole("radio", { name: "OKLab" }).click();
  await surface.click({ position: { x: 60, y: 60 } });
  await expect(surface).toBeFocused();
  expect(await visibleFocus()).toBe(false);

  await page.getByRole("radio", { name: "OKLCH" }).click();
  await page.keyboard.press("Tab");
  await expect(surface).toBeFocused();
  expect(await visibleFocus()).toBe(true);

  await surface.click({ position: { x: 80, y: 80 } });
  expect(await visibleFocus()).toBe(false);
  await surface.press("ArrowRight");
  expect(await visibleFocus()).toBe(true);
});

test("slider track focus follows the actual range control", async ({ page }) => {
  await openInstrument(page);
  const hue = page.getByRole("slider", { name: /Hue/ });
  const p3Target = page.getByRole("radio", { name: "Display P3" });
  const track = page.locator('[data-picker-control="h"] .channel-control__track');
  const unfocusedBorder = await track.evaluate((element) => getComputedStyle(element).borderColor);

  await hue.click();
  await expect(hue).toBeFocused();
  await expect
    .poll(() => track.evaluate((element) => getComputedStyle(element).borderColor))
    .toBe(unfocusedBorder);
  await p3Target.click();
  await expect(hue).not.toBeFocused();
  await hue.click();
  await expect(hue).toBeFocused();
  expect(await track.evaluate((element) => getComputedStyle(element).borderColor)).toBe(
    unfocusedBorder,
  );
  await p3Target.click();
  await page.keyboard.press("Tab");
  await hue.focus();
  await expect(hue).toBeFocused();
  expect(await track.evaluate((element) => getComputedStyle(element).borderColor)).not.toBe(
    unfocusedBorder,
  );
  await hue.click();
  expect(await track.evaluate((element) => getComputedStyle(element).borderColor)).toBe(
    unfocusedBorder,
  );
  await hue.press("ArrowRight");
  expect(await track.evaluate((element) => getComputedStyle(element).borderColor)).not.toBe(
    unfocusedBorder,
  );
});

test("slider warning triangle keeps visual space from the native thumb", async ({ page }) => {
  await openInstrument(page);
  const chroma = page.getByLabel("Chroma numeric value");
  await chroma.fill("0.2");
  await chroma.press("Enter");
  const control = page.locator('[data-picker-control="c"]');
  const warning = control.locator('[data-gamut-warning="linear"]');
  await expect(warning).toBeVisible();
  const spacing = await control.evaluate((element) => {
    const range = element.querySelector<HTMLInputElement>('input[type="range"]')!;
    const triangle = element.querySelector<HTMLElement>('[data-gamut-warning="linear"]')!;
    const bounds = range.getBoundingClientRect();
    const warningBounds = triangle.getBoundingClientRect();
    const position =
      (range.valueAsNumber - Number(range.min)) / (Number(range.max) - Number(range.min));
    const thumbCenter = bounds.left + 5 + position * (bounds.width - 10);
    const warningCenter = warningBounds.left + warningBounds.width / 2;
    return {
      gap: Math.abs(warningCenter - thumbCenter) - (10 + warningBounds.width) / 2,
      side: triangle.dataset.warningSide,
      warningCenter,
      thumbCenter,
    };
  });
  expect(spacing.gap).toBeGreaterThan(4);
  expect(spacing.side).toBe(spacing.warningCenter < spacing.thumbCenter ? "left" : "right");
});

test("OKLab edge interactions stay in-domain while authored overflow is preserved", async ({
  page,
}) => {
  await openInstrument(page);
  await page.getByRole("radio", { name: "OKLab" }).click();

  const surface = page.locator(".color-plane__surface");
  const aCoordinate = page.locator('[data-oklab-coordinate="a"]');
  await aCoordinate.fill("0.4");
  await aCoordinate.press("Enter");
  await expect(surface).toHaveAttribute("data-outside-instrument", "false");
  await expect(page.locator("body")).not.toContainText("outside the OKLab editing disc");

  await page.getByRole("radio", { name: "OKLCH" }).click();
  const chroma = page.getByLabel("Chroma numeric value");
  await expect(chroma).toHaveValue("0.4000");
  await expect(page.locator("body")).not.toContainText("outside the visible editing range");

  await chroma.fill("0.52");
  await chroma.press("Enter");
  await page.getByRole("radio", { name: "OKLab" }).click();
  await expect(surface).toHaveAttribute("data-outside-instrument", "true");
  await expect(page.locator("body")).toContainText(
    "Selected color is outside the OKLab editing disc. The marker is shown at the edge; the color is preserved.",
  );
  const markerRadius = await page.locator("[data-active-marker]").evaluate((marker) => {
    const left = Number.parseFloat((marker as HTMLElement).style.left);
    const top = Number.parseFloat((marker as HTMLElement).style.top);
    return Math.hypot(left - 50, top - 50);
  });
  expect(markerRadius).toBeCloseTo(50, 3);

  await page.getByRole("radio", { name: "OKLCH" }).click();
  await expect(chroma).toHaveValue("0.5200");
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

test("relationship viewports keep the field, legend, rail, and CSS output in bounds", async ({
  page,
}) => {
  await openInstrument(page);

  for (const viewport of [
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1280, height: 650 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator("[data-gamut-reference]")).toBeVisible();
    await expect(page.locator(".color-inspector")).toBeVisible();
    const geometry = await page.evaluate(() => {
      const root = document.documentElement;
      const plane = document.querySelector(".color-plane__surface");
      const workspace = document.querySelector<HTMLElement>(".instrument-layout");
      if (!workspace) throw new Error("Instrument workspace missing");
      const copyButtons = [...document.querySelectorAll<HTMLElement>("[data-copy-representation]")];
      return {
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
        clientHeight: root.clientHeight,
        scrollHeight: root.scrollHeight,
        workspaceClientHeight: workspace.clientHeight,
        workspaceScrollHeight: workspace.scrollHeight,
        workspaceScrollable: workspace.scrollHeight > workspace.clientHeight,
        surfaceWidth: plane?.getBoundingClientRect().width ?? 0,
        clippedCopyButtons: copyButtons.some((button) => {
          const bounds = button.getBoundingClientRect();
          return bounds.left < 0 || bounds.right > root.clientWidth;
        }),
      };
    });
    expect(geometry.scrollWidth, `${viewport.width}px document overflow`).toBeLessThanOrEqual(
      geometry.clientWidth,
    );
    expect(geometry.surfaceWidth).toBeGreaterThan(viewport.width <= 390 ? 240 : 300);
    expect(geometry.clippedCopyButtons).toBe(false);
    if (viewport.width >= 1101) {
      expect(
        geometry.scrollHeight,
        `${viewport.width}x${viewport.height} root height overflow`,
      ).toBeLessThanOrEqual(geometry.clientHeight + 1);
      if (
        (viewport.width === 1536 && viewport.height === 864) ||
        (viewport.width === 1440 && viewport.height === 900)
      ) {
        expect(
          geometry.workspaceScrollHeight,
          `${viewport.width}x${viewport.height} workspace height overflow`,
        ).toBeLessThanOrEqual(geometry.workspaceClientHeight + 1);
      }
      if (viewport.height === 650) expect(geometry.workspaceScrollable).toBe(true);
    }
  }

  await page.setViewportSize({ width: 1280, height: 650 });
  const bottomControl = page.getByRole("button", { name: "Copy Display P3 CSS value" });
  await bottomControl.focus();
  await expect(bottomControl).toBeFocused();
  await expect(bottomControl).toBeInViewport();
});

test("wide plane follows the workspace when the header wraps", async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await openInstrument(page);
  const description = page.locator("#project-description");
  const measure = () =>
    page.evaluate(() => {
      const root = document.documentElement;
      const header = document.querySelector<HTMLElement>(".project-header")!;
      const workspace = document.querySelector<HTMLElement>(".instrument-layout")!;
      const surface = document.querySelector<HTMLElement>(".color-plane__surface")!;
      return {
        headerHeight: header.getBoundingClientRect().height,
        workspaceHeight: workspace.clientHeight,
        surfaceHeight: surface.getBoundingClientRect().height,
        rootFits: root.scrollHeight <= root.clientHeight + 1,
        horizontalFits: root.scrollWidth <= root.clientWidth,
      };
    });

  await description.evaluate((element) => {
    element.textContent = "Short description.";
  });
  const shortHeader = await measure();
  await description.evaluate((element) => {
    element.textContent =
      "Interactive OKLab and OKLCH planes with sampled sRGB and Display P3 guides and exact membership checks. " +
      "The instrument remains usable when the project description takes more than one line.";
  });
  const wrappedHeader = await measure();

  expect(wrappedHeader.headerHeight).toBeGreaterThan(shortHeader.headerHeight);
  expect(wrappedHeader.workspaceHeight).toBeLessThan(shortHeader.workspaceHeight);
  expect(wrappedHeader.surfaceHeight).toBeLessThan(shortHeader.surfaceHeight);
  expect(wrappedHeader.rootFits).toBe(true);
  expect(wrappedHeader.horizontalFits).toBe(true);
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

  const p3Boundary = page.getByRole("checkbox", { name: "Display P3" });
  await p3Boundary.focus();
  const boundaryFocusStyle = await p3Boundary.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(boundaryFocusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(boundaryFocusStyle.outlineWidth)).toBeGreaterThan(0);

  const copyP3 = page.getByRole("button", { name: "Copy Display P3 CSS value" });
  await copyP3.focus();
  const copyFocusStyle = await copyP3.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(copyFocusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(copyFocusStyle.outlineWidth)).toBeGreaterThan(0);

  const capability = page.locator("[data-canvas-capability]");
  const status = await capability.getAttribute("data-canvas-capability");
  const text = await capability.textContent();
  if (status === "display-p3") expect(text).toBe("Display P3");
  else if (status === "srgb") expect(text).toBe("sRGB");
  else {
    expect(status).toBe("unavailable");
    expect(text).toBe("Unavailable");
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const clippedOklchValues = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLInputElement>(".channel-control__number")].some(
      (input) => input.scrollWidth > input.clientWidth + 1,
    ),
  );
  expect(clippedOklchValues).toBe(false);
  await expect(page.getByRole("checkbox", { name: "Display P3" })).toBeVisible();
  const targetP3 = page.getByRole("radio", { name: "Display P3" });
  await targetP3.focus();
  await targetP3.scrollIntoViewIfNeeded();
  await expect(targetP3).toBeInViewport();
  const zoomedRoot = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
    workspaceOverflowY: getComputedStyle(document.querySelector(".instrument-layout")!).overflowY,
  }));
  expect(zoomedRoot.scrollHeight).toBeLessThanOrEqual(zoomedRoot.clientHeight + 1);
  expect(zoomedRoot.workspaceOverflowY).toBe("auto");

  await oklab.click();
  await expect(page.getByRole("application", { name: /OKLab a\/b plane/ })).toBeVisible();
  const oklabGeometry = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    clippedCoordinates: [
      ...document.querySelectorAll<HTMLInputElement>("[data-oklab-coordinate]"),
    ].some((input) => input.scrollWidth > input.clientWidth + 1),
  }));
  expect(oklabGeometry.overflow).toBeLessThanOrEqual(0);
  expect(oklabGeometry.clippedCoordinates).toBe(false);
});

test("CSS copy controls expose precision, success feedback, and disabled semantics", async ({
  page,
}) => {
  await openInstrument(page);

  await expect(page.locator('[data-css-representation="display-p3"] code')).toHaveText(
    "color(display-p3 0.316504 0.597325 0.983548)",
  );
  const p3Copy = page.locator('[data-copy-representation="display-p3"]');
  await expect(p3Copy).toHaveAccessibleName("Copy Display P3 CSS value");
  const restingBackground = await p3Copy.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await p3Copy.hover();
  const hoverBackground = await p3Copy.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(hoverBackground).not.toBe(restingBackground);
  await p3Copy.click();
  await expect(p3Copy).toHaveText("Copied");
  await expect(p3Copy).toHaveAttribute("data-copied", "true");
  await expect(p3Copy).toHaveAccessibleName("Copied Display P3 CSS value");
  await expect(page.getByRole("status")).toContainText("Copied Display P3:");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^color\(display-p3 /);

  const srgbCopy = page.getByRole("button", { name: "Copy sRGB CSS value" });
  const hexCopy = page.getByRole("button", { name: "Copy Hex value" });
  await expect(hexCopy).toBeDisabled();
  await expect(hexCopy).toHaveAttribute("aria-describedby", "srgb-copy-reason");
  await expect(srgbCopy).toBeDisabled();
  await expect(srgbCopy).toHaveAttribute("aria-describedby", "srgb-copy-reason");
  await expect(page.locator("#srgb-copy-reason")).toHaveText(
    "Selected color is outside sRGB; no clipped Hex or sRGB value is emitted.",
  );
  await expect(
    page.locator('[data-css-representation="hex"] .css-representation__value'),
  ).toHaveText("Unavailable · outside sRGB");
  await expect(
    page.locator('[data-css-representation="srgb"] .css-representation__value'),
  ).toHaveText("Unavailable · outside sRGB");
  await page.getByLabel("Chroma numeric value").fill("0.52");
  await page.getByLabel("Chroma numeric value").press("Enter");
  await expect(
    page.locator('[data-css-representation="display-p3"] .css-representation__value'),
  ).toHaveText("Unavailable · outside Display P3");
  await expect(p3Copy).toBeDisabled();
  await expect(page.locator("#display-p3-copy-reason")).toHaveText(
    "Selected color is outside Display P3; no clipped value is emitted.",
  );
});

test("Hex copies the selected in-sRGB value without changing the canonical color", async ({
  page,
}) => {
  await openInstrument(page);
  await page.getByLabel("Chroma numeric value").fill("0");
  await page.getByLabel("Chroma numeric value").press("Enter");

  const canonical = await page.locator('[data-css-representation="oklch"] code').textContent();
  const hex = page.locator('[data-css-representation="hex"]');
  const value = await hex.locator("code").textContent();
  expect(value).toMatch(/^#[0-9A-F]{6}$/);
  const copy = hex.locator("button");
  await expect(copy).toBeEnabled();
  await copy.click();
  await expect(copy).toHaveAccessibleName("Copied Hex value");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(value);
  await expect(page.locator('[data-css-representation="oklch"] code')).toHaveText(canonical!);
});

test("keyboard-only navigation reaches boundary and copy controls with visible focus", async ({
  page,
}) => {
  await openInstrument(page);
  const selectedBefore = await page.locator('[data-css-representation="oklch"] code').textContent();
  const visited: string[] = [];
  let boundaryOutlineWidth = 0;
  let copyOutlineWidth = 0;

  for (let tabIndex = 0; tabIndex < 24; tabIndex += 1) {
    await page.keyboard.press("Tab");
    const active = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element) return { marker: "", outlineWidth: 0 };
      const representation = element.dataset.copyRepresentation;
      const boundary = element.dataset.boundaryToggle;
      const target = element.dataset.boundaryTargetOption;
      const marker = representation
        ? `copy-${representation}`
        : target
          ? `target-${target}`
          : boundary
            ? `boundary-${boundary}`
            : "";
      return {
        marker,
        outlineWidth: Number.parseFloat(getComputedStyle(element).outlineWidth),
      };
    });
    if (!active.marker) continue;
    visited.push(active.marker);

    if (active.marker === "boundary-display-p3") {
      boundaryOutlineWidth = active.outlineWidth;
      await page.keyboard.press("Space");
      await expect(page.locator('[data-gamut-boundary="display-p3"]')).toHaveCount(0);
      await expect(page.locator('[data-css-representation="oklch"] code')).toHaveText(
        selectedBefore ?? "",
      );
      await page.keyboard.press("Space");
      await expect(page.locator('[data-gamut-boundary="display-p3"]')).toHaveCount(1);
    }

    if (active.marker === "copy-oklch") {
      copyOutlineWidth = active.outlineWidth;
      break;
    }
  }

  expect(visited).toContain("boundary-display-p3");
  expect(visited).toContain("boundary-srgb");
  expect(visited).toContain("target-srgb");
  expect(visited).toContain("copy-oklch");
  expect(boundaryOutlineWidth).toBeGreaterThan(0);
  expect(copyOutlineWidth).toBeGreaterThan(0);
});

test("header and exact gamut status have one semantic owner", async ({ page }) => {
  await openInstrument(page);
  const header = page.locator(".project-header");
  await expect(header.getByRole("heading", { level: 1 })).toHaveText("Gamut Plane");
  await expect(header).toHaveAttribute("aria-describedby", "project-description");
  await expect(header.locator("#project-description")).toContainText(
    "Interactive OKLab and OKLCH planes",
  );

  await expect(page.locator(".color-inspector [data-exact-gamut-status]")).toHaveCount(2);
  await expect(page.locator(".instrument-primary [data-exact-gamut-status]")).toHaveCount(0);
  await expect(page.locator("[data-picker-gamut-status]")).toHaveCount(0);
  await expect(page.locator("[data-boundary-target-result]")).toBeVisible();
  await expect(page.locator("details")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("Thresholds follow current");
  await expect(page.locator("body")).not.toContainText("Gamut evidence");
});

test("clipboard rejection is announced without a success state", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("Denied")) },
    });
  });
  await page.goto("/");
  const copy = page.getByRole("button", { name: "Copy OKLCH CSS value", exact: true });
  await copy.click();
  await expect(page.getByRole("status")).toContainText("Could not copy OKLCH");
  await expect(copy).not.toHaveText("Copied");
});
