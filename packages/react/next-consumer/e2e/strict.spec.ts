import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    planeResources: {
      created: number;
      disconnected: number;
      active: number;
      handlers: number;
      windowHandlers: number;
      resolutionHandlers: number;
    };
  }
}

async function events(page: Page) {
  return JSON.parse(await page.locator("[data-events]").innerText()) as {
    changes: number;
    commits: number;
    cancels: number;
    final: unknown;
  };
}
async function color(page: Page, host = "first") {
  return JSON.parse(await page.locator(`[data-host="${host}"] [data-color]`).innerText());
}
async function frames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function control(page: Page, name: string) {
  await page
    .getByRole("button", { name, exact: true })
    .evaluate((el: HTMLButtonElement) => el.click());
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.planeResources = {
      created: 0,
      disconnected: 0,
      active: 0,
      handlers: 0,
      windowHandlers: 0,
      resolutionHandlers: 0,
    };
    const active = new Set<ResizeObserver>();
    const NativeObserver = ResizeObserver;
    window.ResizeObserver = class extends NativeObserver {
      override observe(target: Element, options?: ResizeObserverOptions) {
        if (target.matches(".gamut-plane-surface") && !active.has(this)) {
          active.add(this);
          window.planeResources.created++;
          window.planeResources.active++;
        }
        super.observe(target, options);
      }
      override disconnect() {
        if (active.delete(this)) {
          window.planeResources.disconnected++;
          window.planeResources.active--;
        }
        super.disconnect();
      }
    };
    const add = EventTarget.prototype.addEventListener;
    const remove = EventTarget.prototype.removeEventListener;
    const listeners = new WeakMap<
      EventTarget,
      Map<string, Set<EventListenerOrEventListenerObject>>
    >();
    function category(target: EventTarget, type: string) {
      if (target instanceof Element && target.matches(".gamut-plane-surface")) return "handlers";
      if (target === window && (type === "scroll" || type === "resize")) return "windowHandlers";
      if (target instanceof MediaQueryList && target.media.startsWith("(resolution:"))
        return "resolutionHandlers";
      return null;
    }
    EventTarget.prototype.addEventListener = function (type, listener, options) {
      const count = category(this, type);
      if (count && listener) {
        if (!listeners.has(this)) listeners.set(this, new Map());
        const types = listeners.get(this)!;
        if (!types.has(type)) types.set(type, new Set());
        const handlers = types.get(type)!;
        if (!handlers.has(listener)) {
          handlers.add(listener);
          window.planeResources[count]++;
        }
      }
      return add.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function (type, listener, options) {
      const count = category(this, type);
      if (count && listener && listeners.get(this)?.get(type)?.delete(listener))
        window.planeResources[count]--;
      return remove.call(this, type, listener, options);
    };
  });
});

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page.locator('[data-render-color-space="pending"]')).toHaveCount(0);
  await expect(page.locator("[data-plane-instrument]")).toHaveCount(2);
  await expect
    .poll(() => page.evaluate(() => window.planeResources))
    .toEqual({
      created: 4,
      disconnected: 2,
      active: 2,
      handlers: 12,
      windowHandlers: 4,
      resolutionHandlers: 2,
    });
  expect(await events(page)).toEqual({ changes: 0, commits: 0, cancels: 0, final: null });
  return errors;
}

async function startDrag(page: Page) {
  const surface = page.locator('[data-host="first"] [role="application"]');
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.down();
  await expect.poll(async () => (await events(page)).changes).toBeGreaterThan(0);
  return { surface, box };
}

test("root Strict Mode replays setup and cleans all handlers/observers on unmount", async ({
  page,
}) => {
  const errors = await open(page);
  await page.locator('[data-host="first"] [role="application"]').press("ArrowLeft");
  expect((await events(page)).commits).toBe(1);
  const before = await events(page);
  await control(page, "Toggle mount");
  await expect(page.locator("[data-plane-instrument]")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.planeResources))
    .toEqual({
      created: 4,
      disconnected: 4,
      active: 0,
      handlers: 0,
      windowHandlers: 0,
      resolutionHandlers: 0,
    });
  await frames(page);
  expect(await events(page)).toEqual(before);
  await control(page, "Toggle mount");
  await expect(page.locator("[data-plane-instrument]")).toHaveCount(2);
  await expect
    .poll(() => page.evaluate(() => window.planeResources))
    .toEqual({
      created: 8,
      disconnected: 6,
      active: 2,
      handlers: 12,
      windowHandlers: 4,
      resolutionHandlers: 2,
    });
  await expect
    .poll(() =>
      page
        .locator("canvas")
        .first()
        .evaluate(
          (canvas: HTMLCanvasElement) =>
            canvas.getContext("2d")!.getImageData(canvas.width / 2, canvas.height / 2, 1, 1)
              .data[3],
        ),
    )
    .toBe(255);
  await page.locator('[data-host="first"] [role="application"]').press("ArrowLeft");
  expect((await events(page)).commits).toBe(2);
  expect(errors).toEqual([]);
});

test("cloned feedback and fresh callbacks preserve a coalesced gesture and final commit", async ({
  page,
}) => {
  const errors = await open(page);
  const other = await color(page, "second");
  const { surface, box } = await startDrag(page);
  const bitmap = await surface
    .locator("canvas")
    .evaluate((el: HTMLCanvasElement) => el.toDataURL());
  await control(page, "Rerender parent");
  await control(page, "Clone colors");
  expect((await events(page)).cancels).toBe(0);
  const before = await events(page);
  const immediate = await surface.evaluate((el, rect) => {
    for (let index = 0; index < 80; index++)
      el.dispatchEvent(
        new PointerEvent("pointermove", {
          pointerId: 1,
          clientX: rect.x + rect.width * 0.6,
          clientY: rect.y + rect.height * 0.3,
          bubbles: true,
        }),
      );
    return JSON.parse(document.querySelector("[data-events]")!.textContent!);
  }, box);
  expect(immediate.changes).toBe(before.changes);
  await frames(page);
  expect((await events(page)).changes).toBe(before.changes + 1);
  expect(await surface.locator("canvas").evaluate((el: HTMLCanvasElement) => el.toDataURL())).toBe(
    bitmap,
  );
  // Queue a different move and release before a frame: completion must publish the final point synchronously.
  await surface.evaluate((el, rect) => {
    el.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        clientX: rect.x + rect.width * 0.7,
        clientY: rect.y + rect.height * 0.2,
        bubbles: true,
      }),
    );
    el.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 1,
        clientX: rect.x + rect.width * 0.8,
        clientY: rect.y + rect.height * 0.1,
        bubbles: true,
      }),
    );
  }, box);
  await page.mouse.up();
  await expect.poll(async () => (await events(page)).commits).toBe(1);
  const final = await color(page);
  expect((await events(page)).final).toEqual(final);
  expect(final.c).toBeGreaterThan(0.3);
  expect(final.l).toBeGreaterThan(0.85);
  expect(final.alpha).toBe(0.37);
  expect((await events(page)).cancels).toBe(0);
  expect(await color(page, "second")).toEqual(other);
  const completed = await events(page);
  await frames(page);
  expect(await events(page)).toEqual(completed);
  expect(errors).toEqual([]);
});

for (const cancellation of ["Escape", "capture loss", "external replacement", "unmount"]) {
  test(`${cancellation} discards pending gesture work`, async ({ page }) => {
    const errors = await open(page);
    const initial = await color(page);
    const { surface, box } = await startDrag(page);
    const before = await events(page);
    await surface.evaluate(
      (el, { rect, action }) => {
        el.dispatchEvent(
          new PointerEvent("pointermove", {
            pointerId: 1,
            clientX: rect.x + rect.width * 0.9,
            clientY: rect.y + rect.height * 0.1,
            bubbles: true,
          }),
        );
        if (action === "Escape")
          el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        else if (action === "capture loss")
          el.dispatchEvent(new PointerEvent("lostpointercapture", { pointerId: 1, bubbles: true }));
        else
          [...document.querySelectorAll("button")]
            .find(
              (button) =>
                button.textContent === (action === "unmount" ? "Toggle mount" : "Replace first"),
            )!
            .click();
      },
      { rect: box, action: cancellation },
    );
    await page.mouse.up();
    await frames(page);
    const after = await events(page);
    expect(after.commits).toBe(0);
    if (cancellation === "unmount") {
      await expect(page.locator("[data-plane-instrument]")).toHaveCount(0);
      expect(after).toEqual(before);
      expect(await page.evaluate(() => window.planeResources.active)).toBe(0);
    } else {
      expect(after.cancels).toBe(1);
      expect(await color(page)).toEqual(
        cancellation === "external replacement"
          ? { l: 0.21, c: 0.31, h: 82, alpha: 0.63 }
          : initial,
      );
      expect(after.changes).toBe(
        before.changes + (cancellation === "external replacement" ? 0 : 1),
      );
    }
    expect(errors).toEqual([]);
  });
}

test("pointer completion delivers the last value when onCommit is omitted", async ({ page }) => {
  await open(page);
  await control(page, "Toggle completion callback");
  const surface = page.locator('[data-host="first"] [role="application"]');
  const box = (await surface.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.25);
  const value = await color(page);
  expect(value.c).toBeLessThan(0.11);
  expect(value.l).toBeGreaterThan(0.7);
  expect(value.alpha).toBe(0.37);
  expect((await events(page)).commits).toBe(0);
});

test("DPR changes redraw the full backing store without editing color", async ({ page }) => {
  const errors = await open(page);
  const initial = await color(page);
  const canvas = page.locator("canvas").first();
  const client = await page.context().newCDPSession(page);
  const resolutionProbe = await page.evaluateHandle(() => {
    const query = matchMedia("(resolution: 1dppx)");
    const probe = { changes: 0 };
    query.addEventListener("change", () => probe.changes++);
    return probe;
  });
  // A DPR-only CDP override changes the getter without delivering media events.
  // Change viewport geometry too and prove the browser delivered the resolution event.
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 990,
    height: 1000,
    deviceScaleFactor: 2.5,
    mobile: false,
  });
  await expect.poll(() => resolutionProbe.evaluate((probe) => probe.changes)).toBe(1);
  await expect
    .poll(() =>
      canvas.evaluate(
        (el: HTMLCanvasElement) =>
          el.width === Math.round(Math.round(el.getBoundingClientRect().width) * 2.5),
      ),
    )
    .toBe(true);
  expect(await color(page)).toEqual(initial);
  expect(await events(page)).toEqual({ changes: 0, commits: 0, cancels: 0, final: null });
  await client.detach();
  await resolutionProbe.dispose();
  expect(errors).toEqual([]);
});

test("resizing during capture updates pointer geometry", async ({ page }) => {
  const errors = await open(page);
  const { surface } = await startDrag(page);
  await control(page, "Resize hosts");
  await expect
    .poll(() => surface.locator("canvas").evaluate((el: HTMLCanvasElement) => el.width))
    .toBeLessThan(280);
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
  await page.mouse.up();
  const final = await color(page);
  expect(final.c).toBeCloseTo(0.1, 2);
  expect(final.l).toBeCloseTo(0.75, 2);
  expect((await events(page)).final).toEqual(final);
  expect((await events(page)).cancels).toBe(0);
  expect(errors).toEqual([]);
});
