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
  const selected = page.locator(".channel-values");
  const originalSelection = await selected.textContent();

  await expect(page.locator(".plane-instrument__field > [data-boundary-legend]")).toBeVisible();

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

test("relationship viewports keep the field, legend, rail, and CSS output in bounds", async ({
  page,
}) => {
  await openInstrument(page);

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 768, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(page.locator("[data-boundary-legend]")).toBeVisible();
    await expect(page.locator(".color-inspector")).toBeVisible();
    const geometry = await page.evaluate(() => {
      const root = document.documentElement;
      const plane = document.querySelector(".color-plane__surface");
      const copyButtons = [...document.querySelectorAll<HTMLElement>("[data-copy-representation]")];
      return {
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
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
  }
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
  if (status === "display-p3") expect(text).toContain("may paint P3 colors");
  else if (status === "srgb") expect(text).toContain("P3-only field colors may clip");
  else expect(status).toBe("unavailable");

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

  const srgbCopy = page.getByRole("button", { name: "Copy sRGB CSS value" });
  await expect(srgbCopy).toBeDisabled();
  await expect(srgbCopy).toHaveAttribute("aria-describedby", "srgb-copy-reason");
  await expect(page.locator("#srgb-copy-reason")).toHaveText(
    "Outside sRGB. No clipped value emitted.",
  );
});

test("keyboard-only navigation reaches boundary and copy controls with visible focus", async ({
  page,
}) => {
  await openInstrument(page);
  const selectedBefore = await page.locator(".channel-values").textContent();
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
      const marker = representation
        ? `copy-${representation}`
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
      await expect(page.locator(".channel-values")).toHaveText(selectedBefore ?? "");
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
  await expect(page.locator("[data-boundary-details] summary")).toContainText("Boundary details");
  await expect(page.locator("body")).not.toContainText("Thresholds follow current");
  await expect(page.locator("body")).not.toContainText("Gamut evidence");
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
