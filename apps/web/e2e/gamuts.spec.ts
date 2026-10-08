import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function ready(page: Page, query = "") {
  await page.goto(`/e2e/fixtures/selectionShell.html${query}`);
  const root = page.locator("#instrument [data-gp-root]");
  await expect(root.locator('[data-gp-part="gamut-trigger"]')).toBeVisible();
  return root;
}
function gamuts(root: Locator) {
  return {
    trigger: root.getByRole("button", { name: "Gamut references" }),
    dialog: root.getByRole("dialog", { name: "Gamut references" }),
    reference: (name: string) =>
      root
        .getByRole("radiogroup", { name: "Reference", includeHidden: true })
        .getByRole("radio", { name, exact: true, includeHidden: true }),
  };
}
async function events(page: Page) {
  const output = page.locator("#events");
  return {
    commits: Number(await output.getAttribute("data-commits")),
    updates: Number(await output.getAttribute("data-updates")),
    requests: Number(await output.getAttribute("data-requests")),
    definition: await output.getAttribute("data-definition"),
  };
}

test("keyboard opens, reaches native controls, toggles and closes only Gamuts", async ({
  page,
}) => {
  const root = await ready(page);
  const { trigger, dialog, reference } = gamuts(root);
  const before = await events(page);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toHaveAccessibleDescription("Reference sRGB, Outside");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(trigger).toBeFocused();
  expect(await events(page)).toEqual(before);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Space");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Tab");
  const status = dialog.getByRole("checkbox", { name: "sRGB Status" });
  await expect(status).toBeFocused();
  await page.keyboard.press("Space");
  await expect(status).not.toBeChecked();
  await expect(trigger).toHaveAccessibleDescription("Reference sRGB, Status off");
  await expect(dialog.getByRole("group", { name: "sRGB" })).toHaveAccessibleDescription(
    "Status off",
  );
  await page.keyboard.press("Space");
  await expect(status).toBeChecked();
  for (const name of ["sRGB Boundary", "Display P3 Status", "Display P3 Boundary"]) {
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("checkbox", { name })).toBeFocused();
  }
  await page.keyboard.press("Tab");
  await expect(reference("sRGB")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(reference("Display P3")).toBeChecked();
  await expect(reference("Display P3")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(reference("None")).toBeChecked();
  await expect(trigger).toHaveAccessibleDescription("No Reference. 1 outside");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect(reference("sRGB")).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  const after = await events(page);
  expect(after.requests).toBe(6);
  expect([after.commits, after.updates, after.definition]).toEqual([
    before.commits,
    before.updates,
    before.definition,
  ]);
});

test("nonmodal Tab order, explicit Close and outside dismissal keep accepted state and focus", async ({
  page,
}) => {
  const root = await ready(page);
  const { trigger, dialog } = gamuts(root);
  await trigger.click();
  await expect(dialog).toBeVisible();
  await trigger.click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(trigger).toBeFocused();
  await expect(dialog).toBeVisible();
  // Leaving the last control continues in host order and closes the surface.
  await dialog.getByRole("radio", { name: "sRGB", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(dialog).toBeHidden();
  await expect(
    page.locator("#area-fixture").getByRole("combobox", { name: "Coordinates" }),
  ).toBeFocused();
  await trigger.click();
  await dialog.getByRole("checkbox", { name: "Display P3 Boundary" }).click();
  await expect(root.locator("[data-gamut-boundary]")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(root.locator("[data-gamut-boundary]")).toHaveCount(1);
  // A tall host lets the surface open below, leaving the direct controls reachable.
  await page.setViewportSize({ width: 1440, height: 1400 });
  await trigger.click();
  const hue = root.getByLabel("Hue numeric value");
  await hue.click();
  await expect(dialog).toBeHidden();
  await expect(hue).toBeFocused();
  await expect(
    root.getByRole("checkbox", { name: "Display P3 Boundary", includeHidden: true }),
  ).not.toBeChecked();
  expect((await events(page)).commits).toBe(0);
});

test("rejected native mutations stay at accepted state in the browser", async ({ page }) => {
  const root = await ready(page);
  const { trigger, dialog, reference } = gamuts(root);
  await page.getByRole("button", { name: "Reject requests" }).click();
  await trigger.click();
  for (const name of ["sRGB Status", "sRGB Boundary"]) {
    await dialog.getByRole("checkbox", { name }).click();
    await expect(dialog.getByRole("checkbox", { name })).toBeChecked();
  }
  await reference("Display P3").click();
  await expect(reference("sRGB")).toBeChecked();
  await expect(reference("Display P3")).not.toBeChecked();
  await dialog.getByRole("checkbox", { name: "Display P3 Status" }).press("Space");
  await expect(dialog.getByRole("checkbox", { name: "Display P3 Status" })).toBeChecked();
  expect((await events(page)).requests).toBe(4);
  await expect(trigger).toHaveAccessibleDescription("Reference sRGB, Outside");
  await page
    .getByRole("button", { name: "Reject requests" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await reference("Display P3").click();
  await expect(reference("Display P3")).toBeChecked();
  await expect(trigger).toHaveAccessibleDescription(
    "Reference Display P3, Inside. 1 other outside",
  );
});

test("opening and comparison changes keep editor nodes; a draft completes once on blur", async ({
  page,
}) => {
  const root = await ready(page);
  const { trigger, dialog, reference } = gamuts(root);
  const nodes = [
    await root.locator('[data-gp-part="surface"]').elementHandle(),
    await root.getByRole("slider", { name: "Hue", exact: true }).elementHandle(),
    await root.getByLabel("Chroma numeric value").elementHandle(),
  ];
  await root.getByLabel("Hue numeric value").fill("123");
  await trigger.click();
  await expect(dialog).toBeVisible();
  expect(await events(page)).toMatchObject({ commits: 1, requests: 0 });
  await expect(page.locator("#events")).toHaveAttribute("data-definition", /123/);
  await expect(page.locator("#events")).toHaveAttribute("data-context", "oklch:oklch-lc");
  await dialog.getByRole("checkbox", { name: "sRGB Status" }).uncheck();
  await dialog.getByRole("checkbox", { name: "sRGB Boundary" }).uncheck();
  await reference("None").check();
  await trigger.click();
  for (const node of nodes)
    expect(await node!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await events(page)).toMatchObject({ commits: 1, requests: 3 });
  await expect(page.locator("#events")).toHaveAttribute("data-context", "oklch:oklch-lc");
  await expect(root.getByLabel("Hue numeric value")).toHaveValue("123.0");
});

test("Coordinates, Area and Gamuts replace each other without state changes", async ({ page }) => {
  const root = await ready(page);
  const { trigger, dialog } = gamuts(root);
  const coordinates = root.getByRole("combobox", { name: "Coordinates" });
  const before = await events(page);
  await coordinates.click();
  await expect(root.getByRole("listbox")).toBeVisible();
  await trigger.click();
  await expect(coordinates).toHaveAttribute("aria-expanded", "false");
  await expect(root.getByRole("listbox")).toBeHidden();
  await expect(dialog).toBeVisible();
  await coordinates.click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(root.getByRole("listbox")).toBeVisible();
  await coordinates.press("Escape");
  expect(await events(page)).toEqual(before);
  const area = page.locator("#area-fixture");
  const areaSelector = area.getByRole("combobox", { name: "Area" });
  const areaGamuts = gamuts(area);
  await page.setViewportSize({ width: 1440, height: 1400 });
  await areaGamuts.trigger.click();
  await expect(areaGamuts.dialog).toBeVisible();
  await areaSelector.click();
  await expect(areaGamuts.dialog).toBeHidden();
  await expect(areaSelector).toHaveAttribute("aria-expanded", "true");
  // The open Area listbox covers the trigger; a direct activation proves shared ownership.
  await areaGamuts.trigger.evaluate((button: HTMLButtonElement) => button.click());
  await expect(areaSelector).toHaveAttribute("aria-expanded", "false");
  await expect(areaGamuts.dialog).toBeVisible();
  await areaGamuts.trigger.press("Escape");
  await expect(areaGamuts.dialog).toBeHidden();
  await expect(page.locator("#area-context")).toHaveText("oklch:test-hc");
  expect(await events(page)).toEqual(before);
});

for (const owner of ["plane", "range"] as const)
  test(`active ${owner} gesture prevents Gamuts from opening or taking focus`, async ({ page }) => {
    const root = await ready(page);
    const { trigger, dialog } = gamuts(root);
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
    await expect(dialog).toBeHidden();
    await expect(control).toBeFocused();
    await page.mouse.up();
    await expect(dialog).toBeHidden();
    await trigger.click();
    await expect(dialog).toBeVisible();
  });

test("nested dialog and popover hosts close Gamuts first, then themselves", async ({ page }) => {
  await ready(page);
  for (const kind of ["dialog", "popover"]) {
    await page.getByRole("button", { name: `Open host ${kind}` }).click();
    const host = kind === "dialog" ? page.locator("dialog") : page.locator("#host-popover");
    const { trigger, dialog } = gamuts(host);
    await trigger.click();
    await expect(dialog).toBeVisible();
    await expect(host).toBeVisible();
    await dialog.getByRole("checkbox", { name: "sRGB Boundary" }).focus();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(host).toBeVisible();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(host).toBeHidden();
  }
  expect((await events(page)).requests).toBe(0);
});

test("touch opens and toggles through comfortable label targets", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4177",
    hasTouch: true,
    viewport: { width: 390, height: 900 },
  });
  const page = await context.newPage();
  const root = await ready(page);
  const { trigger, dialog } = gamuts(root);
  await trigger.tap();
  await expect(dialog).toBeVisible();
  const label = dialog.locator('[data-gp-part="guide-preference"]').first();
  const box = (await label.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(36);
  await label.tap({ position: { x: box.width - 12, y: box.height / 2 } });
  await expect(dialog.getByRole("checkbox", { name: "sRGB Boundary" })).not.toBeChecked();
  await dialog.getByRole("radio", { name: "None" }).tap();
  await expect(dialog.getByRole("radio", { name: "None" })).toBeChecked();
  await dialog.getByRole("button", { name: "Close" }).tap();
  await expect(dialog).toBeHidden();
  expect(await events(page)).toMatchObject({ requests: 2, updates: 0, commits: 0 });
  await context.close();
});

test("read-only state opens for inspection while color editing stays live", async ({ page }) => {
  const root = await ready(page, "?readonly");
  const { trigger, dialog } = gamuts(root);
  await expect(root.getByRole("combobox", { name: "Coordinates" })).toBeDisabled();
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription("Read-only");
  await expect(dialog.getByRole("checkbox")).toHaveCount(4);
  for (const control of await dialog.locator("input").all()) await expect(control).toBeDisabled();
  await expect(dialog.getByRole("checkbox", { name: "sRGB Status" })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "sRGB", exact: true })).toBeChecked();
  await expect(dialog.locator('[data-gp-part="exact-result"]')).toHaveText(["Outside", "Inside"]);
  await dialog.getByText("Boundary").first().click({ force: true });
  expect((await events(page)).requests).toBe(0);
  await root.getByLabel("Chroma numeric value").fill("0.1");
  await root.getByLabel("Chroma numeric value").press("Enter");
  expect((await events(page)).commits).toBe(1);
  await expect(trigger).toHaveAccessibleDescription("Reference sRGB, Inside");
});

test("unavailable analysis stays distinct from Outside", async ({ page }) => {
  const root = await ready(page, "?unavailable");
  const { trigger, dialog } = gamuts(root);
  await expect(trigger).toHaveAccessibleDescription(
    "Reference sRGB, Unavailable. Display P3 unavailable. 2 requested boundaries paused.",
  );
  await expect(trigger.locator('[data-gp-part="gamut-summary"]')).toHaveText(
    "Unavailable · Paused",
  );
  await expect(root.locator("[data-gamut-warning]")).toHaveCount(0);
  await trigger.click();
  await expect(dialog.locator('[data-gp-part="exact-result"]')).toHaveText([
    "Unavailable",
    "Unavailable",
  ]);
  await expect(dialog.locator('[data-gp-status="outside"]')).toHaveCount(0);
});

test("closed trigger keeps a stable box while exact status changes during editing", async ({
  page,
}) => {
  for (const width of [320, 440]) {
    await page.goto("/");
    await page.locator(".instrument-primary").evaluate((element, width) => {
      (element as HTMLElement).style.width = `${width}px`;
    }, width);
    const root = page.locator("[data-gp-root]");
    const { trigger } = gamuts(root);
    const plane = root.locator('[data-gp-part="surface"]');
    const boxes: number[][] = [];
    for (const [hue, lightness, chroma, text] of [
      ["252", "0.68", "0.03", "Reference sRGB, Inside"],
      ["252", "0.68", "0.24", "Reference sRGB, Outside. 1 other outside"],
      ["194.76895989787468", "0.5415923764146119", "0.09244884602706227", "Within tolerance"],
    ] as const) {
      for (const [label, value] of [
        ["Hue", hue],
        ["Lightness", lightness],
        ["Chroma", chroma],
      ] as const) {
        await root.getByLabel(`${label} numeric value`).fill(value);
        await root.getByLabel(`${label} numeric value`).press("Enter");
      }
      await expect(trigger).toHaveAccessibleDescription(new RegExp(text));
      const box = (await trigger.boundingBox())!;
      const field = (await plane.boundingBox())!;
      boxes.push([box.y, box.height, field.y]);
    }
    expect(new Set(boxes.map((box) => box.join())).size).toBe(1);
  }
});

test("enlarged text keeps the open surface complete without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".instrument-primary").evaluate((element) => {
    (element as HTMLElement).style.width = "320px";
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const root = page.locator("[data-gp-root]");
  const { trigger, dialog } = gamuts(root);
  await trigger.click();
  await expect(dialog).toBeVisible();
  const metrics = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      overflow: element.scrollWidth - element.clientWidth,
      top: box.top,
      bottom: box.bottom,
      right: box.right,
      viewport: [innerWidth, innerHeight],
    };
  });
  expect(metrics.overflow).toBeLessThanOrEqual(0);
  expect(metrics.top).toBeGreaterThanOrEqual(0);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewport[1]!);
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewport[0]!);
  const surface = (await dialog.boundingBox())!;
  for (const label of await dialog.locator("label").all()) {
    const box = (await label.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(surface.x);
    expect(box.x + box.width).toBeLessThanOrEqual(surface.x + surface.width);
  }
  await dialog.getByRole("radio", { name: "Display P3" }).scrollIntoViewIfNeeded();
  await dialog.getByRole("radio", { name: "Display P3" }).check();
  await expect(trigger).toHaveAccessibleDescription(/Reference Display P3/);
});

test("open surface accessibility, forced colors and no live-region spam", async ({ page }) => {
  const root = await ready(page);
  const { trigger, dialog, reference } = gamuts(root);
  await trigger.click();
  await dialog.getByRole("checkbox", { name: "sRGB Status" }).focus();
  expect((await new AxeBuilder({ page }).include("#instrument").analyze()).violations).toEqual([]);
  expect(await root.locator("[aria-live]").count()).toBe(0);
  expect(await root.locator("[role=application]").count()).toBe(1);
  await expect(dialog.locator('[role="application"]')).toHaveCount(0);
  await page.emulateMedia({ forcedColors: "active" });
  const selected = reference("sRGB").locator("xpath=following-sibling::span");
  await expect(selected).toHaveCSS("border-top-style", "solid");
  expect(await selected.evaluate((element) => getComputedStyle(element).borderTopColor)).not.toBe(
    await reference("None")
      .locator("xpath=following-sibling::span")
      .evaluate((element) => getComputedStyle(element).borderTopColor),
  );
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("checkbox", { name: "sRGB Boundary" })).toHaveCSS(
    "outline-style",
    "solid",
  );
  await expect(dialog).toHaveCSS("border-top-style", "solid");
});
