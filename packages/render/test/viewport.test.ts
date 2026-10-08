import { describe, expect, it, vi } from "vitest";
import {
  assertViewport,
  constrainViewport,
  createViewportCamera,
  fieldToViewport,
  FIT_SAMPLE_WINDOW,
  FIT_VIEWPORT,
  isFitViewport,
  MAX_VIEWPORT_ZOOM,
  panViewport,
  sampleWindow,
  viewportDomainStyle,
  viewportPointStyle,
  viewportSvgViewBox,
  viewportToField,
  zoomViewportAt,
  type FieldViewport,
} from "../src/viewport/index.js";
import { pointStyle } from "../src/geometry.js";

const TOLERANCE = 1e-12;

function pose(zoom: number, x: number, y: number): FieldViewport {
  return constrainViewport({ zoom, center: { x, y } });
}

/** Deterministic generator so failures are reproducible. */
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe("fitted camera", () => {
  it("is canonical, immutable and an exact identity for coordinates", () => {
    expect(FIT_VIEWPORT).toEqual({ zoom: 1, center: { x: 0.5, y: 0.5 } });
    expect(Object.isFrozen(FIT_VIEWPORT)).toBe(true);
    expect(isFitViewport(FIT_VIEWPORT)).toBe(true);
    expect(sampleWindow(FIT_VIEWPORT)).toBe(FIT_SAMPLE_WINDOW);
    // Rounding in 0.5 + (0.1 - 0.5) must not touch an authored coordinate.
    expect(viewportToField(FIT_VIEWPORT, { x: 0.1, y: 0.3 })).toEqual({ x: 0.1, y: 0.3 });
    expect(fieldToViewport(FIT_VIEWPORT, { x: 0.1, y: 0.3 })).toEqual({ x: 0.1, y: 0.3 });
    expect(0.5 + (0.1 - 0.5)).not.toBe(0.1);
  });

  it("normalizes any 1x pose to the canonical fit", () => {
    expect(constrainViewport({ zoom: 1, center: { x: 0.2, y: 0.9 } })).toBe(FIT_VIEWPORT);
    expect(constrainViewport({ zoom: 0.25, center: { x: 0.2, y: 0.9 } })).toBe(FIT_VIEWPORT);
    expect(constrainViewport({ zoom: 1 + 1e-12, center: { x: 0.5, y: 0.5 } })).toBe(FIT_VIEWPORT);
  });
});

describe("V01 known values and round trips", () => {
  it("maps field points through independent numeric examples", () => {
    const centered = pose(2, 0.5, 0.5);
    expect(fieldToViewport(centered, { x: 0.25, y: 0.75 })).toEqual({ x: 0, y: 1 });
    expect(viewportToField(centered, { x: 0, y: 1 })).toEqual({ x: 0.25, y: 0.75 });
    expect(sampleWindow(centered)).toEqual({ left: 0.25, top: 0.25, width: 0.5, height: 0.5 });
    const corner = pose(4, 0.125, 0.875);
    expect(sampleWindow(corner)).toEqual({ left: 0, top: 0.75, width: 0.25, height: 0.25 });
    expect(fieldToViewport(corner, { x: 0.0625, y: 0.8125 })).toEqual({ x: 0.25, y: 0.25 });
  });

  it("round-trips points inside and outside the field without clamping", () => {
    const next = random(2072026);
    for (let index = 0; index < 2000; index += 1) {
      const zoom = 1 + next() * 7;
      const viewport = pose(zoom, next(), next());
      const field = { x: next() * 6 - 3, y: next() * 6 - 3 };
      const back = viewportToField(viewport, fieldToViewport(viewport, field));
      expect(Math.abs(back.x - field.x)).toBeLessThan(TOLERANCE);
      expect(Math.abs(back.y - field.y)).toBeLessThan(TOLERANCE);
    }
    // A captured pointer far beyond the surface still names a real, unclamped field point.
    expect(viewportToField(pose(2, 0.5, 0.5), { x: -5, y: 7 })).toEqual({ x: -2.25, y: 3.75 });
  });

  it("rejects non-finite state and arguments at the boundary", () => {
    expect(() => assertViewport({ zoom: Number.NaN, center: { x: 0.5, y: 0.5 } })).toThrow(
      TypeError,
    );
    expect(() => constrainViewport({ zoom: 2, center: { x: Infinity, y: 0.5 } })).toThrow(
      TypeError,
    );
    expect(() => viewportToField(FIT_VIEWPORT, { x: Number.NaN, y: 0 })).toThrow(TypeError);
    expect(() => zoomViewportAt(FIT_VIEWPORT, { x: 0.5, y: 0.5 }, Number.NaN)).toThrow(TypeError);
    expect(() => zoomViewportAt(FIT_VIEWPORT, { x: 0.5, y: 0.5 }, 0)).toThrow(RangeError);
    expect(() => zoomViewportAt(FIT_VIEWPORT, { x: 0.5, y: 0.5 }, -2)).toThrow(RangeError);
    expect(() => panViewport(FIT_VIEWPORT, { x: Infinity, y: 0 })).toThrow(TypeError);
  });
});

describe("V02 anchored zoom", () => {
  it("keeps the anchored field point fixed when no bound intervenes", () => {
    const zoomed = zoomViewportAt(FIT_VIEWPORT, { x: 0.2, y: 0.8 }, 2);
    expect(zoomed.zoom).toBe(2);
    expect(zoomed.center.x).toBeCloseTo(0.35, 12);
    expect(zoomed.center.y).toBeCloseTo(0.65, 12);
    // The point under the anchor before is the point under the anchor after.
    expect(fieldToViewport(zoomed, { x: 0.2, y: 0.8 }).x).toBeCloseTo(0.2, 12);
    expect(fieldToViewport(zoomed, { x: 0.2, y: 0.8 }).y).toBeCloseTo(0.8, 12);
  });

  it("keeps the anchor for random unclamped requests and records drift when bounded", () => {
    const next = random(7);
    let unclamped = 0;
    let clamped = 0;
    for (let index = 0; index < 4000; index += 1) {
      const before = pose(1 + next() * 7, next(), next());
      const anchor = { x: next(), y: next() };
      const factor = Math.exp((next() - 0.5) * 3);
      const after = zoomViewportAt(before, anchor, factor);
      if (after === before) continue;
      const under = viewportToField(before, anchor);
      const ideal = {
        x: under.x - (anchor.x - 0.5) / after.zoom,
        y: under.y - (anchor.y - 0.5) / after.zoom,
      };
      const bounded =
        Math.abs(after.center.x - ideal.x) > 1e-12 || Math.abs(after.center.y - ideal.y) > 1e-12;
      const shown = fieldToViewport(after, under);
      if (!bounded) {
        unclamped += 1;
        expect(Math.abs(shown.x - anchor.x)).toBeLessThan(1e-12);
        expect(Math.abs(shown.y - anchor.y)).toBeLessThan(1e-12);
      } else clamped += 1;
    }
    expect(unclamped).toBeGreaterThan(0);
    expect(clamped).toBeGreaterThan(0);
  });

  it("lets a bound move the anchor, which is documented and deliberate", () => {
    const edge = pose(2, 0.25, 0.5);
    const out = zoomViewportAt(edge, { x: 1, y: 0.5 }, 0.5);
    // The anchored point (field x 0.5) would need a center the field cannot supply at 1x.
    expect(out).toBe(FIT_VIEWPORT);
    expect(fieldToViewport(out, { x: 0.5, y: 0.5 }).x).toBe(0.5);
  });

  it("treats a capped zoom as a true no-op that never recenters", () => {
    const max = pose(MAX_VIEWPORT_ZOOM, 0.0625, 0.9375);
    expect(zoomViewportAt(max, { x: 0.9, y: 0.1 }, 3)).toBe(max);
    expect(zoomViewportAt(FIT_VIEWPORT, { x: 0.9, y: 0.1 }, 0.25)).toBe(FIT_VIEWPORT);
    const capped = zoomViewportAt(pose(6, 0.5, 0.5), { x: 0.5, y: 0.5 }, 100);
    expect(capped.zoom).toBe(MAX_VIEWPORT_ZOOM);
  });

  it("returns to the exact fitted state after stepped zoom in and out", () => {
    const anchor = { x: 0.5, y: 0.5 };
    let viewport: FieldViewport = FIT_VIEWPORT;
    for (let step = 0; step < 9; step += 1) viewport = zoomViewportAt(viewport, anchor, 1.25);
    expect(viewport.zoom).toBeGreaterThan(7);
    for (let step = 0; step < 9; step += 1) viewport = zoomViewportAt(viewport, anchor, 1 / 1.25);
    expect(viewport).toBe(FIT_VIEWPORT);
  });

  it("matches the extreme valid centers at the ceiling", () => {
    expect(pose(8, -3, 9).center).toEqual({ x: 0.0625, y: 0.9375 });
    expect(sampleWindow(pose(8, 0, 0))).toEqual({ left: 0, top: 0, width: 0.125, height: 0.125 });
  });
});

describe("V03 pan", () => {
  it("moves content with the pointer, scaled by magnification", () => {
    const at2 = pose(2, 0.5, 0.5);
    expect(panViewport(at2, { x: 0.1, y: -0.2 }).center).toEqual({ x: 0.45, y: 0.6 });
    const at4 = pose(4, 0.5, 0.5);
    expect(panViewport(at4, { x: 0.1, y: -0.2 }).center).toEqual({ x: 0.475, y: 0.55 });
    // The same field point stays under the dragged pointer.
    const dragged = panViewport(at2, { x: 0.1, y: -0.2 });
    const anchor = { x: 0.3, y: 0.7 };
    const under = viewportToField(at2, anchor);
    const shown = fieldToViewport(dragged, under);
    expect(shown.x).toBeCloseTo(anchor.x + 0.1, 12);
    expect(shown.y).toBeCloseTo(anchor.y - 0.2, 12);
  });

  it("bounds the center and treats 1x pan as a no-op", () => {
    expect(panViewport(pose(2, 0.5, 0.5), { x: -9, y: 9 }).center).toEqual({ x: 0.75, y: 0.25 });
    expect(panViewport(FIT_VIEWPORT, { x: 0.3, y: 0.3 })).toBe(FIT_VIEWPORT);
  });

  it("derives panned poses from a stable origin, not from the previous frame", () => {
    const origin = pose(4, 0.5, 0.5);
    const stepwise = panViewport(panViewport(origin, { x: 0.04, y: 0 }), { x: 0.04, y: 0 });
    expect(stepwise.center.x).toBeCloseTo(panViewport(origin, { x: 0.08, y: 0 }).center.x, 12);
  });

  it("expresses a pose in normalized terms that do not depend on pixel size", () => {
    const viewport = pose(3, 0.4, 0.6);
    // Resizing changes only the raster size; the same pose names the same field window.
    expect(sampleWindow(viewport)).toEqual(sampleWindow({ ...viewport }));
    expect(Object.keys(viewport).sort()).toEqual(["center", "zoom"]);
  });
});

describe("presentation helpers", () => {
  it("keeps fitted presentation byte-identical to the unprojected style", () => {
    const point = { x: 0.123456789, y: 0.5 };
    expect(viewportPointStyle(FIT_VIEWPORT, point)).toEqual(pointStyle(point));
    expect(viewportSvgViewBox(FIT_VIEWPORT)).toBe("0 0 1000 1000");
    expect(viewportDomainStyle(FIT_VIEWPORT)).toBeNull();
  });

  it("projects annotations, the view box and the field square through one pose", () => {
    const viewport = pose(2, 0.25, 0.75);
    expect(viewportPointStyle(viewport, { x: 0.5, y: 0.5 })).toEqual({
      left: "100.00000000%",
      top: "0.00000000%",
    });
    expect(viewportSvgViewBox(viewport)).toBe("0 500 500 500");
    expect(viewportDomainStyle(viewport)).toEqual({
      left: "0.00000000%",
      top: "-100.00000000%",
      width: "200.00000000%",
      height: "200.00000000%",
    });
  });

  it("keeps an extreme raw marker position valid CSS instead of overflowing", () => {
    const style = viewportPointStyle(pose(8, 0.5, 0.5), { x: 1.7e308, y: -1.7e308 });
    expect(style.left).toMatch(/^[-\d.e+]+%$/);
    expect(style.left).not.toContain("Infinity");
  });
});

describe("camera presentation barrier", () => {
  function fixture() {
    let nextHandle = 0;
    const frames = new Map<number, () => void>();
    const shown: FieldViewport[] = [];
    const present = vi.fn((viewport: FieldViewport) => {
      shown.push(viewport);
    });
    const camera = createViewportCamera({
      present,
      schedule: (callback) => {
        frames.set(++nextHandle, callback);
        return nextHandle;
      },
      cancel: (handle) => {
        frames.delete(handle as number);
      },
    });
    const runFrame = () => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback());
    };
    return { camera, frames, shown, present, runFrame };
  }

  it("coalesces input into one presentation and composes anchors in event order", () => {
    const { camera, frames, shown, runFrame } = fixture();
    expect(camera.zoomAt({ x: 0.2, y: 0.5 }, 2)).toBe(true);
    expect(camera.zoomAt({ x: 0.9, y: 0.5 }, 2)).toBe(true);
    expect(frames.size).toBe(1);
    expect(camera.presented).toBe(FIT_VIEWPORT);
    expect(camera.pending).toBe(true);
    const composed = zoomViewportAt(
      zoomViewportAt(FIT_VIEWPORT, { x: 0.2, y: 0.5 }, 2),
      { x: 0.9, y: 0.5 },
      2,
    );
    runFrame();
    expect(shown).toEqual([composed]);
    expect(camera.presented).toEqual(composed);
    expect(camera.pending).toBe(false);
    expect(composed).not.toEqual(zoomViewportAt(FIT_VIEWPORT, { x: 0.9, y: 0.5 }, 4));
  });

  it("does not show an unpresented request and can discard it", () => {
    const { camera, frames, present } = fixture();
    camera.zoomAt({ x: 0.5, y: 0.5 }, 2);
    expect(camera.presented).toBe(FIT_VIEWPORT);
    expect(camera.discardPending()).toBe(true);
    expect(frames.size).toBe(0);
    expect(camera.requested).toBe(FIT_VIEWPORT);
    expect(camera.discardPending()).toBe(false);
    expect(present).not.toHaveBeenCalled();
  });

  it("replaces pending work with the canonical fit instead of replaying it", () => {
    const { camera, frames, shown, runFrame } = fixture();
    camera.zoomAt({ x: 0.5, y: 0.5 }, 2);
    runFrame();
    camera.zoomAt({ x: 0.5, y: 0.5 }, 2);
    camera.fit();
    expect(shown.at(-1)).toBe(FIT_VIEWPORT);
    expect(frames.size).toBe(0);
    runFrame();
    expect(camera.presented).toBe(FIT_VIEWPORT);
    expect(shown).toHaveLength(2);
  });

  it("cancels the frame when a later request returns to the presented pose", () => {
    const { camera, frames, present } = fixture();
    camera.zoomAt({ x: 0.5, y: 0.5 }, 2);
    camera.zoomAt({ x: 0.5, y: 0.5 }, 0.5);
    expect(frames.size).toBe(0);
    expect(present).not.toHaveBeenCalled();
  });

  it("presents a pan from its stable origin and can restore the origin atomically", () => {
    const { camera, shown, runFrame } = fixture();
    camera.zoomAt({ x: 0.5, y: 0.5 }, 4);
    runFrame();
    const origin = camera.presented;
    camera.panFrom(origin, { x: 0.1, y: 0 });
    camera.panFrom(origin, { x: 0.2, y: 0 });
    runFrame();
    expect(shown.at(-1)!.center.x).toBeCloseTo(0.45, 12);
    camera.show(origin);
    expect(shown.at(-1)).toBe(origin);
  });

  it("never leaves an unpresentable request behind and goes inert when disposed", () => {
    const { camera, frames, present } = fixture();
    present.mockImplementationOnce(() => {
      throw new Error("raster failed");
    });
    camera.zoomAt({ x: 0.5, y: 0.5 }, 2);
    expect(() => camera.flush()).toThrow("raster failed");
    expect(camera.pending).toBe(false);
    camera.zoomAt({ x: 0.5, y: 0.5 }, 2);
    camera.dispose();
    expect(frames.size).toBe(0);
    expect(camera.zoomAt({ x: 0.5, y: 0.5 }, 2)).toBe(false);
    camera.fit();
    camera.flush();
    expect(present).toHaveBeenCalledTimes(1);
  });
});
