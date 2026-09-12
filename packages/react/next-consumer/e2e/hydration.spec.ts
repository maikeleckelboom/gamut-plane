import { expect, test, type Locator, type Page } from "@playwright/test";

declare global {
  interface Window {
    beforeHydration: {
      nodes: Element[];
      ids: string[];
      values: string[];
      focus: Element | null;
      boxes: number[][];
    };
  }
}

async function color(host: Locator) {
  return JSON.parse(await host.locator("[data-color]").innerText()) as {
    l: number;
    c: number;
    h: number;
    alpha: number;
  };
}

async function painted(canvas: Locator) {
  await expect
    .poll(() =>
      canvas.evaluate(
        (element: HTMLCanvasElement) =>
          element.getContext("2d")?.getImageData(element.width / 2, element.height / 2, 1, 1)
            .data[3],
      ),
    )
    .toBe(255);
  await canvas.scrollIntoViewIfNeeded();
  const src = `data:image/png;base64,${(await canvas.screenshot()).toString("base64")}`;
  const variation = await canvas.page().evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    const readback = document.createElement("canvas");
    readback.width = image.width;
    readback.height = image.height;
    const context = readback.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const samples = [0.15, 0.35, 0.65, 0.85].flatMap((x) =>
      [0.15, 0.35, 0.65, 0.85].map((y) => {
        const pixel = context.getImageData(image.width * x, image.height * y, 1, 1).data;
        return pixel[0]! + pixel[1]! + pixel[2]!;
      }),
    );
    return Math.max(...samples) - Math.min(...samples);
  }, src);
  expect(variation).toBeGreaterThan(100);
}

function diagnostics(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" ||
      (/hydrat|mismatch/i.test(message.text()) && message.type() === "warning")
    )
      errors.push(message.text());
  });
  return errors;
}

for (const path of ["/", "/prerendered", "/?narrow=1"]) {
  test(`server document hydrates in place and edits independent instances: ${path}`, async ({
    page,
  }, testInfo) => {
    const errors = diagnostics(page);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/*", async (route) => {
      if (route.request().resourceType() === "script") await gate;
      await route.continue();
    });
    const { before, colors } = await (async () => {
      try {
        const response = await page.goto(path, { waitUntil: "commit" });
        const html = await response!.text();
        expect(html).toContain("data-active-marker");
        expect(html).toContain('data-gamut-boundary="srgb"');
        expect(html).toContain('data-gamut-boundary="display-p3"');
        expect(html).toContain("612.123456");
        await expect(page.locator("[data-plane-instrument]")).toHaveCount(2);
        await expect
          .poll(() =>
            page
              .locator("[role=application]")
              .first()
              .evaluate((el) => getComputedStyle(el).aspectRatio),
          )
          .toBe("1 / 1");
        await page.locator("[role=application]").first().focus();
        await page.evaluate(() => {
          const roots = [...document.querySelectorAll("[data-plane-instrument]")];
          const nodes = roots.flatMap((root) => [
            root,
            ...root.querySelectorAll(
              "canvas, svg, path, input, button, [data-active-marker], [role=application]",
            ),
          ]);
          window.beforeHydration = {
            nodes,
            ids: [...document.querySelectorAll("[data-plane-instrument] [id]")].map((el) => el.id),
            values: [
              ...document.querySelectorAll<HTMLInputElement>("[data-plane-instrument] input"),
            ].map((el) => el.value),
            focus: document.activeElement,
            boxes: [...document.querySelectorAll("[role=application]")].map((el) => {
              const box = el.getBoundingClientRect();
              return [box.width, box.height];
            }),
          };
        });
        await expect(page.locator('[data-render-color-space="pending"]')).toHaveCount(2);
        const before = await page.locator("[data-host]").all();
        const colors = await Promise.all(before.map(color));
        expect(colors[0]).toEqual({ l: 0.68, c: 0.52345678, h: 612.123456, alpha: 0.37 });
        await testInfo.attach("server.html", { body: html, contentType: "text/html" });
        return { html, before, colors };
      } finally {
        release();
      }
    })();
    await expect(page.locator('[data-render-color-space="pending"]')).toHaveCount(0);
    const reuse = await page.evaluate(() => {
      const before = window.beforeHydration;
      const current = [...document.querySelectorAll("[data-plane-instrument]")].flatMap((root) => [
        root,
        ...root.querySelectorAll(
          "canvas, svg, path, input, button, [data-active-marker], [role=application]",
        ),
      ]);
      return {
        retained:
          current.length === before.nodes.length &&
          before.nodes.every((node, index) => node.isConnected && node === current[index]),
        ids: [...document.querySelectorAll("[data-plane-instrument] [id]")].map((el) => el.id),
        values: [
          ...document.querySelectorAll<HTMLInputElement>("[data-plane-instrument] input"),
        ].map((el) => el.value),
        focus: document.activeElement === before.focus,
        boxes: [...document.querySelectorAll("[role=application]")].map((el) => {
          const box = el.getBoundingClientRect();
          return [box.width, box.height];
        }),
        associations: [
          ...document.querySelectorAll(
            "[data-plane-instrument], [data-plane-instrument] [aria-labelledby], [data-plane-instrument] [aria-describedby], [data-plane-instrument] [for]",
          ),
        ].every((el) =>
          ["aria-labelledby", "aria-describedby", "for"].every((attr) =>
            (el.getAttribute(attr) ?? "")
              .split(" ")
              .filter(Boolean)
              .every((id) => document.getElementById(id)),
          ),
        ),
        before: { ids: before.ids, values: before.values, boxes: before.boxes },
      };
    });
    expect(reuse.retained).toBe(true);
    expect(reuse.ids).toEqual(reuse.before.ids);
    expect(new Set(reuse.ids).size).toBe(reuse.ids.length);
    expect(reuse.values).toEqual(reuse.before.values);
    expect(reuse.focus).toBe(true);
    expect(reuse.associations).toBe(true);
    expect(reuse.boxes).toEqual(reuse.before.boxes);
    expect(reuse.boxes.every(([width, height]) => width! >= 200 && width === height)).toBe(true);
    await expect(page.locator("[data-events]")).toHaveText(
      '{"changes":0,"commits":0,"cancels":0,"final":null}',
    );
    for (const [index, host] of before.entries()) {
      expect(await color(host)).toEqual(colors[index]);
      await painted(host.locator("canvas"));
      const surface = host.getByRole("application");
      await surface.press("ArrowLeft");
      expect(await color(host)).not.toEqual(colors[index]);
      expect((await color(host)).alpha).toBe(colors[index]!.alpha);
      const box = await surface.boundingBox();
      await page.mouse.click(box!.x + box!.width * 0.4, box!.y + box!.height * 0.4);
      expect((await color(host)).alpha).toBe(colors[index]!.alpha);
      if (index === 0) expect(await color(before[1]!)).toEqual(colors[1]);
    }
    await expect(page.locator("[data-events]")).toContainText('"commits":4');
    await testInfo.attach("hydration-reuse.json", {
      body: JSON.stringify(reuse, null, 2),
      contentType: "application/json",
    });
    await testInfo.attach("hydrated.png", {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    expect(errors).toEqual([]);
  });
}

test("hidden reveal, resize and route remount keep lifecycle silent", async ({ page }) => {
  const errors = diagnostics(page);
  await page.goto("/?hidden=1");
  await expect(page.locator('[data-render-color-space="pending"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Toggle visibility" }).click();
  for (const canvas of await page.locator("[data-host] canvas").all()) await painted(canvas);
  await page.getByRole("button", { name: "Resize hosts" }).click();
  for (const canvas of await page.locator("[data-host] canvas").all()) {
    await expect.poll(() => canvas.evaluate((el: HTMLCanvasElement) => el.width)).toBeLessThan(280);
    await painted(canvas);
  }
  await page.getByRole("link", { name: "Away", exact: true }).click();
  await expect(page.locator("[data-away]")).toBeVisible();
  await expect(page.locator("[data-plane-instrument]")).toHaveCount(0);
  await page.getByRole("link", { name: "Instruments", exact: true }).click();
  await expect(page.locator("[data-plane-instrument]")).toHaveCount(2);
  await expect(page.locator('[data-render-color-space="pending"]')).toHaveCount(0);
  for (const canvas of await page.locator("[data-host] canvas").all()) await painted(canvas);
  await expect(page.locator("[data-events]")).toHaveText(
    '{"changes":0,"commits":0,"cancels":0,"final":null}',
  );
  expect(errors).toEqual([]);
});

for (const capability of ["srgb", "unavailable"]) {
  test(`Canvas ${capability} preserves hydrated controls and authored values`, async ({ page }) => {
    const errors = diagnostics(page);
    await page.addInitScript((mode) => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        options?: unknown,
      ) {
        if (
          type === "2d" &&
          (mode === "unavailable" ||
            (options as { colorSpace?: string } | undefined)?.colorSpace === "display-p3")
        )
          return null;
        return Reflect.apply(getContext, this, [type, options]);
      } as typeof getContext;
    }, capability);
    await page.goto("/");
    await expect(page.locator(`[data-render-color-space="${capability}"]`)).toHaveCount(2);
    await expect(page.locator("[data-events]")).toHaveText(
      '{"changes":0,"commits":0,"cancels":0,"final":null}',
    );
    const host = page.locator('[data-host="first"]');
    expect((await color(host)).alpha).toBe(0.37);
    await host.getByRole("application").press("ArrowLeft");
    await expect(page.locator("[data-events]")).toContainText('"commits":1');
    if (capability === "srgb") await painted(host.locator("canvas"));
    expect(errors).toEqual([]);
  });
}

test("independent requests preserve different authored values", async ({ browser }) => {
  const pages = await Promise.all([browser.newPage(), browser.newPage()]);
  const errors = pages.map(diagnostics);
  try {
    await Promise.all(pages.map((page, index) => page.goto(index ? "/?alternate=1" : "/")));
    for (const page of pages)
      await expect(page.locator('[data-render-color-space="pending"]')).toHaveCount(0);
    const first = await color(pages[0]!.locator('[data-host="first"]'));
    const second = await color(pages[1]!.locator('[data-host="first"]'));
    expect(first).toEqual({ l: 0.68, c: 0.52345678, h: 612.123456, alpha: 0.37 });
    expect(second).toEqual({ l: 0.31, c: 0.41, h: -28.25, alpha: 0.61 });
    expect(errors.flat()).toEqual([]);
  } finally {
    await Promise.all(pages.map((page) => page.close()));
  }
});
