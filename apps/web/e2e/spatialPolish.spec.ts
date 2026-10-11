import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createColorValue, analyzeGamut } from "@gamut-plane/core";
import type { SpatialScene } from "../src/spatial/spatialScene";
import type { markerProbe } from "./spatialPolishHarness";
import type { mountHarness, sectionInput } from "./spatialHarness";

type View = ReturnType<SpatialScene["inspect"]>;
const evidence = process.env.SPATIAL_POLISH_EVIDENCE;
const stage = (p: Page) => p.locator("[data-spatial-status]");
const canvas = (p: Page) => p.getByLabel("Orthographic gamut scene");
const facts = (p: Page) =>
  stage(p).evaluate((e) => (e as unknown as { spatialInspect(): View }).spatialInspect());
const settle = async (p: Page) =>
  expect.poll(async () => (await facts(p)).pendingFrame).toBe(false);
async function ready(p: Page) {
  await p.goto("/spatial");
  await expect(stage(p)).toHaveAttribute("data-spatial-status", "ready");
  await expect.poll(async () => (await facts(p)).section.capVisible).toBe(true);
  await settle(p);
}
async function edit(p: Page, name: string, value: number) {
  const input = p.locator("[data-gp-root]").getByRole("spinbutton", { name, exact: true });
  await input.fill(String(value));
  await input.press("Enter");
  await settle(p);
}
async function color(p: Page, l: number, a: number, b: number) {
  await edit(p, "OKLab a numeric value", a);
  await edit(p, "OKLab b numeric value", b);
  await edit(p, "Lightness numeric value", l);
  await expect.poll(async () => (await facts(p)).section.marker).toEqual([a, l, b]);
}
function project(v: View, point: readonly number[]) {
  const mul = (m: number[], x: number[]) =>
    [0, 1, 2, 3].map(
      (r) => m[r]! * x[0]! + m[4 + r]! * x[1]! + m[8 + r]! * x[2]! + m[12 + r]! * x[3]!,
    );
  const c = mul(v.camera.projection, mul(v.camera.view, [...point, 1]));
  return { x: ((c[0]! / c[3]! + 1) * v.width) / 2, y: ((1 - c[1]! / c[3]!) * v.height) / 2 };
}
async function imageFacts(p: Page, png: Buffer, v: View, previous?: Buffer) {
  const spot = v.section.marker ? project(v, v.section.marker) : { x: 0, y: 0 };
  return p.evaluate(
    async ({ base64, before, spot, width }) => {
      async function decode(source: string) {
        const bitmap = await createImageBitmap(
          await (await fetch(`data:image/png;base64,${source}`)).blob(),
        );
        const c = new OffscreenCanvas(bitmap.width, bitmap.height),
          ctx = c.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        return { data: ctx.getImageData(0, 0, c.width, c.height).data, width: c.width };
      }
      const current = await decode(base64),
        old = before ? await decode(before) : null;
      const ratio = current.width / width;
      const pixel = (x: number, y: number) => {
        const i = 4 * (Math.round(y * ratio) * current.width + Math.round(x * ratio));
        return Array.from(current.data.slice(i, i + 3));
      };
      let fill = 0,
        changed = 0;
      for (let i = 0; i < current.data.length; i += 4) {
        const rgb = current.data.slice(i, i + 3);
        if ([217, 223, 229].every((c, k) => Math.abs(rgb[k]! - c) < 2)) fill++;
        if (old && rgb.some((c, k) => Math.abs(c - old.data[i + k]!) > 16)) changed++;
      }
      const ring = Array.from({ length: 16 }, (_, i) => {
        const angle = (i * Math.PI) / 8;
        const x = spot.x + 5.3 * Math.cos(angle),
          y = spot.y + 5.3 * Math.sin(angle);
        // Canvas screenshot origins can be fractional CSS pixels. Require a covered dark sample
        // within one device pixel of each expected ring location, rather than an edge sample.
        return [-1, 0, 1]
          .flatMap((dx) => [-1, 0, 1].map((dy) => pixel(x + dx / ratio, y + dy / ratio)))
          .sort((a, b) => Math.max(...a) - Math.max(...b))[0]!;
      });
      return { center: pixel(spot.x, spot.y), ring, fill, changed, ratio };
    },
    { base64: png.toString("base64"), before: previous?.toString("base64"), spot, width: v.width },
  );
}
async function capture(p: Page, name: string, png: Buffer) {
  if (!evidence) return;
  await mkdir(evidence, { recursive: true });
  await writeFile(`${evidence}/${name}-canvas.png`, png);
  await p.screenshot({ path: `${evidence}/${name}.png` });
}

for (const gamut of ["srgb", "display-p3"] as const) {
  for (const mode of ["shape", "color"] as const) {
    test(`${gamut} ${mode}: repeated endpoint crossings preserve cut, camera, exact coordinates and membership`, async ({
      page,
    }, info) => {
      test.setTimeout(90_000);
      await ready(page);
      await page
        .getByRole("radio", { name: gamut === "srgb" ? "sRGB" : "Display P3", exact: true })
        .first()
        .check();
      await page
        .getByRole("radio", { name: mode === "shape" ? "Shape" : "Color", exact: true })
        .check();
      await settle(page);
      const camera = (await facts(page)).camera,
        records: unknown[] = [];
      for (const [a, b] of [
        [0, 0],
        [0.0033, 0.0458],
      ] as const) {
        for (const side of [1, -1]) {
          if (side === -1)
            await page.getByRole("button", { name: "Flip cut", exact: true }).click();
          let previous: Buffer | undefined;
          // Traverse both ends repeatedly. The accepted values are checked before screenshots.
          const values = [
            0.5, 0.01, 0.001, 0.0001, 0.000001, 0, 0.000001, 0, 0.5, 0.9999, 1, 0.9999, 1,
          ];
          for (const [index, l] of values.entries()) {
            await color(page, l, a, b);
            const v = await facts(page),
              endpoint = l === 0 || l === 1;
            expect(v.camera).toEqual(camera);
            expect(v.section.kind).toBe(endpoint ? "point" : "region");
            expect(v.section.cutSide).toBe(side);
            expect(v.section.capVisible).toBe(!endpoint);
            expect(v.section.endpointSegments).toBe(endpoint ? 1 : 0);
            if (endpoint) expect(v.section.segments[gamut]).toBe(0);
            else expect(v.section.segments[gamut]).toBeGreaterThan(0);
            await expect(
              page.getByRole("radio", { name: "Follow selected color", exact: true }),
            ).toBeChecked();
            const authored = await page
              .locator("[data-authored-channels]")
              .getAttribute("data-authored-channels");
            expect(authored).toBe([l, a, b].join(","));
            const value = createColorValue({ space: "oklab", channels: [l, a, b], alpha: 1 });
            if (!value.ok) throw new Error("fixture");
            for (const space of ["srgb", "display-p3"] as const) {
              const result = analyzeGamut(value.value, `${space}-gamut`);
              if (!result.ok) throw new Error("fixture");
              const label = space === "srgb" ? "sRGB" : "Display P3";
              await expect(page.locator("[data-section-summary]")).toContainText(
                `${result.value.status === "outside" ? "outside" : "inside"} ${label}`,
              );
            }
            const png = await canvas(page).screenshot();
            const pixels = await imageFacts(page, png, v, previous);
            if (endpoint) {
              expect(pixels.fill).toBe(0);
              // The preceding microscopic section cannot turn into a complete bright body.
              expect(pixels.changed).toBeLessThan(1000);
            }
            const name = `${gamut}-${mode}-${a ? "chromatic" : "neutral"}-${side}-${String(index).padStart(2, "0")}`;
            records.push({ name, l, authored, view: v, pixels });
            // A chronological real-size frame sequence, including repeats, for one representative case.
            if (gamut === "srgb" && mode === "color" && a && side === 1)
              await capture(page, name, png);
            previous = png;
          }
        }
        // Restore the chosen upper cut for the next authored fixture.
        await page.getByRole("button", { name: "Flip cut", exact: true }).click();
      }
      // Explicit uncut view may show the whole volume, including at an endpoint.
      await page.getByRole("checkbox", { name: "Cut away", exact: true }).uncheck();
      await color(page, 0, 0.0033, 0.0458);
      expect((await facts(page)).section.cutSide).toBe(0);
      expect((await facts(page)).section.surfaceVisible).toBe(true);
      await page.getByRole("checkbox", { name: "Cut away", exact: true }).check();
      await settle(page);
      expect((await facts(page)).section.cutSide).toBe(1);
      const path = info.outputPath("endpoint-frames.json");
      await writeFile(path, JSON.stringify(records, null, 2));
      if (evidence)
        await writeFile(
          `${evidence}/${gamut}-${mode}-frames.json`,
          JSON.stringify(records, null, 2),
        );
    });
  }
}

for (const dpr of [1, 2]) {
  test.describe(`marker DPR ${dpr}`, () => {
    test.use({ deviceScaleFactor: dpr });
    test("white, dark and saturated framebuffer fixtures keep the marker size and contrast", async ({
      page,
    }) => {
      await page.goto("/");
      const probe = await page.evaluate(async (ratio) => {
        const path = "/e2e/spatialPolishHarness.ts";
        const fixture = (await import(/* @vite-ignore */ path)) as {
          markerProbe: typeof markerProbe;
        };
        return fixture.markerProbe(ratio);
      }, dpr);
      for (const row of probe.rows) {
        expect(Math.min(...row.center)).toBeGreaterThan(235);
        for (const rgb of row.ring) expect(Math.max(...rgb)).toBeLessThan(60);
        if (row.background === 0x191d22) {
          expect(row.whiteWidth / dpr).toBeGreaterThanOrEqual(7);
          expect(row.whiteWidth / dpr).toBeLessThanOrEqual(9);
        }
        if (evidence) {
          await mkdir(evidence, { recursive: true });
          await writeFile(
            `${evidence}/marker-${row.background.toString(16)}-dpr${dpr}.png`,
            Buffer.from(row.png.split(",")[1]!, "base64"),
          );
        }
      }
      expect(Math.min(...probe.hidden)).toBeLessThan(235);
      expect(probe.hiddenRing.every((c, k) => Math.abs(c - [201, 214, 224][k]!) < 3)).toBe(true);
      expect(Math.max(...probe.hiddenHalo)).toBeLessThan(60);
    });
    test("real section pixels distinguish front, hidden, outside and recovered markers", async ({
      page,
    }, info) => {
      test.setTimeout(90_000);
      await ready(page);
      const records: unknown[] = [];
      async function front(name: string) {
        await settle(page);
        const v = await facts(page),
          png = await canvas(page).screenshot();
        const pixels = await imageFacts(page, png, v);
        expect(Math.min(...pixels.center), name).toBeGreaterThan(235);
        for (const rgb of pixels.ring)
          expect(Math.max(...rgb), `${name}: dark perimeter`).toBeLessThan(60);
        expect(pixels.ratio).toBeCloseTo(dpr, 2);
        records.push({ name, view: v, pixels });
        await capture(page, `${name}-dpr${dpr}`, png);
      }
      await front("home-light-section");
      // The user-supplied near-contour fixture: no snapping to the contour or section.
      await color(page, 0.743, -0.1281, -0.0117);
      await front("near-contour");
      for (const type of ["Lightness section", "Hue section"]) {
        await page.getByRole("radio", { name: type, exact: true }).check();
        await page.getByRole("button", { name: "View section", exact: true }).click();
        for (const mode of ["Shape", "Color"]) {
          await page.getByRole("radio", { name: mode, exact: true }).check();
          await color(page, 0.6, 0.08, 0.05);
          await front(`${type}-${mode}-saturated`);
          await color(page, 0.25, 0.02, 0.01);
          await front(`${type}-${mode}-dark`);
          await color(page, 0.92, 0.005, 0.0025);
          await front(`${type}-${mode}-light`);
        }
        // Rotate a supporting plane relative to a user-owned camera: the marker remains readable.
        await canvas(page).press("ArrowUp");
        await front(`${type}-oblique`);
      }
      await page.getByRole("radio", { name: "Lightness section", exact: true }).check();
      await page.getByRole("button", { name: "Home", exact: true }).click();
      await color(page, 0.68, 0.04, -0.08);
      await page.locator("[data-section-slider]").fill("0.9");
      await expect(page.locator("[data-marker-note]")).toContainText("behind the surface");
      await settle(page);
      const hidden = await facts(page),
        png = await canvas(page).screenshot();
      expect(hidden.section.marker).toEqual([0.04, 0.68, -0.08]);
      const actualDot = project(hidden, hidden.section.marker!);
      const onSection = project(hidden, [0.04, 0.9, -0.08]);
      expect(Math.hypot(actualDot.x - onSection.x, actualDot.y - onSection.y)).toBeGreaterThan(30);
      const hiddenPixels = await imageFacts(page, png, hidden);
      expect(Math.min(...hiddenPixels.center)).toBeLessThan(235);
      for (const rgb of hiddenPixels.ring) expect(Math.max(...rgb)).toBeLessThan(60);
      // A hollow ring is visible at its genuine center; no light disc paints over the cap.
      const spot = project(hidden, hidden.section.marker!);
      const ring = await page.evaluate(
        async ({ base64, x, y, dpr }) => {
          const bitmap = await createImageBitmap(
            await (await fetch(`data:image/png;base64,${base64}`)).blob(),
          );
          const c = new OffscreenCanvas(bitmap.width, bitmap.height),
            ctx = c.getContext("2d")!;
          ctx.drawImage(bitmap, 0, 0);
          const rgb = ctx.getImageData(Math.round((x + 4) * dpr), Math.round(y * dpr), 1, 1).data;
          bitmap.close();
          return Array.from(rgb).slice(0, 3);
        },
        { base64: png.toString("base64"), ...spot, dpr },
      );
      expect(ring.every((c, k) => Math.abs(c - [201, 214, 224][k]!) < 20)).toBe(true);
      await capture(page, `hidden-dpr${dpr}`, png);
      await page.getByRole("button", { name: "Show selected", exact: true }).click();
      await front("recovered");
      expect((await facts(page)).section.marker).toEqual(hidden.section.marker);
      expect((await facts(page)).section.lightness).toBe(0.9);
      await expect(page.getByRole("radio", { name: "Inspect lightness" })).toBeChecked();
      await page.getByRole("button", { name: "Restore surface", exact: true }).click();
      await page.getByRole("radio", { name: "Follow selected color", exact: true }).check();
      await color(page, 0.62, -0.3, 0.2);
      await front("outside-focused-gamut");
      await writeFile(info.outputPath("marker-pixels.json"), JSON.stringify(records, null, 2));
      if (evidence)
        await writeFile(`${evidence}/marker-dpr${dpr}.json`, JSON.stringify(records, null, 2));
    });
  });
}

test("the cut boundary shell has color on exposed back faces, with a distinct occluded marker", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 1000 });
  await ready(page);
  await page.getByRole("combobox", { name: "Coordinates" }).click();
  await page.getByRole("option", { name: "OKLCH", exact: true }).click();
  await edit(page, "Lightness numeric value", 0.7092);
  await edit(page, "Chroma numeric value", 0.1885);
  await edit(page, "Hue numeric value", 212.2);
  await page.getByRole("radio", { name: "Hue section", exact: true }).check();
  await expect.poll(async () => (await facts(page)).section.type).toBe("hue");
  await settle(page);
  const initialCamera = (await facts(page)).camera;
  await page.getByRole("radio", { name: "Inspect hue", exact: true }).check();
  const hue = page.getByRole("spinbutton", { name: "Inspected hue in degrees" });
  await hue.fill("312.4");
  await hue.press("Enter");
  await expect.poll(async () => (await facts(page)).section.hue).toBe(312.4);
  await page.getByRole("radio", { name: "Color", exact: true }).check();
  await page.getByRole("checkbox", { name: "Show Display P3 outline" }).uncheck();
  await settle(page);
  const v = await facts(page),
    png = await canvas(page).screenshot();
  const spot = project(v, [-0.1, 0.7, 0.03]);
  const rgb = await page.evaluate(
    async ({ base64, x, y }) => {
      const bitmap = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${base64}`)).blob(),
      );
      const c = new OffscreenCanvas(bitmap.width, bitmap.height),
        ctx = c.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const rgb = Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data).slice(0, 3);
      bitmap.close();
      return rgb;
    },
    { base64: png.toString("base64"), ...spot },
  );
  // This spot lies on the negative radial side: no hue-cap fan can supply the missing color.
  expect(Math.max(...rgb) - Math.min(...rgb)).toBeGreaterThan(80);
  expect(Math.max(...rgb)).toBeGreaterThan(150);
  await capture(page, "after-backface", png);
  expect(v.camera).toEqual(initialCamera);
  const marker = v.section.marker;
  await page.getByRole("button", { name: "Show selected", exact: true }).click();
  await settle(page);
  expect((await facts(page)).section.hue).toBe(312.4);
  expect((await facts(page)).section.marker).toEqual(marker);
  await page.getByRole("button", { name: "Restore surface", exact: true }).click();
  await settle(page);
  expect((await facts(page)).section.hue).toBe(312.4);
});

test("microscopic regions, point, empty, pending and unavailable sections stay distinct in the framebuffer", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const path = "/e2e/spatialHarness.ts";
    const fixture = (await import(/* @vite-ignore */ path)) as {
      mountHarness: typeof mountHarness;
      sectionInput: typeof sectionInput;
    };
    window.spatialHarness = fixture.mountHarness();
    const c = window.spatialHarness.controller;
    c.setSection(fixture.sectionInput(0.000001));
    c.viewSection();
  });
  const read = () => page.evaluate(() => window.spatialHarness.controller.inspect());
  await expect.poll(async () => (await read()).pendingFrame).toBe(false);
  const near = await read(),
    png = await page.locator("canvas").last().screenshot();
  expect(near.section.kind).toBe("region");
  expect(near.section.capVisible).toBe(true);
  expect((await imageFacts(page, png, near)).fill).toBeLessThanOrEqual(3);
  for (const l of [0, 0.0001, 0.001, 0.01, 0.9999, 1, -0.1]) {
    await page.evaluate(async (l) => {
      const path = "/e2e/spatialHarness.ts";
      const fixture = (await import(/* @vite-ignore */ path)) as {
        sectionInput: typeof sectionInput;
      };
      window.spatialHarness.controller.setSection(fixture.sectionInput(l));
    }, l);
    await expect.poll(async () => (await read()).pendingFrame).toBe(false);
    const v = await read();
    expect(v.camera).toEqual(near.camera);
    expect(v.section.kind).toBe(l < 0 ? "empty" : l === 0 || l === 1 ? "point" : "region");
    expect(v.section.cutSide).toBe(l < 0 ? 0 : -1);
    expect(v.section.capVisible).toBe(l > 0 && l < 1);
    expect(v.section.endpointSegments).toBe(l === 0 || l === 1 ? 1 : 0);
  }
  await page.evaluate(() =>
    window.spatialHarness.controller.setSection({ lightness: 0.5, outcomes: null }),
  );
  await expect.poll(async () => (await read()).pendingFrame).toBe(false);
  expect((await read()).section).toMatchObject({
    kind: null,
    capVisible: false,
    endpointSegments: 0,
  });
  await page.evaluate(() => {
    const failure = {
      status: "unavailable",
      error: "resource-budget",
      detail: "test fixture",
    } as const;
    window.spatialHarness.controller.setSection({
      lightness: 0.5,
      outcomes: { srgb: failure, "display-p3": failure },
    });
  });
  await expect.poll(async () => (await read()).pendingFrame).toBe(false);
  expect((await read()).section).toMatchObject({
    kind: null,
    capVisible: false,
    endpointSegments: 0,
    cutSide: 0,
  });
  await page.evaluate(() => {
    window.spatialHarness.controller.dispose();
    window.spatialHarness.releaseAudit();
  });
});
