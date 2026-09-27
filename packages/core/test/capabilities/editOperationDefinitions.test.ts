import { describe, expect, it } from "vitest";
import { editOperationDefinitions as operations } from "../../src/capabilities/editOperationDefinitions.js";
import { geometryDefinitions as geometries } from "../../src/capabilities/geometryDefinitions.js";
import { representationDefinitions as representations } from "../../src/capabilities/representationDefinitions.js";
import { normalizeHue } from "../../src/color/types.js";
import { definitionOf, definingEquals } from "../../src/color/value.js";
import { authorPlaneEdit } from "../../src/picker/edit.js";
import { oklabCoordinatePlanePoint } from "../../src/picker/keyboard.js";
import type { ColorResult } from "../../src/result.js";

function value<T>(result: ColorResult<T, unknown>): T {
  if (!result.ok) throw new Error("fixture operation failed");
  return result.value;
}

describe("existing semantic edit operations", () => {
  it("defines six meanings, with the existing authorship and composition functions", () => {
    expect(Object.keys(operations)).toEqual([
      "oklch-channel-patch",
      "oklch-hue-edit",
      "oklch-lc-point",
      "oklab-channel-patch",
      "oklab-ab-point",
      "oklab-disc-coordinate",
    ]);
    for (const [id, operation] of Object.entries(operations)) {
      expect(operation.id).toBe(id);
      expect(operation.author).toBe(authorPlaneEdit);
      expect(operation.request.plane).toBe(operation.representationId);
      expect(Object.isFrozen(operation)).toBe(true);
      expect(Object.isFrozen(operation.request)).toBe(true);
    }
    const hue = operations["oklch-hue-edit"];
    expect(hue.normalize).toBe(normalizeHue);
    expect(hue.channelId).toBe("oklch.h");
    expect(operations[hue.patchOperationId].request).toBe(hue.request);
    const disc = operations["oklab-disc-coordinate"];
    expect(disc.toPoint).toBe(oklabCoordinatePlanePoint);
    expect(operations[disc.pointOperationId].request).toBe(disc.request);
    expect(Object.isFrozen(disc.bindings)).toBe(true);
    expect(Object.isFrozen(operations)).toBe(true);
  });

  it("keeps raw Hue and overflow through patches and normalizes only the deliberate Hue composition", () => {
    const patch = operations["oklch-channel-patch"];
    const point = operations["oklch-lc-point"];
    const hue = operations["oklch-hue-edit"];
    const source = value(
      representations.oklch.author({ space: "oklch", channels: [1.4, 0.7, 720], alpha: -0 }),
    );
    for (const channels of [{ l: 1.5 }, { c: 0.8 }]) {
      const next = value(patch.author(source, { ...patch.request, channels }));
      const definition = definitionOf(next);
      expect(definition.channels).toEqual([channels.l ?? 1.4, channels.c ?? 0.7, 720]);
      expect(Object.is(definition.alpha, -0)).toBe(true);
    }
    const rawHue = value(patch.author(source, { ...patch.request, channels: { h: 400 } }));
    expect(definitionOf(rawHue).channels).toEqual([1.4, 0.7, 400]);
    for (const [requested, expected] of [
      [400, 40],
      [360, 0],
    ] as const) {
      const normalized = value(
        hue.author(source, { ...hue.request, channels: { h: hue.normalize(requested) } }),
      );
      expect(definitionOf(normalized)).toEqual({
        space: "oklch",
        channels: [1.4, 0.7, expected],
        alpha: -0,
      });
    }
    const geometry = geometries[point.geometryId];
    const projection = value(geometry.project(source, geometry.planeId));
    expect(projection.point.x).toBeGreaterThan(1);
    expect(geometry.contains(projection.point)).toBe(false);
    const bounded = value(point.author(source, { ...point.request, point: projection.point }));
    expect(definitionOf(bounded).channels).toEqual([1, geometry.domain.maximumChroma, 720]);
    expect(definitionOf(source).channels).toEqual([1.4, 0.7, 720]);
  });

  it("preserves signed zero through raw channel edits, including explicit Hue patches", () => {
    const patch = operations["oklch-channel-patch"];
    const source = value(
      representations.oklch.author({ space: "oklch", channels: [-0, -0, -0], alpha: -0 }),
    );
    const unchanged = value(patch.author(source, { ...patch.request, channels: { h: -0 } }));
    expect(definingEquals(source, unchanged)).toBe(true);
    const lightness = value(patch.author(source, { ...patch.request, channels: { l: 0.7 } }));
    expect(definitionOf(lightness)).toEqual({ space: "oklch", channels: [0.7, -0, -0], alpha: -0 });
    const lab = operations["oklab-channel-patch"];
    const labSource = value(
      representations.oklab.author({ space: "oklab", channels: [-0, -0, -0], alpha: -0 }),
    );
    expect(
      definingEquals(
        labSource,
        value(lab.author(labSource, { ...lab.request, channels: { a: -0 } })),
      ),
    ).toBe(true);
  });

  it("retains missing Hue, rejects missing direction and uses only explicitly supplied references", () => {
    const patch = operations["oklch-channel-patch"];
    const point = operations["oklch-lc-point"];
    const source = value(
      representations.oklch.author({ space: "oklch", channels: [0.6, 0, null], alpha: 0.3 }),
    );
    const lightness = value(patch.author(source, { ...patch.request, channels: { l: 0.7 } }));
    expect(definitionOf(lightness).channels).toEqual([0.7, 0, null]);
    expect(patch.author(source, { ...patch.request, channels: { c: 0.1 } })).toEqual({
      ok: false,
      error: { code: "missing-hue-direction" },
    });
    expect(point.author(source, { ...point.request, point: { x: 0.5, y: 0.25 } })).toEqual({
      ok: false,
      error: { code: "missing-hue-direction" },
    });
    const neutralPoint = value(
      point.author(source, { ...point.request, point: { x: 0, y: 0.25 } }),
    );
    expect(definitionOf(neutralPoint).channels).toEqual([0.75, 0, null]);
    // Low-level reference semantics also establish Hue during an achromatic L-only patch.
    const referenced = value(
      patch.author(source, { ...patch.request, channels: { l: 0.7 }, reference: { hue: 720 } }),
    );
    expect(definitionOf(referenced).channels).toEqual([0.7, 0, 720]);
    const directed = value(
      point.author(source, {
        ...point.request,
        point: { x: 0.5, y: 0.25 },
        reference: { hue: 720 },
      }),
    );
    expect(definitionOf(directed)).toEqual({
      space: "oklch",
      channels: [0.75, 0.2, 720],
      alpha: 0.3,
    });
    const explicitNull = value(
      patch.author(source, { ...patch.request, channels: { h: null }, reference: { hue: 45 } }),
    );
    expect(definingEquals(source, explicitNull)).toBe(true);
    const numeric = value(patch.author(source, { ...patch.request, channels: { h: 0 } }));
    expect(definingEquals(source, numeric)).toBe(false);
    expect(
      definitionOf(
        value(
          patch.author(numeric, { ...patch.request, channels: { l: 0.7 }, reference: { hue: 45 } }),
        ),
      ).channels[2],
    ).toBe(0);
  });

  it("keeps raw OKLab patches outside the disc, including L-only edits", () => {
    const patch = operations["oklab-channel-patch"];
    const source = value(
      representations.oklab.author({ space: "oklab", channels: [0.6, 0.8, -0.7], alpha: 0.37 }),
    );
    expect(patch.geometryId).toBeNull();
    const axes = value(patch.author(source, { ...patch.request, channels: { a: 1.1, b: -1.2 } }));
    const lightness = value(patch.author(axes, { ...patch.request, channels: { l: 1.4 } }));
    expect(definitionOf(lightness)).toEqual({
      space: "oklab",
      channels: [1.4, 1.1, -1.2],
      alpha: 0.37,
    });
    const geometry = geometries["oklab-ab-disc"];
    expect(geometry.contains(value(geometry.project(lightness, geometry.planeId)).point)).toBe(
      false,
    );
  });

  it.each(["oklab.a", "oklab.b"] as const)(
    "binds %s to scalar preclamp then coupled disc authorship",
    (channelId) => {
      const operation = operations["oklab-disc-coordinate"];
      const geometry = geometries[operation.geometryId];
      const source = value(
        representations.oklab.author({
          space: "oklab",
          channels: [1.4, 0.3, 0.3],
          alpha: 0.372913,
        }),
      );
      const observation = value(geometry.project(source, geometry.planeId));
      const coordinate = operation.bindings[channelId];
      const point = operation.toPoint(observation, coordinate, 2);
      // Preclamping 2 to 0.4 before radial constraint gives a 0.32/0.24 vector.
      const next = value(operation.author(source, { ...operation.request, point }));
      const definition = definitionOf(next);
      expect(definition.channels[0]).toBe(1.4);
      expect(definition.alpha).toBe(0.372913);
      expect(definition.channels[coordinate === "a" ? 1 : 2]).toBeCloseTo(0.32, 14);
      expect(definition.channels[coordinate === "a" ? 2 : 1]).toBeCloseTo(0.24, 14);
      expect(geometry.contains(value(geometry.project(next, geometry.planeId)).point)).toBe(true);
      expect(point).toEqual(operation.toPoint(observation, coordinate, geometry.domain.radius));
      expect(() => operation.toPoint(observation, coordinate, Infinity)).toThrow(
        "OKLab coordinate must be finite",
      );
    },
  );

  it("keeps owner-specific invalid-edit, definition and conversion failures", () => {
    const patch = operations["oklch-channel-patch"];
    const point = operations["oklch-lc-point"];
    const source = value(
      representations.oklch.author({ space: "oklch", channels: [0.6, 0, null], alpha: 1 }),
    );
    expect(patch.author(source, { ...patch.request, channels: {} })).toEqual({
      ok: false,
      error: { code: "invalid-plane-edit" },
    });
    expect(patch.author(source, { ...patch.request, channels: { c: -0.1 } })).toEqual({
      ok: false,
      error: { code: "invalid-definition" },
    });
    expect(patch.author(source, { ...patch.request, channels: { c: 0.1, h: null } })).toEqual({
      ok: false,
      error: { code: "invalid-definition" },
    });
    expect(
      patch.author(source, { ...patch.request, channels: { l: 0.7 }, reference: { hue: NaN } }),
    ).toEqual({ ok: false, error: { code: "invalid-plane-edit" } });
    expect(point.author(source, { ...point.request, point: { x: Infinity, y: 0 } })).toEqual({
      ok: false,
      error: { code: "invalid-plane-edit" },
    });
    const alpha = value(patch.author(source, { ...patch.request, channels: {}, alpha: 0.4 }));
    expect(definitionOf(alpha)).toEqual({ space: "oklch", channels: [0.6, 0, null], alpha: 0.4 });
    const huge = value(
      representations.srgb.author({ space: "srgb", channels: [1e308, 0, 0], alpha: 1 }),
    );
    expect(patch.author(huge, { ...patch.request, channels: { l: 0.5 } })).toEqual({
      ok: false,
      error: { code: "numerical-range", from: "srgb", to: "oklch" },
    });
  });
});
