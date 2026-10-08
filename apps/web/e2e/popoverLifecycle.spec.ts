import { expect, test, type Locator, type Page } from "@playwright/test";

function diagnostics(page: Page) {
  const messages: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") messages.push(message.text());
  });
  page.on("pageerror", (error) => messages.push(error.message));
  return messages;
}

async function ready(page: Page) {
  await page.goto("/e2e/fixtures/selectionShell.html?context");
  const root = page.locator("#area-fixture");
  await expect(root.getByRole("combobox", { name: "Area" })).toBeVisible();
  return root;
}

function popups(root: Locator) {
  return [
    ...["Coordinates", "Area"].map((name) => ({
      trigger: root.getByRole("combobox", { name, includeHidden: true }),
      surface: root.getByRole("listbox", { name, includeHidden: true }),
    })),
    {
      trigger: root.getByRole("button", {
        name: "Gamut references",
        exact: true,
        includeHidden: true,
      }),
      surface: root.getByRole("dialog", { name: "Gamut references", includeHidden: true }),
    },
    {
      trigger: root.locator('[data-gp-part="surface"]'),
      surface: root.getByRole("menu", { name: "Gamut actions", includeHidden: true }),
    },
  ];
}

async function openPopup(popup: ReturnType<typeof popups>[number], input = "pointer") {
  const { trigger, surface } = popup;
  const menu = (await trigger.getAttribute("data-gp-part")) === "surface";
  if (input === "programmatic")
    await trigger.evaluate((element) => {
      if (element.getAttribute("data-gp-part") === "surface")
        element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      else (element as HTMLButtonElement).click();
    });
  else if (menu) {
    // Invoke from the field's far edge so the compact Coordinates trigger stays physically
    // reachable during pointer replacement. A menu may legitimately cover a nearby trigger.
    const box = (await trigger.boundingBox())!;
    await trigger.click({ button: "right", position: { x: box.width - 8, y: box.height - 8 } });
  } else {
    // Compact selectors can sit beside a popup that covers the trigger's centre. Exercise a
    // genuinely reachable pointer target rather than forcing an event through that popup.
    await trigger.scrollIntoViewIfNeeded();
    const position = await trigger.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const y = box.top + box.height / 2;
      for (const x of [box.left + 8, box.right - 8, box.left + box.width / 2]) {
        const hit = element.ownerDocument.elementFromPoint(x, y);
        if (hit && element.contains(hit)) return { x: x - box.left, y: y - box.top };
      }
      return undefined;
    });
    expect(position, "the trigger has an uncovered pointer target").toBeDefined();
    await trigger.click({ position });
  }
  await expect(surface).toBeVisible();
  if (menu)
    await expect(surface.getByRole("menuitemradio", { name: "sRGB", exact: true })).toBeFocused();
  else await expect(trigger).toBeFocused();
}

test("normal selector and references dismissal does not warn or reopen on the same press", async ({
  page,
}) => {
  const messages = diagnostics(page);
  const root = await ready(page);
  const context = await page.locator("#area-context").textContent();
  for (const { trigger, surface } of popups(root).slice(0, 3)) {
    await trigger.click();
    await expect(surface).toBeVisible();
    await trigger.click();
    await expect(surface).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toBeFocused();
    await trigger.press("Enter");
    await expect(surface).toBeVisible();
    await trigger.press("Escape");
    await expect(surface).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await trigger.press("Tab");
    // Selectors resume normal tab order; references keep their native controls reachable.
    if ((await trigger.getAttribute("role")) === "combobox") await expect(surface).toBeHidden();
    else {
      await expect(surface.getByRole("button", { name: "Close", exact: true })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    }
    await trigger.click();
    await page.getByRole("button", { name: "Reject requests" }).click();
    await expect(surface).toBeHidden();
    await expect(page.getByRole("button", { name: "Reject requests" })).toBeFocused();
  }
  await expect(page.locator("#area-context")).toHaveText(context!);
  await expect(page.locator("#events")).toHaveAttribute("data-requests", "0");
  expect(messages).toEqual([]);
});

test("selector activation and nonmodal reference controls remain usable without warnings", async ({
  page,
}) => {
  const messages = diagnostics(page);
  await ready(page);
  const root = page.locator("#instrument [data-gp-root]");
  const selector = root.getByRole("combobox", { name: "Coordinates" });
  const definition = await page.locator("#events").getAttribute("data-definition");
  await selector.click();
  await selector.press("s");
  await selector.press("Enter");
  await expect(selector).toContainText("sRGB");
  await expect(selector).toBeFocused();
  await expect(page.locator("#events")).toHaveAttribute("data-requests", "1");
  const references = root.getByRole("button", { name: "Gamut references", exact: true });
  await references.click();
  await root.getByRole("checkbox", { name: "sRGB Status", exact: true }).uncheck();
  await expect(root.getByRole("dialog", { name: "Gamut references" })).toBeVisible();
  await root.getByRole("button", { name: "Close", exact: true }).click();
  await expect(references).toBeFocused();
  await expect(references).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#events")).toHaveAttribute("data-definition", definition!);
  await expect(page.locator("#events")).toHaveAttribute("data-updates", "0");
  await expect(page.locator("#events")).toHaveAttribute("data-commits", "0");
  expect(messages).toEqual([]);
});

test("native dismissal synchronizes all popup owners before immediate replacement", async ({
  page,
}) => {
  const messages = diagnostics(page);
  const root = await ready(page);
  const surfaces = popups(root);
  for (const [index, { trigger, surface }] of surfaces.entries()) {
    await openPopup(surfaces[index]!, "programmatic");
    // Replace in the same task: the closing beforetoggle must release the owner immediately.
    const next = surfaces[(index + 1) % surfaces.length]!;
    await surface.evaluate(
      (element, nextTrigger) => {
        (element as HTMLElement).hidePopover();
        if (nextTrigger!.getAttribute("data-gp-part") === "surface")
          nextTrigger!.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
          );
        else (nextTrigger as HTMLButtonElement).click();
      },
      await next.trigger.elementHandle(),
    );
    await expect(surface).toBeHidden();
    if (index < 3) await expect(trigger).toHaveAttribute("aria-expanded", "false");
    if (index < 2) await expect(trigger).not.toHaveAttribute("aria-activedescendant");
    await expect(surface.locator("[data-highlighted]")).toHaveCount(0);
    await expect(next.surface).toBeVisible();
    await expect(root.locator(":popover-open")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(next.surface).toBeHidden();
  }
  await expect(page.locator("#events")).toHaveAttribute("data-requests", "0");
  expect(messages).toEqual([]);
});

for (const input of ["pointer", "programmatic"] as const)
  for (const [from, owner] of [
    "Coordinates",
    "Area",
    "Gamut references",
    "Gamut actions",
  ].entries())
    test(`${input} transitions from ${owner} retain one owner without warnings`, async ({
      page,
    }) => {
      const messages = diagnostics(page);
      // Leave room for the context menu below the fixture field. Viewport
      // clamping is covered separately; this matrix needs physically reachable replacement triggers.
      await page.setViewportSize({ width: 1440, height: 1600 });
      const root = await ready(page);
      await root.locator('[data-gp-part="surface"]').evaluate((element) => {
        // The shell-only fixture's 96px square can be entirely covered by a disclosure. Give this
        // replacement matrix an exposed field target, as a real editing field provides.
        (element as HTMLElement).style.cssText = "width:100%;height:320px";
      });
      const surfaces = popups(root);
      for (let to = 0; to < surfaces.length; to++) {
        if (from === to) continue;
        await openPopup(surfaces[from]!, input);
        await openPopup(surfaces[to]!, input);
        await expect(surfaces[from]!.surface).toBeHidden();
        if (from < 3)
          await expect(surfaces[from]!.trigger).toHaveAttribute("aria-expanded", "false");
        await expect(root.locator(":popover-open")).toHaveCount(1);
        await page.keyboard.press("Escape");
        await expect(surfaces[to]!.surface).toBeHidden();
      }
      await expect(page.locator("#events")).toHaveAttribute("data-requests", "0");
      await expect(page.locator("#area-context")).toHaveText("oklch:test-hc");
      expect(messages).toEqual([]);
    });

test("closing a native host popover synchronizes its nested selectors and references", async ({
  page,
}) => {
  const messages = diagnostics(page);
  await ready(page);
  const host = page.locator("#host-popover");
  const root = host.locator("[data-gp-root]");
  for (const { trigger, surface } of popups(root).slice(0, 3)) {
    await page.getByRole("button", { name: "Open host popover" }).click();
    await trigger.click();
    await expect(surface).toBeVisible();
    await expect(host).toBeVisible();
    await trigger.press("Escape");
    await expect(surface).toBeHidden();
    await expect(host).toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await host.evaluate((element) => (element as HTMLElement).hidePopover());
    await expect(host).toBeHidden();
    await expect(surface).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(root.locator(":popover-open")).toHaveCount(0);
  }
  await expect(page.locator("#events")).toHaveAttribute("data-requests", "0");
  expect(messages).toEqual([]);
});
