import { expect, test, type Locator, type Page } from "@playwright/test";

interface Counts {
  updates: number;
  commits: number;
  cancels: number;
  requests: number;
  definition: string;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function open(page: Page, query = "alpha"): Promise<void> {
  await page.goto(`/e2e/fixtures/selectionShell.html?${query}`);
  await expect(page.locator("#instrument [data-gp-part='surface']")).toBeVisible();
  await expect(page.locator("#instrument [data-render-color-space]")).not.toHaveAttribute(
    "data-render-color-space",
    "pending",
  );
}

const plane = (page: Page) => page.locator("#instrument [data-gp-part='plane']");
const surface = (page: Page) => page.locator("#instrument [data-gp-part='surface']");
const status = (page: Page) => page.locator("#instrument [data-gp-part='viewport-status']");

async function counts(page: Page): Promise<Counts> {
  const events = page.locator("#events");
  return {
    updates: Number(await events.getAttribute("data-updates")),
    commits: Number(await events.getAttribute("data-commits")),
    cancels: Number(await events.getAttribute("data-cancels")),
    requests: Number(await events.getAttribute("data-requests")),
    definition: (await events.getAttribute("data-definition"))!,
  };
}

/** Two animation frames: enough for a coalesced camera frame to have been presented. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

/** The surface's content box: fractions of it are viewport fractions, borders excluded. */
async function content(locator: Locator): Promise<Rect> {
  const outer = await locator.boundingBox();
  expect(outer).not.toBeNull();
  const border = await locator.evaluate((element) => element.clientLeft);
  return {
    x: outer!.x + border,
    y: outer!.y + border,
    width: outer!.width - border * 2,
    height: outer!.height - border * 2,
  };
}

/** Pointer pixels are whole numbers; report the viewport fraction actually used. */
function pixel(field: Rect, fx: number, fy: number) {
  const x = Math.round(field.x + field.width * fx);
  const y = Math.round(field.y + field.height * fy);
  return { x, y, qx: (x - field.x) / field.width, qy: (y - field.y) / field.height };
}

async function zoomOf(page: Page): Promise<number> {
  return Number(await plane(page).getAttribute("data-gp-viewport-zoom"));
}

async function ends(page: Page): Promise<Record<string, string>> {
  return plane(page)
    .locator("[data-gp-part='axis-end']")
    .evaluateAll((nodes) =>
      Object.fromEntries(
        nodes.map((node) => [(node as HTMLElement).dataset.gpEnd!, node.textContent!]),
      ),
    );
}

/** Alt/Option plus wheel at a fraction of the surface. Two bounded events make exactly 2x. */
async function altWheel(
  page: Page,
  fx: number,
  fy: number,
  deltas: number[],
  modifier: "Alt" | "Control" | "Meta" | null = "Alt",
): Promise<void> {
  const at = pixel(await content(surface(page)), fx, fy);
  await page.mouse.move(at.x, at.y);
  if (modifier) await page.keyboard.down(modifier);
  for (const delta of deltas) await page.mouse.wheel(0, delta);
  if (modifier) await page.keyboard.up(modifier);
  await settle(page);
}

const chroma = (page: Page) => page.getByLabel("Chroma numeric value");
const lightness = (page: Page) => page.getByLabel("Lightness numeric value");
const valueOf = (input: Locator) => async () => Number(await input.inputValue());

test("Alt-wheel anchors at an off-center pointer without authoring color", async ({ page }) => {
  await open(page);
  const before = await counts(page);
  expect(await zoomOf(page)).toBe(1);
  const at = pixel(await content(surface(page)), 0.8, 0.3);
  await altWheel(page, 0.8, 0.3, [-240, -240]);
  expect(await zoomOf(page)).toBeCloseTo(2, 9);
  // Independent arithmetic: center = anchor - (anchor - 0.5) / 2, window = center -/+ 0.25.
  const cx = at.qx - (at.qx - 0.5) / 2;
  const cy = at.qy - (at.qy - 0.5) / 2;
  const shown = await ends(page);
  expect(Number(shown["x-start"])).toBeCloseTo(0.4 * (cx - 0.25), 3);
  expect(Number(shown["x-end"])).toBeCloseTo(0.4 * (cx + 0.25), 3);
  expect(Number(shown["y-end"])).toBeCloseTo(1 - (cy - 0.25), 3);
  expect(Number(shown["y-start"])).toBeCloseTo(1 - (cy + 0.25), 3);
  const viewBox = (await plane(page)
    .locator("[data-gp-part='gamut-guides']")
    .getAttribute("viewBox"))!
    .split(" ")
    .map(Number);
  expect(viewBox[0]).toBeCloseTo((cx - 0.25) * 1000, 2);
  expect(viewBox[1]).toBeCloseTo((cy - 0.25) * 1000, 2);
  expect(viewBox[2]).toBeCloseTo(500, 6);
  await expect(plane(page).locator("[data-gp-part='viewport-zoom']")).toHaveText("200%");
  expect(await counts(page)).toEqual(before);
});

test("ordinary wheel and browser zoom chords are left to the browser", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const log: boolean[] = [];
    (window as unknown as { wheelLog: boolean[] }).wheelLog = log;
    window.addEventListener("wheel", (event) => log.push(event.defaultPrevented));
  });
  await altWheel(page, 0.5, 0.5, [-120], null);
  await altWheel(page, 0.5, 0.5, [-120], "Control");
  expect(await zoomOf(page)).toBe(1);
  const prevented = await page.evaluate(
    () => (window as unknown as { wheelLog: boolean[] }).wheelLog,
  );
  expect(prevented.length).toBeGreaterThan(0);
  expect(prevented.every((value) => value === false)).toBe(true);
  // Alt-wheel is claimed and consumed.
  await altWheel(page, 0.5, 0.5, [-120]);
  const final = await page.evaluate(() =>
    (window as unknown as { wheelLog: boolean[] }).wheelLog.at(-1),
  );
  expect(final).toBe(true);
  expect(await zoomOf(page)).toBeGreaterThan(1);
});

test("editing under zoom maps through the inverse camera, never the visible window", async ({
  page,
}) => {
  await open(page);
  await altWheel(page, 0.5, 0.5, [-240, -240]);
  expect(await zoomOf(page)).toBeCloseTo(2, 9);
  const field = await content(surface(page));
  // Viewport (0.25, 0.75) at centered 2x is field (0.375, 0.625): C 0.15, L 0.375.
  const click = pixel(field, 0.25, 0.75);
  await page.mouse.click(click.x, click.y);
  const fieldX = 0.5 + (click.qx - 0.5) / 2;
  const fieldY = 0.5 + (click.qy - 0.5) / 2;
  await expect.poll(valueOf(chroma(page))).toBeCloseTo(0.4 * fieldX, 3);
  await expect.poll(valueOf(lightness(page))).toBeCloseTo(1 - fieldY, 3);
  const marker = (await surface(page).locator("[data-active-marker]").boundingBox())!;
  expect(Math.abs(marker.x + marker.width / 2 - click.x)).toBeLessThan(1);
  expect(Math.abs(marker.y + marker.height / 2 - click.y)).toBeLessThan(1);
  // A captured drag beyond the surface stays in the larger field: not clamped to the window.
  const start = pixel(field, 0.5, 0.5);
  const far = pixel(field, 1.2, 0.5);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(far.x, far.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(valueOf(chroma(page))).toBeCloseTo(0.4 * (0.5 + (far.qx - 0.5) / 2), 3);
  // Chroma 0.34 is beyond the visible maximum of 0.3.
  expect(Number(await chroma(page).inputValue())).toBeGreaterThan(0.31);
  await expect.poll(valueOf(lightness(page))).toBeCloseTo(0.5, 2);
  expect(await zoomOf(page)).toBeCloseTo(2, 9);
});

test("middle-button pan moves the view and never authors color", async ({ page }) => {
  await open(page);
  await altWheel(page, 0.5, 0.5, [-240, -240]);
  const before = await counts(page);
  const field = await content(surface(page));
  const start = pixel(field, 0.5, 0.5);
  const end = pixel(field, 0.7, 0.5);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up({ button: "middle" });
  await settle(page);
  // Content followed the pointer right by dq viewport = dq / 2 field: window [0.25, 0.75] - dq / 2.
  const shift = (end.qx - start.qx) / 2;
  const shown = await ends(page);
  expect(Number(shown["x-start"])).toBeCloseTo(0.4 * (0.25 - shift), 3);
  expect(Number(shown["x-end"])).toBeCloseTo(0.4 * (0.75 - shift), 3);
  expect(await counts(page)).toEqual(before);
  // Editing still works afterwards, against the new pose: the view center is field 0.5 - shift.
  await page.mouse.click(start.x, start.y);
  await expect.poll(valueOf(chroma(page))).toBeCloseTo(0.4 * (0.5 - shift), 3);
});

test("Space plus primary drag pans and the button release does not edit", async ({ page }) => {
  await open(page);
  await altWheel(page, 0.5, 0.5, [-240, -240]);
  const before = await counts(page);
  const field = await content(surface(page));
  await surface(page).focus();
  await page.keyboard.down("Space");
  const start = pixel(field, 0.5, 0.5);
  const end = pixel(field, 0.5, 0.7);
  const wander = pixel(field, 0.9, 0.9);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.keyboard.up("Space");
  // Pan ended with Space; the rest of the physical sequence is inert.
  await page.mouse.move(wander.x, wander.y, { steps: 3 });
  await page.mouse.up();
  await settle(page);
  const shift = (end.qy - start.qy) / 2;
  const shown = await ends(page);
  expect(Number(shown["y-end"])).toBeCloseTo(1 - (0.25 - shift), 3);
  expect(Number(shown["y-start"])).toBeCloseTo(1 - (0.75 - shift), 3);
  expect(await counts(page)).toEqual(before);
});

test("Fit restores the whole field and Escape while idle does not reset", async ({ page }) => {
  await open(page);
  await altWheel(page, 0.2, 0.8, [-240, -240]);
  expect(await zoomOf(page)).toBeGreaterThan(1);
  await surface(page).focus();
  await page.keyboard.press("Escape");
  await settle(page);
  expect(await zoomOf(page)).toBeGreaterThan(1);
  const fit = page.getByRole("button", { name: "Fit editor field to view" });
  await fit.click();
  await settle(page);
  expect(await zoomOf(page)).toBe(1);
  expect(await ends(page)).toEqual({
    "x-start": "0",
    "x-end": "0.4",
    "y-start": "0",
    "y-end": "1",
  });
  await expect(plane(page).locator("[data-gp-part='gamut-guides']")).toHaveAttribute(
    "viewBox",
    "0 0 1000 1000",
  );
  await expect(fit).toHaveAttribute("aria-disabled", "true");
});

test("keyboard zoom, Fit and Space-arrow pan keep the editor keys intact", async ({ page }) => {
  await open(page);
  await surface(page).focus();
  const before = await counts(page);
  await page.keyboard.press("+");
  await settle(page);
  expect(await zoomOf(page)).toBeCloseTo(1.25, 9);
  await expect(plane(page).locator("[data-gp-part='viewport-zoom']")).toHaveText("125%");
  await page.keyboard.press("-");
  await settle(page);
  expect(await zoomOf(page)).toBe(1);
  for (let index = 0; index < 4; index += 1) await page.keyboard.press("+");
  await settle(page);
  expect(await zoomOf(page)).toBeCloseTo(1.25 ** 4, 5);
  // Space+ArrowRight pans the camera right: the visible chroma range increases.
  const range = await ends(page);
  await page.keyboard.down("Space");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Space");
  await settle(page);
  expect(Number((await ends(page))["x-start"])).toBeGreaterThan(Number(range["x-start"]));
  expect(await counts(page)).toEqual(before);
  await page.keyboard.press("0");
  await settle(page);
  expect(await zoomOf(page)).toBe(1);
  // Without Space, arrows still author color.
  await page.keyboard.press("ArrowRight");
  expect((await counts(page)).commits).toBe(before.commits + 1);
});

test("a selection hidden by the camera is explained without moving it", async ({ page }) => {
  await open(page);
  // The fixture's selected color is at chroma 0.18 / lightness 0.68; zoom into the opposite corner.
  await altWheel(page, 0.97, 0.97, Array(8).fill(-240));
  expect(await zoomOf(page)).toBe(8);
  await expect(status(page)).toContainText("outside the visible region");
  await expect(surface(page)).toHaveAttribute("data-outside-instrument", "false");
  await page.getByRole("button", { name: "Fit editor field to view" }).click();
  await settle(page);
  await expect(status(page)).not.toContainText("outside the visible region");
});

test("an unpresented zoom is discarded when a pointer gesture begins", async ({ page }) => {
  await open(page);
  const field = await content(surface(page));
  const center = pixel(field, 0.5, 0.5);
  await page.mouse.move(center.x, center.y);
  // Hold animation frames so the wheel request stays unpresented.
  await page.evaluate(() => {
    const held: FrameRequestCallback[] = [];
    const state = window as unknown as {
      heldFrames: FrameRequestCallback[];
      realFrame: typeof requestAnimationFrame;
    };
    state.heldFrames = held;
    state.realFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      held.push(callback);
      return held.length;
    };
  });
  await page.keyboard.down("Alt");
  await page.mouse.wheel(0, -240);
  await page.keyboard.up("Alt");
  const click = pixel(field, 0.25, 0.25);
  await page.mouse.move(click.x, click.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.evaluate(() => {
    const state = window as unknown as {
      heldFrames: FrameRequestCallback[];
      realFrame: typeof requestAnimationFrame;
    };
    window.requestAnimationFrame = state.realFrame;
    for (const callback of state.heldFrames.splice(0)) callback(performance.now());
  });
  await settle(page);
  // The click was interpreted at the presented 1x pose: viewport (0.25, 0.25) -> C 0.1, L 0.75.
  await expect.poll(valueOf(chroma(page))).toBeCloseTo(0.4 * click.qx, 3);
  await expect.poll(valueOf(lightness(page))).toBeCloseTo(1 - click.qy, 3);
  // And the discarded request never appeared afterwards.
  expect(await zoomOf(page)).toBe(1);
});

test("the pose survives resize and the field keeps its square", async ({ page }) => {
  await open(page);
  await altWheel(page, 0.5, 0.5, [-240, -240]);
  const rangeBefore = await ends(page);
  await page.setViewportSize({ width: 360, height: 900 });
  await settle(page);
  expect(await ends(page)).toEqual(rangeBefore);
  expect(await zoomOf(page)).toBeCloseTo(2, 9);
  const field = await content(surface(page));
  expect(Math.abs(field.width - field.height)).toBeLessThan(1);
});

test("an ancestor scroll during pan preserves the grabbed field point", async ({ page }) => {
  await open(page);
  await page.locator("#instrument").evaluate((element) => {
    const scroller = document.createElement("div");
    scroller.id = "pan-scroll-host";
    scroller.style.cssText = "height:600px;overflow:auto";
    element.before(scroller);
    scroller.append(element);
    const spacer = document.createElement("div");
    spacer.style.height = "600px";
    scroller.append(spacer);
  });
  await settle(page);
  await altWheel(page, 0.5, 0.5, [-240, -240]);
  const before = await counts(page);
  const field = await content(surface(page));
  const start = pixel(field, 0.5, 0.5);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "middle" });
  await page.locator("#pan-scroll-host").evaluate((element) => {
    element.scrollTop = 40;
  });
  await expect.poll(async () => (await content(surface(page))).y).toBeCloseTo(field.y - 40, 5);
  // A captured movement at almost the same client position must use the newly scrolled box.
  await page.mouse.move(start.x + 1, start.y);
  await page.mouse.up({ button: "middle" });
  await settle(page);
  const moved = await content(surface(page));
  const dx = ((start.x + 1 - moved.x) / moved.width - start.qx) / 2;
  const dy = ((start.y - moved.y) / moved.height - start.qy) / 2;
  const shown = await ends(page);
  expect(Number(shown["x-start"])).toBeCloseTo(0.4 * (0.25 - dx), 3);
  expect(Number(shown["y-end"])).toBeCloseTo(1 - (0.25 - dy), 3);
  expect(await counts(page)).toEqual(before);
});

test("the OKLab disc outline moves with the field and stays a disc", async ({ page }) => {
  await open(page, "lab");
  const root = page.locator("#instrument [data-gp-root]");
  await root.getByRole("combobox", { name: "Coordinates" }).click();
  await root.locator('[role="option"][data-value="oklab"]').click();
  const outline = plane(page).locator("[data-gp-part='domain-boundary']");
  await expect(outline).toHaveCount(1);
  const field = await content(surface(page));
  const fitted = (await outline.boundingBox())!;
  expect(fitted.width).toBeCloseTo(field.width, 0);
  await altWheel(page, 0.5, 0.5, [-240, -240]);
  const zoomed = (await outline.boundingBox())!;
  expect(zoomed.width).toBeCloseTo(field.width * 2, 0);
  expect(zoomed.height).toBeCloseTo(field.height * 2, 0);
  expect(await ends(page)).toEqual({
    "x-start": "-0.2",
    "x-end": "0.2",
    "y-start": "-0.2",
    "y-end": "0.2",
  });
});

test.describe("every native RGB field", () => {
  for (const space of ["srgb", "display-p3"] as const) {
    for (const area of ["R / G", "R / B", "G / B"]) {
      test(`${space} ${area} zooms, labels visible ranges and edits at 2x`, async ({ page }) => {
        await open(page);
        const root = page.locator("#instrument [data-gp-root]");
        await root.getByRole("combobox", { name: "Coordinates" }).click();
        await root.locator(`[role="option"][data-value="${space}"]`).click();
        await root.getByRole("combobox", { name: "Area" }).click();
        await root.locator('[role="option"]', { hasText: area }).first().click();
        await altWheel(page, 0.5, 0.5, [-240, -240]);
        expect(await zoomOf(page)).toBeCloseTo(2, 9);
        expect(await ends(page)).toEqual({
          "x-start": "0.25",
          "x-end": "0.75",
          "y-start": "0.25",
          "y-end": "0.75",
        });
        const click = pixel(await content(surface(page)), 0.25, 0.75);
        await page.mouse.click(click.x, click.y);
        const after = JSON.parse((await counts(page)).definition) as {
          space: string;
          channels: number[];
        };
        expect(after.space).toBe(space);
        // Viewport (0.25, 0.75) at centered 2x is field (0.375, 0.625): both varying channels 0.375.
        const target = 0.5 + (click.qx - 0.5) / 2;
        const matching = after.channels.filter((value) => Math.abs(value - target) < 0.004);
        expect(matching.length).toBeGreaterThanOrEqual(2);
      });
    }
  }
});

test("viewport controls are native buttons and keep focus while they update", async ({ page }) => {
  await open(page);
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  await zoomIn.focus();
  for (let index = 0; index < 12; index += 1) await zoomIn.click({ force: true });
  await settle(page);
  expect(await zoomOf(page)).toBe(8);
  await expect(zoomIn).toHaveAttribute("aria-disabled", "true");
  await expect(zoomIn).toBeFocused();
  await expect(page.getByRole("button", { name: "Zoom out" })).not.toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("a CSS-scaled host keeps zoom anchoring and editing correct", async ({ page }) => {
  await open(page);
  await page.locator("#instrument").evaluate((element) => {
    element.style.transform = "scale(0.8)";
    element.style.transformOrigin = "top left";
  });
  await settle(page);
  // Content box under an outer scale: the bounding box shrinks with it.
  const scaled = await content(surface(page));
  const outer = (await surface(page).boundingBox())!;
  expect(outer.width).toBeLessThan(400);
  await altWheel(page, 0.5, 0.5, [-240, -240]);
  expect(await zoomOf(page)).toBeCloseTo(2, 5);
  const click = pixel(scaled, 0.25, 0.75);
  await page.mouse.click(click.x, click.y);
  const fieldX = 0.5 + (click.qx - 0.5) / 2;
  await expect.poll(valueOf(chroma(page))).toBeCloseTo(0.4 * fieldX, 2);
});

test("a hidden surface claims no input and recovers without stale or non-finite state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await open(page);
  await altWheel(page, 0.5, 0.5, [-240, -240]);
  const zoomed = await zoomOf(page);
  const prevented = await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("#instrument")!;
    const field = host.querySelector<HTMLElement>("[data-gp-part='surface']")!;
    host.style.display = "none";
    const wheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      altKey: true,
      deltaY: -240,
      clientX: 10,
      clientY: 10,
    });
    field.dispatchEvent(wheel);
    return wheel.defaultPrevented;
  });
  expect(prevented).toBe(false);
  await page.locator("#instrument").evaluate((element) => (element.style.display = ""));
  await settle(page);
  expect(await zoomOf(page)).toBe(zoomed);
  const marker = (await surface(page).locator("[data-active-marker]").boundingBox())!;
  expect(Number.isFinite(marker.x) && Number.isFinite(marker.y)).toBe(true);
  // Input works again against the preserved pose.
  const field = await content(surface(page));
  const click = pixel(field, 0.5, 0.5);
  await page.mouse.click(click.x, click.y);
  await expect.poll(valueOf(chroma(page))).toBeCloseTo(0.2, 2);
  expect(errors).toEqual([]);
});

for (const [width, scale] of [
  [320, "100%"],
  [320, "200%"],
  [480, "100%"],
] as const) {
  test(`zoomed axis labels stay out of the field at ${width}px and ${scale} text`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await open(page, "lab");
    await page.evaluate((fontSize) => {
      document.documentElement.style.fontSize = fontSize;
    }, scale);
    const root = page.locator("#instrument [data-gp-root]");
    await root.getByRole("combobox", { name: "Coordinates" }).click();
    await root.locator('[role="option"][data-value="oklab"]').click();
    // Eight times in: ranges such as -0.136 need the most characters.
    await altWheel(page, 0.37, 0.61, Array(8).fill(-240));
    expect(await zoomOf(page)).toBe(8);
    const field = (await surface(page).boundingBox())!;
    const container = (await root.boundingBox())!;
    const labels = await plane(page)
      .locator("[data-gp-part='axis-end']")
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            end: (node as HTMLElement).dataset.gpEnd,
            text: node.textContent,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          };
        }),
      );
    for (const label of labels) {
      const overlaps =
        label.left < field.x + field.width &&
        label.right > field.x &&
        label.top < field.y + field.height &&
        label.bottom > field.y;
      expect(overlaps, `${label.end} "${label.text}" must not cross the field`).toBe(false);
      // Nor spill out of the instrument's own box on the gutter side.
      expect(
        label.left,
        `${label.end} "${label.text}" must stay inside the instrument`,
      ).toBeGreaterThanOrEqual(container.x);
    }
    expect(await root.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
}
