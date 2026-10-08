import { expect, test, type Locator, type Page } from "@playwright/test";

async function open(page: Page) {
  await page.goto("/e2e/fixtures/selectionShell.html?alpha");
  const root = page.locator("#instrument [data-gp-root]");
  await expect(root.locator("[data-render-color-space]")).not.toHaveAttribute(
    "data-render-color-space",
    "pending",
  );
  return root;
}
async function choose(root: Locator, selector: string, value: string) {
  await root.getByRole("combobox", { name: selector, exact: true }).click();
  await root.locator(`[role="option"][data-value="${value}"]`).click();
}
async function numeric(root: Locator, name: string, value: number) {
  const input = root.getByRole("spinbutton", { name: `${name} numeric value` });
  await input.fill(String(value));
  await input.press("Enter");
}
async function framing(root: Locator) {
  await root.getByRole("button", { name: "Field framing options", exact: true }).click();
  const popup = root.getByRole("dialog", { name: "Field framing", exact: true });
  await expect(popup).toBeVisible();
  return popup;
}
async function evidence(page: Page) {
  return page.locator("#events").evaluate((el) => ({ ...(el as HTMLElement).dataset }));
}

test("grouped Coordinates navigates across headings, distinguishes active from candidate and preserves rejected selection", async ({
  page,
}) => {
  const root = await open(page);
  const selector = root.getByRole("combobox", { name: "Coordinates" });
  const before = await evidence(page);
  await selector.press("Enter");
  const list = root.getByRole("listbox", { name: "Coordinates" });
  await expect(list.getByRole("group", { name: "Perceptual" }).getByRole("option")).toHaveCount(2);
  await expect(list.getByRole("group", { name: "RGB" }).getByRole("option")).toHaveCount(2);
  await expect(list.locator('[aria-selected="true"]')).toHaveAttribute("data-value", "oklch");
  await selector.press("ArrowDown");
  await selector.press("ArrowDown");
  await expect(list.locator("[data-highlighted]")).toHaveAttribute("data-value", "srgb");
  await expect(list.locator('[aria-selected="true"]')).toHaveAttribute("data-value", "oklch");
  await selector.press("End");
  await expect(list.locator("[data-highlighted]")).toHaveAttribute("data-value", "display-p3");
  await selector.press("Home");
  await selector.press("o");
  await expect(list.locator("[data-highlighted]")).toHaveAttribute("data-value", "oklab");
  await selector.press("Enter");
  await expect(selector).toContainText("OKLab");
  await expect(selector).toBeFocused();
  await page.getByRole("button", { name: "Reject requests" }).click();
  await selector.press("Enter");
  await selector.press("s");
  await selector.press("Enter");
  await expect(selector).toContainText("OKLab");
  await selector.press("Enter");
  await expect(list.locator('[aria-selected="true"]')).toHaveAttribute("data-value", "oklab");
  await selector.press("Escape");
  await expect(selector).toBeFocused();
  const after = await evidence(page);
  expect(after.definition).toBe(before.definition);
  expect([after.updates, after.commits, after.cancels]).toEqual(["0", "0", "0"]);
});

for (const space of ["srgb", "display-p3"] as const)
  test(`${space} suppresses its self-boundary across Areas and extended slices while retaining exact warnings and requests`, async ({
    page,
  }) => {
    const root = await open(page);
    await choose(root, "Coordinates", space);
    for (const area of ["rg", "rb", "gb"] as const) {
      await choose(root, "Area", `${space}-${area}`);
      const fixed = { rg: "Blue", rb: "Green", gb: "Red" }[area];
      for (const value of [-0.1, 0, 0.5, 1, 1.1]) {
        await numeric(root, fixed, value);
        await expect(
          root.locator(`[data-gamut-boundary="${space}"], [data-gamut-boundary-hit="${space}"]`),
        ).toHaveCount(0);
        const state = JSON.parse((await evidence(page)).state!);
        expect(state.visibleGuides).toEqual(["display-p3-boundary", "srgb-boundary"]);
        expect(state.checkedGamuts).toEqual(["display-p3-gamut", "srgb-gamut"]);
        expect(state.referenceGamutId).toBe("srgb-gamut");
      }
      const popup = await framing(root);
      if (space === "srgb") {
        await expect(
          popup.getByRole("button", { name: "Fit to Reference Boundary" }),
        ).toHaveAttribute("aria-disabled", "true");
        await expect(popup).toContainText("native Area domain");
      }
      await page.keyboard.press("Escape");
    }
    await expect(root.getByRole("application")).toHaveAccessibleName(/Outside sRGB/);
    await expect(root.locator('[data-gamut-warning="planar"]')).toHaveCount(1);
    await expect(root.locator('[data-gamut-warning="linear"]')).toHaveCount(0);
    await root.getByRole("button", { name: "Gamut references", exact: true }).click();
    await expect(
      root.getByRole("checkbox", {
        name: `${space === "srgb" ? "sRGB" : "Display P3"} Boundary`,
        exact: true,
      }),
    ).toBeChecked();
    await expect(root).not.toContainText("Paused");
  });

test("Reference framing discovers a panned-away small boundary and changes only the existing viewport", async ({
  page,
}) => {
  const root = await open(page);
  await choose(root, "Coordinates", "oklab");
  await numeric(root, "Lightness", 0.08);
  const before = await evidence(page);
  const plane = root.locator('[data-gp-part="plane"]');
  const surface = root.getByRole("application");
  await surface.focus();
  for (let count = 0; count < 9; count++) await surface.press("+");
  await surface.press("Space");
  await page.keyboard.down("Space");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.up("Space");
  const view = root.locator('[data-gp-part="gamut-guides"]');
  const panned = await view.getAttribute("viewBox");
  const popup = await framing(root);
  const action = popup.getByRole("button", { name: "Fit to Reference Boundary" });
  await expect(action).not.toHaveAttribute("aria-disabled");
  await action.click();
  await expect(popup).toBeHidden();
  await expect(plane).toHaveAttribute("data-gp-viewport-zoom", "8");
  expect(await view.getAttribute("viewBox")).not.toBe(panned);
  expect(await evidence(page)).toEqual(before);
  await expect(root.getByRole("button", { name: "Field framing options" })).toBeFocused();
  await root.getByRole("button", { name: "Fit editor field to view" }).click();
  await expect(plane).toHaveAttribute("data-gp-viewport-zoom", "1");
  expect(await evidence(page)).toEqual(before);
});

test("unavailable Reference fits explain eligibility and never perform ordinary Fit", async ({
  page,
}) => {
  const root = await open(page);
  await root.getByRole("button", { name: "Zoom in", exact: true }).click();
  const plane = root.locator('[data-gp-part="plane"]');
  await expect(plane).toHaveAttribute("data-gp-viewport-zoom", "1.25");
  await root.getByRole("button", { name: "Gamut references", exact: true }).click();
  await root.getByRole("checkbox", { name: "sRGB Boundary", exact: true }).uncheck();
  await page.keyboard.press("Escape");
  const before = await evidence(page);
  const popup = await framing(root);
  const action = popup.getByRole("button", { name: "Fit to Reference Boundary" });
  await expect(action).toHaveAttribute("aria-disabled", "true");
  await expect(action).toHaveAccessibleDescription(/Request the sRGB Boundary/);
  await action.click({ force: true });
  await expect(plane).toHaveAttribute("data-gp-viewport-zoom", "1.25");
  expect(await evidence(page)).toEqual(before);
  await page.keyboard.press("Escape");
  await root.getByRole("button", { name: "Gamut references", exact: true }).click();
  await root.getByRole("radio", { name: "None", exact: true }).check();
  await page.keyboard.press("Escape");
  await framing(root);
  await expect(action).toHaveAccessibleDescription(/Choose a Reference/);
});

test("native comparison point, line and empty fits preserve extended authorship with Status off", async ({
  page,
}) => {
  const root = await open(page);
  await choose(root, "Coordinates", "display-p3");
  for (const name of ["Red", "Green", "Blue"]) await numeric(root, name, 0);
  await root.getByRole("button", { name: "Gamut references", exact: true }).click();
  for (const name of ["sRGB Status", "Display P3 Status"])
    await root.getByRole("checkbox", { name, exact: true }).uncheck();
  await page.keyboard.press("Escape");
  const plane = root.locator('[data-gp-part="plane"]');
  for (const area of ["rg", "rb", "gb"]) {
    await choose(root, "Area", `display-p3-${area}`);
    const before = await evidence(page);
    const popup = await framing(root);
    await popup.getByRole("button", { name: "Fit to Reference Boundary" }).click();
    const zoom = Number(await plane.getAttribute("data-gp-viewport-zoom"));
    expect(zoom).toBeGreaterThanOrEqual(1);
    expect(zoom).toBeLessThanOrEqual(8);
    expect(await evidence(page)).toEqual(before);
  }
  await choose(root, "Area", "display-p3-rg");
  await numeric(root, "Blue", 2);
  await root.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(plane).toHaveAttribute("data-gp-viewport-zoom", "1.25");
  const before = await evidence(page);
  const popup = await framing(root);
  const action = popup.getByRole("button", { name: "Fit to Reference Boundary" });
  await expect(action).toHaveAccessibleDescription(/no visible geometry/);
  await action.focus();
  await action.press("Enter");
  await expect(plane).toHaveAttribute("data-gp-viewport-zoom", "1.25");
  expect(await evidence(page)).toEqual(before);
  await page.keyboard.press("Escape");
  await root.getByRole("button", { name: "Gamut references", exact: true }).click();
  await expect(root).not.toContainText("Paused");
  await expect(root.getByRole("checkbox", { name: "sRGB Boundary", exact: true })).toBeChecked();
});

test("field framing reuses one reentrancy-safe popup owner for replacement, native dismissal and keyboard focus", async ({
  page,
}) => {
  const messages: string[] = [];
  page.on("console", (m) => {
    if (["warning", "error"].includes(m.type())) messages.push(m.text());
  });
  page.on("pageerror", (e) => messages.push(e.message));
  const root = await open(page);
  const trigger = root.getByRole("button", { name: "Field framing options" });
  const popup = await framing(root);
  await trigger.click();
  await expect(popup).toBeHidden();
  await trigger.press("Enter");
  await expect(popup).toBeVisible();
  await trigger.press("Tab");
  await expect(popup.getByRole("button", { name: "Fit to Reference Boundary" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  for (const name of ["Coordinates", "Area", "Gamut references", "Gamut actions"]) {
    if (name === "Area") await choose(root, "Coordinates", "srgb");
    await framing(root);
    if (name === "Gamut actions") await root.getByRole("application").click({ button: "right" });
    else if (name === "Gamut references")
      await root.getByRole("button", { name, exact: true }).click();
    else await root.getByRole("combobox", { name, exact: true }).click();
    await expect(popup).toBeHidden();
    await expect(root.locator(":popover-open")).toHaveCount(1);
    await framing(root);
    await expect(root.locator(":popover-open")).toHaveCount(1);
    await popup.evaluate((el) => (el as HTMLElement).hidePopover());
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  }
  expect(messages).toEqual([]);
});

test("field framing inside a native host popover preserves Escape and synchronizes ancestor dismissal", async ({
  page,
}) => {
  const messages: string[] = [];
  page.on("console", (m) => {
    if (["warning", "error"].includes(m.type())) messages.push(m.text());
  });
  page.on("pageerror", (e) => messages.push(e.message));
  const root = await open(page);
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "field-host";
    host.setAttribute("popover", "auto");
    document.body.append(host);
    host.append(document.querySelector("#instrument")!);
    host.showPopover();
  });
  const host = page.locator("#field-host");
  const popup = await framing(root);
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect(host).toBeVisible();
  await framing(root);
  await host.evaluate((el) => (el as HTMLElement).hidePopover());
  await expect(popup).toBeHidden();
  await expect(
    root.getByRole("button", { name: "Field framing options", includeHidden: true }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(messages).toEqual([]);
});

test("sRGB Canvas fallback labels stay outside the field toolbar at enlarged text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 1300 });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      value(this: HTMLCanvasElement, kind: string, options?: object) {
        return Reflect.apply(original, this, [
          kind,
          kind === "2d" ? { ...options, colorSpace: "srgb" } : options,
        ]);
      },
    });
  });
  const root = await open(page);
  for (const size of [16, 32]) {
    await page.evaluate((size) => (document.documentElement.style.fontSize = `${size}px`), size);
    const legend = root.locator('[data-gp-part="render-status"]');
    await expect(legend).toHaveText("sRGB canvas");
    const box = (await legend.boundingBox())!;
    const toolbar = (await root
      .getByRole("group", { name: "Field viewport", exact: true })
      .boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height);
    await framing(root);
    await page.keyboard.press("Escape");
  }
});

for (const width of [320, 375, 390, 480])
  test(`field toolbar and axis gutters remain usable at ${width}px and enlarged text`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1100 });
    const root = await open(page);
    for (const scale of [1, 2]) {
      await page.evaluate(
        (scale) => (document.documentElement.style.fontSize = `${16 * scale}px`),
        scale,
      );
      const surface = (await root.getByRole("application").boundingBox())!;
      const toolbar = (await root
        .getByRole("group", { name: "Field viewport", exact: true })
        .boundingBox())!;
      expect(toolbar.y).toBeGreaterThanOrEqual(surface.y + surface.height);
      expect(toolbar.x).toBeGreaterThanOrEqual(surface.x - 0.5);
      for (const button of await root.locator('[data-gp-part="viewport-button"]').all()) {
        const box = (await button.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(24);
        expect(box.height).toBeGreaterThanOrEqual(24);
        expect(box.x + box.width).toBeLessThanOrEqual(surface.x + surface.width + 0.5);
      }
      const yAxis = (await root.locator('[data-gp-axis="y"]').boundingBox())!;
      expect(Math.abs(yAxis.y + yAxis.height / 2 - (surface.y + surface.height / 2))).toBeLessThan(
        1,
      );
      expect(yAxis.x + yAxis.width).toBeLessThan(surface.x);
      const popup = await framing(root);
      const box = (await popup.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(8);
      expect(box.x + box.width).toBeLessThanOrEqual(width - 8 + 0.5);
      await page.keyboard.press("Escape");
    }
  });
