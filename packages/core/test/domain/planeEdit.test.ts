import { describe, expect, it } from "vitest";
import {
  analyzeGamut,
  authorPlaneEdit,
  createColorValue,
  definitionOf,
  definingEquals,
  keyboardPlanePoint,
  oklabCoordinatePlanePoint,
  projectColorToPlane,
  type ColorRepresentation,
  type ColorValue,
} from "../../src/index.js";

function create(definition: ColorRepresentation): ColorValue {
  const result = createColorValue(definition);
  if (!result.ok) throw new Error("invalid fixture");
  return result.value;
}

function edited(result: ReturnType<typeof authorPlaneEdit>): ColorValue {
  if (!result.ok) throw new Error(`edit failed: ${result.error.code}`);
  return result.value;
}

describe("ColorValue plane observations and authorship", () => {
  it("resolves keyboard and numeric geometry before edit authorship", () => {
    const source = create({ space: "oklch", channels: [0.6, 0.2, 210], alpha: 0.7 });
    const lch = projectColorToPlane(source, "oklch");
    const lab = projectColorToPlane(source, "oklab");
    if (!lch.ok || !lab.ok) throw new Error("projection failed");
    const lchPoint = keyboardPlanePoint(lch.value, "increase-x", false);
    const lchEdit = edited(
      authorPlaneEdit(source, { plane: "oklch", kind: "point", point: lchPoint }),
    );
    expect(definitionOf(lchEdit).channels[1]).toBeCloseTo(0.205, 12);
    const labPoint = keyboardPlanePoint(lab.value, "minimum-x", false);
    const labEdit = edited(
      authorPlaneEdit(source, { plane: "oklab", kind: "point", point: labPoint }),
    );
    expect(definitionOf(labEdit).space).toBe("oklab");
    const coordinatePoint = oklabCoordinatePlanePoint(lab.value, "a", 0.4);
    expect(Math.hypot(coordinatePoint.x - 0.5, coordinatePoint.y - 0.5)).toBeLessThanOrEqual(0.5);
    expect(definitionOf(source).space).toBe("oklch");
  });
  const definitions = [
    { space: "srgb", channels: [1.2, -0.1, 0.4], alpha: -0 },
    { space: "display-p3", channels: [1, 0.3, -0.2], alpha: 0.372913 },
    { space: "oklch", channels: [0.6, 0.2, 720], alpha: 1 },
    { space: "oklab", channels: [0.6, 0.2, -0.1], alpha: 0.5 },
  ] as const satisfies readonly ColorRepresentation[];

  it.each(
    definitions.flatMap((definition) =>
      (["oklch", "oklab"] as const).map((plane) => [definition, plane] as const),
    ),
  )(
    "observes %o and re-authors a %s lightness edit without altering unedited channels",
    (definition, plane) => {
      const source = create(definition);
      const before = definitionOf(source);
      const projected = projectColorToPlane(source, plane);
      if (!projected.ok) throw new Error("projection failed");
      const channels = projected.value.representation.channels;
      const l = channels[0] + 0.01;
      const next = edited(authorPlaneEdit(source, { plane, kind: "channels", channels: { l } }));
      expect(definitionOf(next)).toEqual({
        space: plane,
        channels: [l, channels[1], channels[2]],
        alpha: definition.alpha,
      });
      expect(definingEquals(source, next)).toBe(false);
      expect(definitionOf(source)).toBe(before);
      expect(Object.is(definitionOf(next).alpha, definition.alpha)).toBe(true);
    },
  );

  it("keeps view selection outside ColorValue and detects even equivalent re-authorship", () => {
    const source = create({ space: "srgb", channels: [1, 0, 0], alpha: 1 });
    const before = definitionOf(source);
    for (const plane of ["oklch", "oklab", "oklch"] as const) {
      expect(projectColorToPlane(source, plane).ok).toBe(true);
    }
    expect(definitionOf(source)).toBe(before);
    const projection = projectColorToPlane(source, "oklab");
    if (!projection.ok) throw new Error("projection failed");
    const reauthored = edited(
      authorPlaneEdit(source, {
        plane: "oklab",
        kind: "channels",
        channels: { l: projection.value.representation.channels[0] },
      }),
    );
    expect(definitionOf(reauthored).space).toBe("oklab");
    expect(definingEquals(source, reauthored)).toBe(false);
  });

  it("preserves extended coordinates and keeps instrument limits distinct from gamut mapping", () => {
    const source = create({ space: "oklch", channels: [1.4, 0.7, 720], alpha: 0.25 });
    const projection = projectColorToPlane(source, "oklch");
    if (!projection.ok) throw new Error("projection failed");
    expect(projection.value.point.x).toBeGreaterThan(1);
    expect(projection.value.point.y).toBeLessThan(0);
    const channelEdit = edited(
      authorPlaneEdit(source, { plane: "oklch", kind: "channels", channels: { l: 1.5 } }),
    );
    expect(definitionOf(channelEdit)).toEqual({
      space: "oklch",
      channels: [1.5, 0.7, 720],
      alpha: 0.25,
    });
    expect(analyzeGamut(channelEdit, "srgb-gamut")).toMatchObject({
      ok: true,
      value: { status: "outside" },
    });
    const pointEdit = edited(
      authorPlaneEdit(source, { plane: "oklch", kind: "point", point: { x: 2, y: -1 } }),
    );
    expect(definitionOf(pointEdit).channels).toEqual([1, 0.4, 720]);
  });
});

describe("neutral editing reference", () => {
  it("retains an authored numeric hue exactly through neutral edits", () => {
    const source = create({ space: "oklch", channels: [0.6, 0, 720], alpha: -0 });
    for (const channels of [{ l: 0.7 }, { c: 0 }, { c: 0.1 }]) {
      const next = edited(authorPlaneEdit(source, { plane: "oklch", kind: "channels", channels }));
      expect(definitionOf(next).channels[2]).toBe(720);
      expect(Object.is(definitionOf(next).alpha, -0)).toBe(true);
    }
    const chromatic = create({ space: "oklch", channels: [0.6, 0.2, 720], alpha: 1 });
    const zeroed = edited(
      authorPlaneEdit(chromatic, { plane: "oklch", kind: "channels", channels: { c: 0 } }),
    );
    expect(definitionOf(zeroed).channels).toEqual([0.6, 0, 720]);
  });

  it("keeps absent hue absent until an explicit direction or hue edit supplies one", () => {
    const source = create({ space: "oklab", channels: [0.6, 0, 0], alpha: 1 });
    const observation = projectColorToPlane(source, "oklch");
    if (!observation.ok) throw new Error("projection failed");
    expect(observation.value.representation.channels).toEqual([0.6, 0, null]);
    const neutral = edited(
      authorPlaneEdit(source, { plane: "oklch", kind: "channels", channels: { l: 0.7 } }),
    );
    expect(definitionOf(neutral).channels).toEqual([0.7, 0, null]);
    expect(
      authorPlaneEdit(source, { plane: "oklch", kind: "channels", channels: { c: 0.1 } }),
    ).toMatchObject({
      ok: false,
      error: { code: "missing-hue-direction" },
    });
    expect(
      authorPlaneEdit(source, { plane: "oklch", kind: "point", point: { x: 0.25, y: 0.4 } }),
    ).toMatchObject({ ok: false, error: { code: "missing-hue-direction" } });
    const directed = edited(
      authorPlaneEdit(source, {
        plane: "oklch",
        kind: "channels",
        channels: { c: 0.1 },
        reference: { hue: 275 },
      }),
    );
    expect(definitionOf(directed).channels).toEqual([0.6, 0.1, 275]);
    const directedNeutral = edited(
      authorPlaneEdit(source, {
        plane: "oklch",
        kind: "channels",
        channels: { l: 0.7 },
        reference: { hue: 275 },
      }),
    );
    expect(definitionOf(directedNeutral).channels).toEqual([0.7, 0, 275]);
    const established = edited(
      authorPlaneEdit(source, { plane: "oklch", kind: "channels", channels: { h: 400 } }),
    );
    expect(definitionOf(established).channels).toEqual([0.6, 0, 400]);
    expect(definitionOf(source).channels).toEqual([0.6, 0, 0]);
  });

  it("authors actual OKLab axes at and away from the centre without hue state", () => {
    const source = create({ space: "oklab", channels: [0.6, 0, 0], alpha: 0.7 });
    const center = edited(
      authorPlaneEdit(source, { plane: "oklab", kind: "point", point: { x: 0.5, y: 0.5 } }),
    );
    expect(definitionOf(center)).toEqual({ space: "oklab", channels: [0.6, 0, 0], alpha: 0.7 });
    const moved = edited(
      authorPlaneEdit(source, {
        plane: "oklab",
        kind: "channels",
        channels: { a: 0.25, b: -0.15 },
      }),
    );
    expect(definitionOf(moved).channels).toEqual([0.6, 0.25, -0.15]);
    const dragged = edited(
      authorPlaneEdit(source, { plane: "oklab", kind: "point", point: { x: 0.75, y: 0.5 } }),
    );
    expect(definitionOf(dragged).channels).toEqual([0.6, 0.2, 0]);
    const projected = projectColorToPlane(moved, "oklab");
    if (!projected.ok) throw new Error("projection failed");
    expect(projected.value.representation.channels).toEqual([0.6, 0.25, -0.15]);
  });

  it("changes signed-zero alpha only when explicitly edited", () => {
    const source = create({ space: "oklab", channels: [0.6, 0, 0], alpha: -0 });
    const preserved = edited(
      authorPlaneEdit(source, { plane: "oklab", kind: "channels", channels: { a: 0.1 } }),
    );
    expect(Object.is(definitionOf(preserved).alpha, -0)).toBe(true);
    const changed = edited(
      authorPlaneEdit(source, { plane: "oklab", kind: "channels", channels: {}, alpha: 0.5 }),
    );
    expect(definitionOf(changed).alpha).toBe(0.5);
  });

  it("reports invalid edits and numerical projection failure through results", () => {
    const source = create({ space: "oklch", channels: [0.6, 0, null], alpha: 1 });
    expect(
      authorPlaneEdit(source, { plane: "oklch", kind: "channels", channels: {} }),
    ).toMatchObject({ ok: false, error: { code: "invalid-plane-edit" } });
    expect(
      authorPlaneEdit(source, { plane: "oklch", kind: "channels", channels: { c: Number.NaN } }),
    ).toMatchObject({ ok: false, error: { code: "invalid-definition" } });
    expect(
      authorPlaneEdit(source, {
        plane: "oklch",
        kind: "channels",
        channels: { c: 0.1 },
        reference: { hue: Number.NaN },
      }),
    ).toMatchObject({ ok: false, error: { code: "invalid-plane-edit" } });
    const huge = create({ space: "oklch", channels: [0.6, 1e308, 50], alpha: 1 });
    expect(projectColorToPlane(huge, "oklch")).toMatchObject({
      ok: false,
      error: { code: "numerical-range" },
    });
  });
});
