import { afterEach, describe, expect, it, vi } from "vitest";
import { fieldSupport } from "../src/capabilities/fieldSupport.js";
import { createFieldRenderer, fieldCacheKey, type FieldRenderInput } from "../src/fieldRenderer.js";
import { FIT_SAMPLE_WINDOW, type FieldSampleWindow } from "../src/viewport/index.js";

afterEach(() => vi.unstubAllGlobals());

type EditorId = keyof typeof fieldSupport;
const editorIds = Object.keys(fieldSupport) as EditorId[];

/** Canvas double that records fills, resizes and the field points the sampler is asked for. */
function fixture(editorId: EditorId, size = 16) {
  const calls: { clears: number; fills: number; draws: number } = { clears: 0, fills: 0, draws: 0 };
  const stops: number[][] = [];
  const context = {
    getContextAttributes: () => ({ colorSpace: "srgb" }),
    setTransform: vi.fn(),
    clearRect: vi.fn(() => {
      calls.clears += 1;
    }),
    createLinearGradient: () => {
      const offsets: number[] = [];
      stops.push(offsets);
      return { addColorStop: (offset: number) => offsets.push(offset) };
    },
    fillRect: vi.fn(() => {
      calls.fills += 1;
    }),
    drawImage: vi.fn(() => {
      calls.draws += 1;
    }),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high",
  };
  const makeCanvas = () =>
    ({
      getContext: vi.fn(() => context),
      getBoundingClientRect: () => ({ width: size, height: size }),
      width: 0,
      height: 0,
    }) as unknown as HTMLCanvasElement;
  vi.stubGlobal("document", { createElement: () => makeCanvas() });
  const canvas = makeCanvas();
  const points: { x: number; y: number; fixed: number }[] = [];
  const source = fieldSupport[editorId].plane;
  // Own copy so the frozen production sampler is untouched; same data, spied sampling.
  const plane = {
    ...source,
    sampleField: (...args: unknown[]) => {
      const [point, fixed] = args as [{ x: number; y: number }, number];
      points.push({ x: point.x, y: point.y, fixed });
      return (source.sampleField as (...inner: unknown[]) => unknown)(...args);
    },
  } as unknown as FieldRenderInput["plane"];
  const renderer = createFieldRenderer(canvas, vi.fn());
  const input = (window?: FieldSampleWindow, fixed = 0.3): FieldRenderInput => ({
    plane,
    fieldId: source.id,
    fixed,
    pixelRatio: 1,
    interactionPreview: false,
    ...(window ? { window } : {}),
  });
  return { canvas, calls, points, stops, renderer, input, source };
}

const WINDOW: FieldSampleWindow = { left: 0.25, top: 0.5, width: 0.25, height: 0.125 };

describe("V04 visible-region sampling", () => {
  it.each(["oklch-lc", "srgb-rg"] as const)(
    "%s places gradient stops at the screen positions that were actually sampled",
    (id) => {
      const { renderer, input, points, stops } = fixture(id, 23);
      renderer.draw(input(WINDOW));
      const firstColumn = stops[0]!;
      firstColumn.forEach((offset, index) => {
        expect(offset).toBeCloseTo((points[index]!.y - WINDOW.top) / WINDOW.height, 12);
      });
    },
  );
  it.each(editorIds)("%s samples only the camera window with the fixed value preserved", (id) => {
    const { points, renderer, input } = fixture(id);
    renderer.draw(input(WINDOW, 0.37));
    expect(points.length).toBeGreaterThan(0);
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const epsilon = 1e-12;
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(WINDOW.left - epsilon);
    expect(Math.max(...xs)).toBeLessThanOrEqual(WINDOW.left + WINDOW.width + epsilon);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(WINDOW.top - epsilon);
    expect(Math.max(...ys)).toBeLessThanOrEqual(WINDOW.top + WINDOW.height + epsilon);
    // The visible window is covered edge to edge in x, so no sliver of the field is left unsampled.
    expect(Math.min(...xs)).toBeCloseTo(WINDOW.left, 12);
    expect(Math.max(...xs)).toBeCloseTo(WINDOW.left + WINDOW.width, 12);
    expect(new Set(points.map((point) => point.fixed))).toEqual(new Set([0.37]));
  });

  it("uses the same window sampling orientation as the fitted field for all eight editors", () => {
    for (const id of editorIds) {
      const fitted = fixture(id);
      fitted.renderer.draw(fitted.input());
      const explicit = fixture(id);
      explicit.renderer.draw(explicit.input(FIT_SAMPLE_WINDOW));
      expect(explicit.points).toEqual(fitted.points);
      expect(Math.min(...fitted.points.map((point) => point.x))).toBe(0);
      expect(Math.max(...fitted.points.map((point) => point.x))).toBe(1);
    }
  });

  it("maps a known viewport position to an independently computed field coordinate", () => {
    // Column-gradient editors place column 0 and the last column at the window's left and right.
    const { points, renderer, input } = fixture("srgb-rg");
    renderer.draw(input({ left: 0.5, top: 0.25, width: 0.5, height: 0.5 }));
    const first = points[0]!;
    expect(first.x).toBe(0.5);
    expect(first.y).toBe(0.25);
    const last = points.at(-1)!;
    expect(last.x).toBe(1);
    expect(last.y).toBeCloseTo(0.75, 12);
  });

  it("derives channel values from inverse-camera coordinates with the native orientation", () => {
    // The sampler's own R = x and G = 1 - y at these window corners, computed by hand.
    const source = fieldSupport["srgb-rg"].plane;
    const window = { left: 0.5, top: 0.25, width: 0.5, height: 0.5 };
    expect(source.sampleField({ x: window.left, y: window.top }, 0.2).channels).toEqual([
      0.5, 0.75, 0.2,
    ]);
    expect(
      source.sampleField({ x: window.left + window.width, y: window.top + window.height }, 0.2)
        .channels,
    ).toEqual([1, 0.25, 0.2]);
  });
});

describe("V05 raster cache identity", () => {
  it("repaints on pan at unchanged zoom and reuses an unchanged camera and slice", () => {
    const { calls, renderer, input } = fixture("srgb-rg");
    renderer.draw(input(WINDOW));
    const painted = calls.clears;
    renderer.draw(input({ ...WINDOW }));
    expect(calls.clears).toBe(painted);
    renderer.draw(input({ ...WINDOW, left: WINDOW.left + 0.0625 }));
    expect(calls.clears).toBe(painted + 1);
    renderer.draw(input({ ...WINDOW, left: WINDOW.left + 0.0625 }, 0.3));
    expect(calls.clears).toBe(painted + 1);
    renderer.draw(input({ ...WINDOW, left: WINDOW.left + 0.0625 }, 0.4));
    expect(calls.clears).toBe(painted + 2);
  });

  it("names pan, zoom and slice independently in the key", () => {
    const { input } = fixture("srgb-rg");
    const size = { width: 16, height: 16, pixelRatio: 1 };
    const key = (window?: FieldSampleWindow) => fieldCacheKey(input(window), size, "srgb", "full");
    expect(key()).toBe(key(FIT_SAMPLE_WINDOW));
    expect(
      new Set([key(WINDOW), key({ ...WINDOW, top: 0.25 }), key({ ...WINDOW, width: 0.5 })]).size,
    ).toBe(3);
  });

  it("repaints the disc buffer for a new window and reuses it for the same window", () => {
    const { calls, renderer, input } = fixture("oklab-ab");
    renderer.draw(input(WINDOW));
    const painted = calls.draws;
    expect(painted).toBe(1);
    renderer.draw(input({ ...WINDOW }));
    expect(calls.draws).toBe(painted);
    renderer.draw(input({ ...WINDOW, top: 0.25 }));
    expect(calls.draws).toBe(painted + 1);
  });
});

describe("V19 bounded backing allocation", () => {
  it.each(["srgb-rg", "oklch-lc", "oklab-ab"] as const)(
    "%s keeps the backing store at the visible size at any magnification",
    (id) => {
      const { canvas, renderer, input } = fixture(id, 24);
      renderer.draw(input());
      const fitted = { width: canvas.width, height: canvas.height };
      expect(fitted).toEqual({ width: 24, height: 24 });
      for (const zoom of [2, 4, 8]) {
        const span = 1 / zoom;
        renderer.draw(
          input({ left: 0.5 - span / 2, top: 0.5 - span / 2, width: span, height: span }),
        );
        expect({ width: canvas.width, height: canvas.height }).toEqual(fitted);
      }
    },
  );
});
