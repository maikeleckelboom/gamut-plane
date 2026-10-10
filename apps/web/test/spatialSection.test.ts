// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import { createColorValue, definingEquals, definitionOf, type ColorValue } from "@gamut-plane/core";
import type { LightnessSection } from "@gamut-plane/render/internal/spatial";
import {
  createSectionScheduler,
  createSectionStore,
  followSection,
  initialSectionSelection,
  inspectSection,
  observeSelected,
  scrubSection,
  sectionLightness,
  selectedMembership,
  sliderValue,
  type SectionOutcomes,
} from "../src/spatial/sectionModel";
import {
  FACE_ON_COSINE,
  clipSegmentsToRemoved,
  cutSide,
  drawnSolid,
  isFaceOn,
  isHiddenByCap,
  isKept,
  isPointHidden,
} from "../src/spatial/sectionPolicy";
import {
  SECTION_VIEW_TILT,
  homeCamera,
  sectionCamera,
  setCameraAspect,
} from "../src/spatial/spatialCamera";
import {
  announceSection,
  describeMarker,
  describeSection,
  describeSelectedColor,
} from "../src/spatial/sectionSummary";
import { writeContour, writeFootprint, writeStem } from "../src/spatial/sectionLayers";

const color = (space: "oklch" | "oklab" | "srgb", channels: [number, number, number | null]) => {
  const value = createColorValue({ space, channels, alpha: 0.4 } as never);
  if (!value.ok) throw new Error(value.error.code);
  return value.value;
};

describe("the selected color is observed through core, never rewritten", () => {
  it("places an OKLCH color at its OKLab coordinates and ignores alpha", () => {
    const value = color("oklch", [0.68, 0.15, 252]);
    const observed = observeSelected(value);
    if (observed.status !== "ok") throw new Error("unavailable");
    expect(observed.l).toBe(0.68);
    expect(Math.hypot(observed.a, observed.b)).toBeCloseTo(0.15, 12);
    expect(Math.atan2(observed.b, observed.a)).toBeCloseTo((252 * Math.PI) / 180 - 2 * Math.PI, 12);
    // Alpha 0.4 and alpha 1 are the same point.
    const opaque = createColorValue({ space: "oklch", channels: [0.68, 0.15, 252], alpha: 1 });
    if (!opaque.ok) throw new Error("opaque");
    expect(observeSelected(opaque.value)).toEqual(observed);
  });
  it("keeps the missing hue of an achromatic color at the neutral axis", () => {
    const observed = observeSelected(color("oklch", [0.5, 0, null]));
    expect(observed).toEqual({ status: "ok", l: 0.5, a: 0, b: 0 });
  });
  it("retains extended coordinates exactly and does not clamp them", () => {
    const observed = observeSelected(color("oklab", [1.4, -0.9, 0.7]));
    expect(observed).toEqual({ status: "ok", l: 1.4, a: -0.9, b: 0.7 });
  });
  it("reports an unavailable observation instead of a position", () => {
    const value = color("srgb", [1e300, -1e300, 1e300]);
    expect(observeSelected(value)).toEqual({ status: "unavailable" });
    expect(selectedMembership(value, "srgb")).toBe("unavailable");
  });
  it("observing neither changes nor copies the authored definition", () => {
    const value = color("oklch", [0.68, 0.15, 252]);
    const before = definitionOf(value);
    observeSelected(value);
    selectedMembership(value, "display-p3");
    expect(definitionOf(value)).toBe(before);
    expect(definingEquals(value, value)).toBe(true);
  });
  it("reports exact gamut membership from core analysis", () => {
    expect(selectedMembership(color("oklch", [0.68, 0.15, 252]), "srgb")).toBe("inside");
    expect(selectedMembership(color("oklch", [0.68, 0.4, 252]), "srgb")).toBe("outside");
  });
});

describe("follow and inspect never author a color", () => {
  const ok = (l: number) => ({ status: "ok", l, a: 0.01, b: -0.02 }) as const;
  it("follows the accepted lightness and ignores a and b", () => {
    expect(sectionLightness(initialSectionSelection, ok(0.68))).toBe(0.68);
    // Only a or b changed: the same lightness, so nothing downstream sees a different request.
    expect(sectionLightness(initialSectionSelection, { ...ok(0.68), a: 0.2 })).toBe(0.68);
  });
  it("has no section to follow when the color cannot be observed", () => {
    expect(sectionLightness(initialSectionSelection, { status: "unavailable" })).toBeNull();
    expect(sliderValue(initialSectionSelection, { status: "unavailable" })).toBe(0.5);
  });
  it("scrubbing enters inspect mode and holds its own lightness while the color changes", () => {
    let selection = scrubSection(initialSectionSelection, 0.3);
    expect(selection).toEqual({ mode: "inspect", inspectLightness: 0.3 });
    expect(sectionLightness(selection, ok(0.9))).toBe(0.3);
    expect(sectionLightness(selection, { status: "unavailable" })).toBe(0.3);
    selection = scrubSection(selection, 0.45);
    expect(selection.inspectLightness).toBe(0.45);
  });
  it("returning to follow restores the accepted lightness", () => {
    const inspecting = scrubSection(initialSectionSelection, 0.3);
    const following = followSection(inspecting);
    expect(following.mode).toBe("follow");
    expect(sectionLightness(following, ok(0.68))).toBe(0.68);
    expect(followSection(following)).toBe(following);
  });
  it("starting to inspect keeps the lightness already shown, with no jump", () => {
    const selection = inspectSection(initialSectionSelection, ok(0.6789));
    expect(selection).toEqual({ mode: "inspect", inspectLightness: 0.6789 });
    expect(inspectSection(selection, ok(0.1))).toBe(selection);
  });
  it("rejects non-finite input and clamps to the range of a lightness control", () => {
    const selection = scrubSection(initialSectionSelection, 0.3);
    expect(scrubSection(selection, Number.NaN)).toBe(selection);
    expect(scrubSection(selection, Number.POSITIVE_INFINITY)).toBe(selection);
    expect(scrubSection(selection, 7).inspectLightness).toBe(1);
    expect(scrubSection(selection, -7).inspectLightness).toBe(0);
    // The control shows a bounded value even while following an extended color.
    expect(sliderValue(initialSectionSelection, ok(1.4))).toBe(1);
  });
  it("holds no color: its state is two plain fields", () => {
    expect(Object.keys(initialSectionSelection).sort()).toEqual(["inspectLightness", "mode"]);
  });
});

describe("the section store is exact and bounded", () => {
  it("builds each (gamut, lightness) once and serves repeats from the cache", () => {
    const store = createSectionStore();
    const first = store.outcomes(0.44);
    const again = store.outcomes(0.44);
    expect(again.srgb).toBe(first.srgb);
    expect(store.stats).toMatchObject({ builds: 2, hits: 2, misses: 2 });
    expect(first.srgb.status).toBe("ready");
  });
  it("never quantizes lightness to improve hits", () => {
    const store = createSectionStore();
    store.get("srgb", 0.5);
    store.get("srgb", 0.5 + 1e-12);
    store.get("srgb", 0.5 + 2 ** -52);
    expect(store.stats.builds).toBe(3);
    expect(store.stats.hits).toBe(0);
  });
  it("evicts the least recently used entry beyond its capacity", () => {
    const store = createSectionStore({ capacity: 3 });
    for (const l of [0.1, 0.2, 0.3]) store.get("srgb", l);
    store.get("srgb", 0.1); // 0.2 is now the oldest
    store.get("srgb", 0.4);
    expect(store.size).toBe(3);
    expect(store.stats.evictions).toBe(1);
    store.get("srgb", 0.2);
    expect(store.stats.builds).toBe(5);
    store.get("srgb", 0.1);
    expect(store.stats.hits).toBe(2);
  });
  it("represents failure as unavailable, never as an empty section", () => {
    const store = createSectionStore({
      generate: () => ({ ok: false, error: "resource-budget", detail: "test" }),
    });
    expect(store.get("srgb", 0.5)).toEqual({
      status: "unavailable",
      error: "resource-budget",
      detail: "test",
    });
  });
  it("represents a successful empty section as ready", () => {
    const store = createSectionStore();
    const outcome = store.get("srgb", 1.4);
    if (outcome.status !== "ready") throw new Error("unavailable");
    expect(outcome.section.kind).toBe("empty");
  });
});

describe("requests are latest-wins and never deliver a stale result", () => {
  const outcomesFor = (lightness: number): SectionOutcomes => {
    const section = { lightness, kind: "empty" } as unknown as LightnessSection;
    return {
      srgb: { status: "ready", section },
      "display-p3": { status: "ready", section },
    };
  };
  it("coalesces a burst into one computation for the newest lightness", () => {
    const compute = vi.fn(outcomesFor);
    const onUpdate = vi.fn();
    let pending: (() => void) | null = null;
    const scheduler = createSectionScheduler({
      compute,
      schedule: (flush) => (pending = flush),
      onUpdate,
    });
    for (const l of [0.1, 0.2, 0.3, 0.4]) scheduler.request(l);
    expect(compute).not.toHaveBeenCalled();
    expect(scheduler.pending).toBe(true);
    pending!();
    expect(compute).toHaveBeenCalledTimes(1);
    expect(compute).toHaveBeenCalledWith(0.4);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0]![0]).toMatchObject({ lightness: 0.4, revision: 4 });
    expect(scheduler.pending).toBe(false);
  });
  it("delivers null without computing when there is nothing to show", () => {
    const compute = vi.fn(outcomesFor);
    const onUpdate = vi.fn();
    let pending: (() => void) | null = null;
    const scheduler = createSectionScheduler({ compute, schedule: (f) => (pending = f), onUpdate });
    scheduler.request(null);
    pending!();
    expect(compute).not.toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledWith({ revision: 1, lightness: null, outcomes: null });
  });
  it("drops an older asynchronous result that finishes after a newer request", async () => {
    const resolvers = new Map<number, (outcomes: SectionOutcomes) => void>();
    const onUpdate = vi.fn();
    const flushes: (() => void)[] = [];
    const scheduler = createSectionScheduler({
      compute: (lightness) => new Promise((resolve) => resolvers.set(lightness, resolve)),
      schedule: (flush) => flushes.push(flush),
      onUpdate,
    });
    scheduler.request(0.2);
    flushes.shift()!();
    scheduler.request(0.7); // arrives while 0.2 is still computing
    flushes.shift()!();
    resolvers.get(0.7)!(outcomesFor(0.7));
    await Promise.resolve();
    resolvers.get(0.2)!(outcomesFor(0.2)); // the stale one finishes last
    await Promise.resolve();
    await Promise.resolve();
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0]![0]).toMatchObject({ lightness: 0.7 });
  });
  it("delivers nothing after disposal", async () => {
    const onUpdate = vi.fn();
    let pending: (() => void) | null = null;
    const cancel = vi.fn();
    const scheduler = createSectionScheduler({
      compute: outcomesFor,
      schedule: (flush) => (pending = flush),
      cancel,
      onUpdate,
    });
    scheduler.request(0.3);
    scheduler.dispose();
    pending!();
    scheduler.request(0.4);
    expect(cancel).toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

describe("the cut is a presentation policy", () => {
  it("removes the half-space on the viewer's side of the plane", () => {
    expect(cutSide(0.7, true)).toBe(1);
    expect(cutSide(-0.7, true)).toBe(-1);
    expect(cutSide(0, true)).toBe(1);
    expect(cutSide(0.7, false)).toBe(0);
    expect(isKept([0, 0.3, 0], 1, 0.5)).toBe(true);
    expect(isKept([0, 0.7, 0], 1, 0.5)).toBe(false);
    expect(isKept([0, 0.5, 0], 1, 0.5)).toBe(true); // the plane itself belongs to the cap
    expect(isKept([0, 0.7, 0], -1, 0.5)).toBe(true);
    expect(isKept([0, 0.3, 0], -1, 0.5)).toBe(false);
    expect(isKept([0, 9, 0], 0, 0.5)).toBe(true);
  });
  it("keeps the removed side's silhouette, cutting segments at the plane", () => {
    const source = Float32Array.from([
      // entirely above, entirely below, and one crossing the plane at y = 0.5
      0, 0.6, 0, 1, 0.9, 0, 0, 0.1, 0, 1, 0.3, 0, 0, 0.4, 0, 0, 0.9, 0,
    ]);
    const out = new Float32Array(18);
    expect(clipSegmentsToRemoved(source, 3, 1, 0.5, out)).toBe(2);
    expect(Array.from(out.slice(0, 6))).toEqual(
      Array.from(Float32Array.from([0, 0.6, 0, 1, 0.9, 0])),
    );
    // The crossing segment keeps only the part above the plane.
    expect(out[7]).toBeCloseTo(0.5, 6);
    expect(out[10]).toBeCloseTo(0.9, 6);
    expect(out[6]).toBe(0);
    // The other side of the plane is the mirror image.
    const below = new Float32Array(18);
    expect(clipSegmentsToRemoved(source, 3, -1, 0.5, below)).toBe(2);
    expect(below[1]).toBeCloseTo(0.1, 6);
    expect(clipSegmentsToRemoved(source, 3, 0, 0.5, below)).toBe(0);
    expect(clipSegmentsToRemoved(source, 3, 1, 0.5, new Float32Array(6))).toBe(1);
  });
  it("hides a point only behind a drawn solid, not on or just under its surface", () => {
    const inside = (p: readonly [number, number, number]) => Math.hypot(...p) < 1;
    const toViewer = [0, 0, 1] as const;
    expect(isPointHidden(inside, [0, 0, -0.5], toViewer)).toBe(true); // inside, deeper than the margin
    expect(isPointHidden(inside, [0, 0, -2], toViewer)).toBe(true); // behind
    expect(isPointHidden(inside, [0, 0, 1.5], toViewer)).toBe(false); // in front
    expect(isPointHidden(inside, [3, 0, 0], toViewer)).toBe(false); // beside
    expect(isPointHidden(inside, [0, 0, 0.9995], toViewer)).toBe(false); // on the surface
  });
  it("does not let the removed part hide anything", () => {
    const body = (p: readonly [number, number, number]) => Math.hypot(...p) < 1;
    const solid = drawnSolid(body, 1, 0); // removes y > 0
    expect(solid([0, 0.5, 0])).toBe(false);
    expect(solid([0, -0.5, 0])).toBe(true);
    // A marker on the plane, seen from above, is in front of the kept lower half.
    expect(isPointHidden(solid, [0, 0, 0], [0, 1, 0])).toBe(false);
    // Seen from below with the lower half removed, a marker on the plane is in front of the kept half.
    expect(isPointHidden(drawnSolid(body, -1, 0), [0, 0, 0], [0, -1, 0])).toBe(false);
    // A marker inside the kept upper half is behind its near face.
    expect(isPointHidden(drawnSolid(body, -1, 0), [0, 0.5, 0], [0, -1, 0])).toBe(true);
    expect(isPointHidden(solid, [0, -0.3, 0], [0, 1, 0])).toBe(true);
  });
  it("a section's own fill hides only what lies behind the plane and inside the region", () => {
    const region = (p: readonly [number, number, number]) => Math.hypot(p[0], p[2]) < 0.2;
    const up = [0, 1, 0] as const;
    expect(isHiddenByCap(region, [0, 0.2, 0], up, 1, 0.5)).toBe(true); // below the plane, under the fill
    expect(isHiddenByCap(region, [0.5, 0.2, 0], up, 1, 0.5)).toBe(false); // outside the region
    expect(isHiddenByCap(region, [0, 0.5, 0], up, 1, 0.5)).toBe(false); // on the plane
    expect(isHiddenByCap(region, [0, 0.8, 0], up, 1, 0.5)).toBe(false); // on the removed side
    expect(isHiddenByCap(region, [0, 0.8, 0], [0, -1, 0], -1, 0.5)).toBe(true);
    expect(isHiddenByCap(region, [0, 0.2, 0], up, 0, 0.5)).toBe(false);
  });
  it("presents the section on its own within 20 degrees of its normal", () => {
    expect(FACE_ON_COSINE).toBeCloseTo(Math.cos((20 * Math.PI) / 180), 15);
    expect(isFaceOn(1)).toBe(true);
    expect(isFaceOn(-1)).toBe(true);
    expect(isFaceOn(Math.cos((19.9 * Math.PI) / 180))).toBe(true);
    expect(isFaceOn(Math.cos((20.1 * Math.PI) / 180))).toBe(false);
    expect(isFaceOn(0.5)).toBe(false);
  });
});

describe("the section camera shows +a to the right and +b up, unmirrored", () => {
  function projected(camera: OrthographicCamera, point: readonly [number, number, number]) {
    const p = new Vector3(...point).project(camera);
    return { x: p.x, y: p.y, depth: p.z };
  }
  function setup(aspect: number) {
    const camera = new OrthographicCamera(-1, 1, 0.71, -0.71, 0.01, 20);
    setCameraAspect(camera, aspect);
    const target = new Vector3();
    return { camera, target };
  }
  it.each([1.4, 1, 0.5])(
    "at aspect %s: screen right is +a, screen up is +b, with equal scale",
    (aspect) => {
      const { camera, target } = setup(aspect);
      sectionCamera(camera, target, 0.62, null);
      const origin = projected(camera, [target.x, 0.62, target.z]);
      const along = projected(camera, [target.x + 0.1, 0.62, target.z]); // +a
      const up = projected(camera, [target.x, 0.62, target.z + 0.1]); // +b
      expect(along.x - origin.x).toBeGreaterThan(0);
      expect(Math.abs(along.y - origin.y)).toBeLessThan(1e-3);
      expect(up.y - origin.y).toBeGreaterThan(0);
      expect(Math.abs(up.x - origin.x)).toBeLessThan(1e-3);
      // Equal pixels per scene unit on both axes: no distortion of the scientific scale.
      const pixelsPerUnitX = ((along.x - origin.x) * camera.right * 2) / 2 / 0.1;
      const pixelsPerUnitY = ((up.y - origin.y) * camera.top * 2) / 2 / 0.1;
      expect(pixelsPerUnitX / pixelsPerUnitY).toBeCloseTo(1, 4);
    },
  );
  it("is a proper, unmirrored view: the camera basis has positive handedness", () => {
    const { camera, target } = setup(1.4);
    sectionCamera(camera, target, 0.5, null);
    camera.updateMatrixWorld(true);
    const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const back = new Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
    expect(right.dot(new Vector3(1, 0, 0))).toBeGreaterThan(1 - 1e-6);
    expect(up.dot(new Vector3(0, 0, 1))).toBeGreaterThan(1 - 1e-6);
    expect(right.clone().cross(up).dot(back)).toBeCloseTo(1, 12);
    // It looks along +L, from below the plane.
    const toViewer = camera.getWorldDirection(new Vector3()).negate();
    expect(toViewer.y).toBeLessThan(-1 + 1e-6);
    expect(isFaceOn(toViewer.y)).toBe(true);
    expect(Math.acos(-toViewer.y)).toBeCloseTo(SECTION_VIEW_TILT, 6);
  });
  it("looking from above would mirror the picture, which is why the view is from below", () => {
    // The scene is X = a, Y = L, Z = b. Seen from +Y with +a to the right, +b is toward the viewer.
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
    camera.position.set(0, 3, 1e-4);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
    const up = new Vector3(0, 0, 1).project(camera);
    const right = new Vector3(1, 0, 0).project(camera);
    // Either +b is down or +a is left: one axis is always reversed from this side.
    expect(right.x > 0 && up.y > 0).toBe(false);
  });
  it("centers the requested extent and fits it with margin", () => {
    const { camera, target } = setup(1.5);
    sectionCamera(camera, target, 0.3, { min: [-0.2, -0.3], max: [0.3, 0.1] });
    expect(target.x).toBeCloseTo(0.05, 12);
    expect(target.y).toBe(0.3);
    expect(target.z).toBeCloseTo(-0.1, 12);
    for (const [a, b] of [
      [-0.2, -0.3],
      [0.3, 0.1],
    ] as const) {
      const p = projected(camera, [a, 0.3, b]);
      expect(Math.abs(p.x)).toBeLessThan(1);
      expect(Math.abs(p.y)).toBeLessThan(1);
    }
  });
  it("leaves the Home pose exactly as it was", () => {
    const { camera, target } = setup(1.4);
    homeCamera(camera, target);
    expect(target.toArray()).toEqual([0, 0.5, 0]);
    expect(camera.position.toArray().map((value) => Number(value.toFixed(6)))).toEqual(
      new Vector3(1.35, 0.8, 1.65)
        .normalize()
        .multiplyScalar(3)
        .add(target)
        .toArray()
        .map((value) => Number(value.toFixed(6))),
    );
    expect(camera.up.toArray()).toEqual([0, 1, 0]);
    expect(camera.zoom).toBe(1);
  });
});

describe("line buffers describe the exact section", () => {
  const layer = () => {
    const state = { commits: [] as number[] };
    return {
      state,
      buffer: new Float32Array(6 * 64),
      commit(count: number) {
        state.commits.push(count);
      },
    } as unknown as Parameters<typeof writeContour>[0] & { state: typeof state };
  };
  const sectionOf = (loops: number[][][], lightness = 0.5): LightnessSection =>
    ({
      kind: "region",
      lightness,
      loops: loops.map((points) => ({
        edges: new Int8Array(points.length),
        positions: Float64Array.from(points.flatMap(([a, b]) => [a!, lightness, b!])),
      })),
    }) as unknown as LightnessSection;
  it("writes every segment of every loop at the section lightness and closes each loop", () => {
    const target = layer();
    const count = writeContour(
      target,
      sectionOf([
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        [
          [3, 3],
          [4, 3],
          [4, 4],
          [3, 4],
        ],
      ]),
    );
    expect(count).toBe(7);
    expect(Array.from(target.buffer.slice(0, 6))).toEqual([0, 0.5, 0, 1, 0.5, 0]);
    expect(Array.from(target.buffer.slice(12, 18))).toEqual([1, 0.5, 1, 0, 0.5, 0]);
    expect(Array.from(target.buffer.slice(36, 42))).toEqual([3, 0.5, 4, 3, 0.5, 3]);
    for (let k = 0; k < count; k++) expect(target.buffer[6 * k + 1]).toBe(0.5);
  });
  it("skips zero-length segments and writes nothing for a missing or non-region section", () => {
    const target = layer();
    expect(
      writeContour(
        target,
        sectionOf([
          [
            [0, 0],
            [0, 0],
            [1, 0],
          ],
        ]),
      ),
    ).toBe(2);
    expect(writeContour(target, null)).toBe(0);
    expect(writeContour(target, { kind: "point" } as unknown as LightnessSection)).toBe(0);
  });
  it("writes the viewing plane and the drop line", () => {
    const plane = layer();
    writeFootprint(plane, 0.3);
    expect(plane.state.commits).toEqual([4]);
    expect(Array.from(plane.buffer.slice(0, 6))).toEqual(
      Array.from(Float32Array.from([-0.45, 0.3, -0.45, 0.45, 0.3, -0.45])),
    );
    writeFootprint(plane, null);
    expect(plane.state.commits).toEqual([4, 0]);
    const stem = layer();
    writeStem(stem, [0.1, 0.8, -0.2], 0.3);
    writeStem(stem, [0.1, 0.3, -0.2], 0.3); // already on the plane: no guide
    writeStem(stem, null, 0.3);
    writeStem(stem, [0.1, 0.8, -0.2], null);
    expect(stem.state.commits).toEqual([1, 0, 0, 0]);
  });
});

describe("plain-language facts", () => {
  const ok = { status: "ok", l: 0.68, a: -0.046, b: -0.143 } as const;
  const inside = { srgb: "inside", "display-p3": "inside" } as const;
  const ready = (kind: "region" | "point" | "empty" = "region") =>
    ({
      status: "ready",
      section: { kind, bounds: { min: [-0.18, -0.18], max: [0.28, 0.14] }, loops: [{}] },
    }) as unknown as SectionOutcomes["srgb"];
  it("states the selected color, its exact membership and the section", () => {
    expect(describeSelectedColor(ok, inside)).toBe(
      "Selected color: L 0.680, a −0.046, b −0.143; inside sRGB, inside Display P3.",
    );
    expect(describeSelectedColor(ok, { srgb: "outside", "display-p3": "inside" })).toContain(
      "outside sRGB, inside Display P3",
    );
    expect(describeSelectedColor({ status: "unavailable" }, inside)).toContain("no marker");
    expect(describeSection("follow", 0.68, { srgb: ready(), "display-p3": ready() }, ok)).toContain(
      "follows the selected color",
    );
    expect(describeSection("inspect", 0.3, { srgb: ready(), "display-p3": ready() }, ok)).toContain(
      "inspected separately",
    );
  });
  it("tells empty, point and unavailable apart", () => {
    const text = describeSection(
      "follow",
      1.2,
      {
        srgb: ready("empty"),
        "display-p3": { status: "unavailable", error: "resource-budget", detail: "" },
      },
      ok,
    );
    expect(text).toContain("sRGB has no colors at this lightness");
    expect(text).toContain("Display P3 section unavailable (resource budget)");
    expect(
      describeSection("follow", 1, { srgb: ready("point"), "display-p3": ready("point") }, ok),
    ).toContain("only the neutral point");
    expect(describeSection("follow", null, null, { status: "unavailable" })).toContain("Inspect");
  });
  it("announces only settled, meaningful facts", () => {
    const text = announceSection(
      "follow",
      0.68,
      { srgb: ready(), "display-p3": ready() },
      ok,
      inside,
    );
    expect(text).toBe(
      "Section at lightness 0.680, following the selected color. sRGB and Display P3 outlines shown. Selected color is inside sRGB and Display P3.",
    );
    expect(
      announceSection("follow", 0.68, { srgb: ready(), "display-p3": ready() }, ok, {
        srgb: "outside",
        "display-p3": "outside",
      }),
    ).toContain("outside both gamuts");
  });
  it("describes a hidden or off-screen marker, and nothing otherwise", () => {
    expect(describeMarker(null, null)).toBeNull();
    expect(describeMarker(false, true)).toBeNull();
    expect(describeMarker(true, true)).toBe("The selected color is behind the surface.");
    expect(describeMarker(false, false)).toBe("The selected color is outside the current view.");
  });
});

describe("the authored color is not owned by the section modules", () => {
  it("compares as defined, not as observed", () => {
    const a: ColorValue = color("oklch", [0.68, 0.15, 252]);
    const b: ColorValue = color("oklch", [0.68, 0.15, 252]);
    expect(definingEquals(a, b)).toBe(true);
    const observedA = observeSelected(a);
    // Reauthoring from an OKLab observation would define a different color, even at the same point.
    if (observedA.status !== "ok") throw new Error("unavailable");
    const reauthored = color("oklab", [observedA.l, observedA.a, observedA.b]);
    expect(definingEquals(a, reauthored)).toBe(false);
  });
});
