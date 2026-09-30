import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function ready(page: Page, query = "") {
  await page.goto(`/e2e/fixtures/selectionShell.html${query}`);
  const root = page.locator("#instrument [data-gp-root]");
  await expect(root.locator('[data-gp-part="surface"]')).toBeVisible();
  return root;
}
function plane(root: Locator) {
  return root.locator('[data-gp-part="surface"]');
}
function menu(root: Locator) {
  return root.getByRole("menu", { name: "Gamut actions" });
}
function command(root: Locator, group: string, name: string) {
  return menu(root)
    .getByRole("group", { name: group })
    .getByRole(group === "Reference" ? "menuitemradio" : "menuitemcheckbox", { name, exact: true });
}
async function open(root: Locator, position = { x: 30, y: 40 }) {
  await plane(root).click({ button: "right", position });
  await expect(menu(root)).toBeVisible();
}
async function events(page: Page) {
  return page.locator("#events").evaluate((element) => ({
    commits: Number(element.getAttribute("data-commits")),
    updates: Number(element.getAttribute("data-updates")),
    cancels: Number(element.getAttribute("data-cancels")),
    requests: Number(element.getAttribute("data-requests")),
    definition: element.getAttribute("data-definition"),
    state: JSON.parse(element.getAttribute("data-state")!),
  }));
}
async function viewportBounds(popup: Locator) {
  const metrics = await popup.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return {
      left: box.left,
      top: box.top,
      right: box.right,
      bottom: box.bottom,
      overflow: element.scrollWidth - element.clientWidth,
      width: innerWidth,
      height: innerHeight,
    };
  });
  expect(metrics.left).toBeGreaterThanOrEqual(8);
  expect(metrics.top).toBeGreaterThanOrEqual(8);
  expect(metrics.right).toBeLessThanOrEqual(metrics.width - 8);
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.height - 8);
  expect(metrics.overflow).toBe(0);
}

test("right-click anchors at the pointer and never authors, moves the marker or shifts layout", async ({
  page,
}) => {
  const root = await ready(page);
  const before = await events(page);
  const marker = root.locator("[data-active-marker]");
  const markerStyle = await marker.getAttribute("style");
  const boxes = [
    await root.boundingBox(),
    await plane(root).boundingBox(),
    await root.getByLabel("Chroma numeric value").boundingBox(),
  ];
  const box = (await plane(root).boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + 30, { button: "right" });
  await expect(menu(root)).toBeVisible();
  const popup = (await menu(root).boundingBox())!;
  expect([popup.x, popup.y]).toEqual([box.x + 20, box.y + 30]);
  await page.keyboard.press("Escape");
  await open(root, { x: 140, y: 90 });
  expect(await events(page)).toEqual(before);
  await expect(marker).toHaveAttribute("style", markerStyle!);
  expect([
    await root.boundingBox(),
    await plane(root).boundingBox(),
    await root.getByLabel("Chroma numeric value").boundingBox(),
  ]).toEqual(boxes);
  await expect(menu(root).getByRole("menuitemradio")).toHaveCount(3);
  await expect(menu(root).getByRole("menuitemcheckbox")).toHaveCount(4);
  await expect(menu(root).getByRole("group")).toHaveCount(3);
  await expect(menu(root).getByRole("separator")).toHaveCount(2);
});

test("native host dismissal synchronizes the menu without reentrant popover calls", async ({
  page,
}) => {
  const root = await ready(page);
  const before = await events(page);
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") warnings.push(message.text());
  });
  await open(root);
  await menu(root).evaluate((element) => (element as HTMLElement).hidePopover());
  await expect(root.locator('[data-gp-part="gamut-context-menu"]')).toBeHidden();
  await open(root);
  await page.keyboard.press("Escape");
  expect(await events(page)).toEqual(before);
  expect(warnings).toEqual([]);
});

for (const key of ["ContextMenu", "Shift+F10"])
  test(`${key} invokes once through contextmenu and uses the stable plane center`, async ({
    page,
  }) => {
    const root = await ready(page);
    const before = await events(page);
    await root.locator('[data-gp-part="gamut-context-menu"]').evaluate((element) => {
      element.setAttribute("data-open-count", "0");
      element.addEventListener("beforetoggle", (event) => {
        if ((event as ToggleEvent).newState === "open")
          element.setAttribute(
            "data-open-count",
            String(Number(element.getAttribute("data-open-count")) + 1),
          );
      });
    });
    await plane(root).focus();
    await page.keyboard.press(key);
    await expect(menu(root)).toBeVisible();
    await expect(menu(root)).toHaveAttribute("data-open-count", "1");
    const box = (await plane(root).boundingBox())!;
    const popup = (await menu(root).boundingBox())!;
    expect([popup.x, popup.y]).toEqual([box.x + box.width / 2, box.y + box.height / 2]);
    await expect(command(root, "Reference", "sRGB")).toBeFocused();
    expect(await events(page)).toEqual(before);
  });

test("roving focus, Home/End, Enter and Space activate one command and restore the plane", async ({
  page,
}) => {
  const root = await ready(page);
  await plane(root).press("ContextMenu");
  for (const [key, group, name] of [
    ["ArrowUp", "Status", "Display P3"],
    ["ArrowDown", "Reference", "sRGB"],
    ["End", "Status", "Display P3"],
    ["Home", "Reference", "sRGB"],
    ["ArrowDown", "Reference", "Display P3"],
  ]) {
    await page.keyboard.press(key!);
    await expect(command(root, group!, name!)).toBeFocused();
    await expect(menu(root).locator('button[tabindex="0"]')).toHaveCount(1);
  }
  await page.keyboard.press("ArrowRight");
  await expect(command(root, "Reference", "Display P3")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu(root)).toBeHidden();
  await expect(plane(root)).toBeFocused();
  expect((await events(page)).requests).toBe(1);
  await plane(root).press("Shift+F10");
  await page.keyboard.press("End");
  await page.keyboard.press("Space");
  await expect(menu(root)).toBeHidden();
  await expect(plane(root)).toBeFocused();
  expect((await events(page)).requests).toBe(2);
});

for (const [group, name, field, expected] of [
  ["Reference", "Display P3", "referenceGamutId", "display-p3-gamut"],
  ["Boundary", "sRGB", "visibleGuides", ["display-p3-boundary"]],
  ["Status", "sRGB", "checkedGamuts", ["display-p3-gamut"]],
] as const)
  test(`${group} changes only its accepted dimension and closes after one request`, async ({
    page,
  }) => {
    const root = await ready(page);
    const before = await events(page);
    await open(root);
    await command(root, group, name).click();
    const after = await events(page);
    expect(after).toEqual({
      ...before,
      requests: 1,
      state: { ...before.state, [field]: expected },
    });
    await expect(menu(root)).toBeHidden();
    await expect(plane(root)).toBeFocused();
    await open(root);
    const inspector = root.getByRole("button", { name: "Gamuts" });
    await inspector.click();
    await expect(menu(root)).toBeHidden();
    await expect(root.getByRole("dialog", { name: "Gamuts" })).toBeVisible();
    if (group === "Reference")
      await expect(root.getByRole("radio", { name, exact: true })).toBeChecked();
    else
      await expect(
        root.getByRole("checkbox", { name: `${name} ${group}`, exact: true }),
      ).not.toBeChecked();
  });

test("Reference is a radio choice: selected is a no-op and None is explicit", async ({ page }) => {
  const root = await ready(page);
  const before = await events(page);
  await open(root);
  await command(root, "Reference", "sRGB").click();
  await expect(menu(root)).toBeHidden();
  expect(await events(page)).toEqual(before);
  await open(root);
  await command(root, "Reference", "None").click();
  const after = await events(page);
  expect(after.state).toEqual({ ...before.state, referenceGamutId: null });
  expect(after.requests).toBe(1);
});

test("controlled rejection remains rejected after reopening each command", async ({ page }) => {
  const root = await ready(page);
  await page.getByRole("button", { name: "Reject requests" }).click();
  const before = await events(page);
  for (const [group, name] of [
    ["Reference", "Display P3"],
    ["Boundary", "sRGB"],
    ["Status", "sRGB"],
  ]) {
    await open(root);
    await command(root, group!, name!).click();
    await expect(menu(root)).toBeHidden();
    await open(root);
    await expect(command(root, "Reference", "sRGB")).toHaveAttribute("aria-checked", "true");
    await expect(command(root, "Boundary", "sRGB")).toHaveAttribute("aria-checked", "true");
    await expect(command(root, "Status", "sRGB")).toHaveAttribute("aria-checked", "true");
    await expect(command(root, "Status", "sRGB")).toHaveAccessibleDescription("Outside");
    await page.keyboard.press("Escape");
  }
  expect(await events(page)).toEqual({ ...before, requests: 3 });
});

test("accepted parent changes reconcile an open menu and become the next action's base", async ({
  page,
}) => {
  const root = await ready(page);
  await open(root);
  await page
    .getByRole("button", { name: "Clear comparison" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(menu(root)).toBeVisible();
  await expect(command(root, "Reference", "None")).toHaveAttribute("aria-checked", "true");
  await expect(command(root, "Status", "sRGB")).toHaveAccessibleDescription("Status off");
  await command(root, "Status", "sRGB").click();
  expect((await events(page)).state).toMatchObject({
    checkedGamuts: ["srgb-gamut"],
    visibleGuides: [],
    referenceGamutId: null,
  });
  expect((await events(page)).requests).toBe(1);
});

test("read-only facts remain inspectable with aria-disabled commands and live color editing", async ({
  page,
}) => {
  const root = await ready(page, "?readonly");
  await open(root);
  await expect(menu(root)).toHaveAccessibleDescription("Read-only");
  for (const button of await menu(root).locator("button").all())
    await expect(button).toHaveAttribute("aria-disabled", "true");
  await expect(command(root, "Reference", "sRGB")).toHaveAttribute("aria-checked", "true");
  await expect(command(root, "Status", "sRGB")).toHaveAccessibleDescription("Outside");
  await expect(command(root, "Status", "Display P3")).toHaveAccessibleDescription("Inside");
  // Disabled ARIA items remain in the menu's arrow sequence so their descriptions are inspectable.
  await page.keyboard.press("End");
  await expect(command(root, "Status", "Display P3")).toBeFocused();
  await page.keyboard.press("Enter");
  await command(root, "Boundary", "sRGB").dispatchEvent("click");
  await expect(menu(root)).toBeVisible();
  expect((await events(page)).requests).toBe(0);
  await page.keyboard.press("Escape");
  await expect(plane(root)).toBeFocused();
  await root.getByLabel("Chroma numeric value").fill("0.1");
  await root.getByLabel("Chroma numeric value").press("Enter");
  expect(await events(page)).toMatchObject({ commits: 1, requests: 0 });
});

test("Coordinates and Gamuts replace the menu in both directions without state", async ({
  page,
}) => {
  const root = await ready(page);
  const before = await events(page);
  const coordinates = root.getByRole("combobox", { name: "Coordinates" });
  const gamuts = root.getByRole("button", { name: "Gamuts" });
  for (const trigger of [coordinates, gamuts]) {
    await trigger.click();
    await trigger.evaluate((button: HTMLButtonElement) => {
      button.setAttribute("data-was-open", button.getAttribute("aria-expanded")!);
    });
    await expect(trigger).toHaveAttribute("data-was-open", "true");
    await open(root);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await trigger.click();
    await expect(menu(root)).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await trigger.press("Escape");
  }
  expect(await events(page)).toEqual(before);
});

test("the test-only Area fixture participates in the same root's popup ownership", async ({
  page,
}) => {
  await ready(page, "?context");
  const root = page.locator("#area-fixture");
  const before = await events(page);
  const area = root.getByRole("combobox", { name: "Area" });
  await area.click();
  await open(root);
  await expect(area).toHaveAttribute("aria-expanded", "false");
  await area.click();
  await expect(menu(root)).toBeHidden();
  await expect(area).toHaveAttribute("aria-expanded", "true");
  await area.press("Escape");
  await expect(page.locator("#area-context")).toHaveText("oklch:test-hc");
  expect(await events(page)).toEqual(before);
});

for (const owner of ["plane", "range"] as const)
  test(`an active ${owner} gesture blocks contextmenu without cancel, commit or queued opening`, async ({
    page,
  }) => {
    const root = await ready(page);
    const control =
      owner === "plane" ? plane(root) : root.getByRole("slider", { name: "Hue", exact: true });
    const box = (await control.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(control).toBeFocused();
    const before = await events(page);
    if (owner === "plane") {
      await page.mouse.down({ button: "right" });
      await page.mouse.up({ button: "right" });
    } else {
      const prevented = await plane(root).evaluate(
        (element) =>
          !element.dispatchEvent(
            new PointerEvent("contextmenu", {
              button: 2,
              pointerType: "mouse",
              bubbles: true,
              cancelable: true,
              clientX: 60,
              clientY: 80,
            }),
          ),
      );
      expect(prevented).toBe(true);
    }
    await expect(menu(root)).toBeHidden();
    await expect(control).toBeFocused();
    expect(await events(page)).toEqual(before);
    await page.mouse.up();
    await expect(menu(root)).toBeHidden();
    expect((await events(page)).commits).toBe(before.commits + 1);
    expect((await events(page)).cancels).toBe(0);
    await open(root);
  });

for (const kind of ["dialog", "popover"] as const)
  test(`Escape closes only the menu inside a nested ${kind}, then the host`, async ({ page }) => {
    await ready(page, "?context");
    const before = await events(page);
    await page.getByRole("button", { name: `Open host ${kind}` }).click();
    const host = kind === "dialog" ? page.locator("dialog") : page.locator("#host-popover");
    await open(host);
    await expect(host).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu(host)).toBeHidden();
    await expect(host).toBeVisible();
    await expect(plane(host)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(host).toBeHidden();
    expect(await events(page)).toEqual(before);
  });

test("outside pointer dismissal preserves intended target focus", async ({ page }) => {
  const root = await ready(page);
  const before = await events(page);
  await open(root);
  const target = root.getByLabel("Hue numeric value");
  await target.click();
  await expect(menu(root)).toBeHidden();
  await expect(target).toBeFocused();
  expect(await events(page)).toEqual(before);
});

test("Tab and Shift+Tab dismiss and continue in normal order from the plane", async ({ page }) => {
  const root = await ready(page);
  const before = await events(page);
  for (const [key, target] of [
    ["Tab", root.getByLabel("Hue numeric value")],
    ["Shift+Tab", root.getByRole("radio", { name: "Edit", exact: true })],
  ] as const) {
    await plane(root).press("ContextMenu");
    await page.keyboard.press(key);
    await expect(menu(root)).toBeHidden();
    await expect(target).toBeFocused();
  }
  expect(await events(page)).toEqual(before);
});

for (const width of [320, 390, 440, 480])
  test(`clamps pointer placement at all viewport corners with ${width}px allocated width`, async ({
    page,
  }) => {
    const root = await ready(page);
    await page.locator("#instrument").evaluate((element, width) => {
      (element as HTMLElement).style.width = `${width}px`;
    }, width);
    // Dispatch tests clamping at viewport points; ordinary pointer anchoring is proved separately.
    for (const [x, y] of [
      [1, 1],
      [1439, 1],
      [1, 999],
      [1439, 999],
    ]) {
      await plane(root).evaluate(
        (element, point) =>
          element.dispatchEvent(
            new MouseEvent("contextmenu", {
              button: 2,
              clientX: point.x,
              clientY: point.y,
              bubbles: true,
              cancelable: true,
            }),
          ),
        { x: x!, y: y! },
      );
      await expect(menu(root)).toBeVisible();
      await viewportBounds(menu(root));
      await page.keyboard.press("Escape");
    }
    expect((await events(page)).requests).toBe(0);
  });

test("320px host near a viewport edge shifts the real right-click overlay inside the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 440 });
  const root = await ready(page);
  await page.locator("#instrument").evaluate((element) => {
    (element as HTMLElement).style.width = "320px";
  });
  const box = (await plane(root).boundingBox())!;
  await open(root, { x: box.width - 5, y: box.height - 5 });
  await viewportBounds(menu(root));
  const popup = (await menu(root).boundingBox())!;
  expect(popup.x).toBeLessThan(box.x + box.width - 5);
  expect(popup.y).toBeLessThan(box.y + box.height - 5);
});

test("200% root text at 320px retains every action without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  const root = await ready(page, "?tolerance");
  await page.locator("#instrument").evaluate((element) => {
    (element as HTMLElement).style.width = "320px";
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await plane(root).press("Shift+F10");
  await viewportBounds(menu(root));
  await expect(command(root, "Status", "sRGB")).toHaveAccessibleDescription("Within tolerance");
  for (const button of await menu(root).locator("button").all()) {
    await button.scrollIntoViewIfNeeded();
    expect(await button.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
  }
  await page.keyboard.press("End");
  await expect(command(root, "Status", "Display P3")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(menu(root)).toBeHidden();
});

test("paused Boundary stays selected, explained and actionable", async ({ page }) => {
  await ready(page, "?context&paused");
  const root = page.locator("#area-fixture");
  await open(root);
  const boundary = command(root, "Boundary", "sRGB");
  await expect(boundary).toHaveAttribute("aria-checked", "true");
  await expect(boundary).toHaveAttribute("aria-disabled", "false");
  await expect(boundary).toHaveAccessibleDescription(
    "Paused: Requested boundary cannot be drawn here.",
  );
  await expect(boundary).toContainText("Paused");
  await boundary.click();
  expect((await events(page)).state.visibleGuides).toEqual(["display-p3-boundary"]);
});

test("forced colors, focus-visible, semantic facts and axe remain usable without live announcements", async ({
  page,
}) => {
  const root = await ready(page);
  await page.emulateMedia({ forcedColors: "active" });
  await plane(root).press("ContextMenu");
  await expect(command(root, "Reference", "sRGB")).toHaveCSS("outline-style", "solid");
  await expect(menu(root)).toHaveCSS("border-top-style", "solid");
  await expect(command(root, "Status", "sRGB")).toHaveAccessibleDescription("Outside");
  const icon = await command(root, "Reference", "sRGB")
    .locator(".gp-gamut-menu-indicator")
    .evaluate((element) => getComputedStyle(element, "::before").content);
  expect(icon).toBe('"●"');
  expect((await new AxeBuilder({ page }).include("#instrument").analyze()).violations).toEqual([]);
  await expect(root.locator("[aria-live]")).toHaveCount(0);
  await expect(menu(root).locator('[role="application"]')).toHaveCount(0);
});

test("native contextmenu events outside the editable plane are left alone", async ({ page }) => {
  const root = await ready(page);
  const before = await events(page);
  for (const target of [
    root.getByLabel("Hue numeric value"),
    root.getByRole("slider", { name: "Hue", exact: true }),
    root.getByRole("combobox", { name: "Coordinates" }),
    root.getByRole("button", { name: "Gamuts" }),
    page.getByRole("button", { name: "Reject requests" }),
  ]) {
    const handled = await target.evaluate(
      (element) =>
        !element.dispatchEvent(
          new MouseEvent("contextmenu", { button: 2, bubbles: true, cancelable: true }),
        ),
    );
    expect(handled).toBe(false);
    await expect(menu(root)).toBeHidden();
  }
  expect(await events(page)).toEqual(before);
});

test("touch-derived contextmenu is ignored and the discoverable Gamuts surface still works", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:4177",
    hasTouch: true,
    viewport: { width: 390, height: 900 },
  });
  try {
    const page = await context.newPage();
    const root = await ready(page);
    const before = await events(page);
    const handled = await plane(root).evaluate(
      (element) =>
        !element.dispatchEvent(
          new PointerEvent("contextmenu", {
            pointerType: "touch",
            button: 2,
            bubbles: true,
            cancelable: true,
          }),
        ),
    );
    expect(handled).toBe(false);
    await expect(menu(root)).toBeHidden();
    expect(await events(page)).toEqual(before);
    await root.getByRole("button", { name: "Gamuts" }).tap();
    await expect(root.getByRole("dialog", { name: "Gamuts" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("numeric draft blur completes once in its original context while node identity and alpha survive", async ({
  page,
}) => {
  const root = await ready(page, "?alpha");
  const nodes = await root
    .locator(
      '[data-gp-part="surface"], [data-gp-part="numeric-input"], [data-gp-part="native-range"]',
    )
    .elementHandles();
  await root.getByLabel("Hue numeric value").fill("123");
  await open(root);
  expect(await events(page)).toMatchObject({ commits: 1, requests: 0 });
  expect(JSON.parse((await events(page)).definition!).channels[2]).toBe(123);
  const definition = (await events(page)).definition;
  for (const [group, name] of [
    ["Status", "sRGB"],
    ["Boundary", "sRGB"],
    ["Reference", "None"],
  ]) {
    if (!(await menu(root).isVisible())) await open(root);
    await command(root, group!, name!).click();
  }
  expect(await events(page)).toMatchObject({ commits: 1, requests: 3, definition });
  await expect(page.locator("#events")).toHaveAttribute("data-context", "oklch:oklch-lc");
  await expect(root.getByLabel("Hue numeric value")).toHaveValue("123.0");
  for (const node of nodes)
    expect(await node.evaluate((element) => element.isConnected)).toBe(true);
  expect(JSON.parse(definition!).alpha).toBe(0.37);
});
