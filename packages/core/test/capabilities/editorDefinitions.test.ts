import { describe, expect, it } from "vitest";
import {
  editorDefinitions,
  editorsByRepresentation,
  type EditorsByRepresentation,
} from "../../src/capabilities/editorDefinitions.js";
import { editOperationDefinitions } from "../../src/capabilities/editOperationDefinitions.js";
import { geometryDefinitions } from "../../src/capabilities/geometryDefinitions.js";
import { representationDefinitions } from "../../src/capabilities/representationDefinitions.js";
import { definitionOf } from "../../src/color/value.js";
import { OKLAB_AB_PLANE, OKLCH_LIGHTNESS_CHROMA_PLANE } from "../../src/picker/plane.js";
import type { ColorResult } from "../../src/result.js";

function value<T>(result: ColorResult<T, unknown>): T {
  if (!result.ok) throw new Error("fixture operation failed");
  return result.value;
}

describe("primary editor relations and geometry", () => {
  it("defines exactly two contexts and keeps construction/observation independent of editors", () => {
    expect(Object.keys(editorDefinitions)).toEqual(["oklch-lc", "oklab-ab"]);
    expect(editorsByRepresentation).toEqual({
      oklch: ["oklch-lc"],
      oklab: ["oklab-ab"],
      srgb: [],
      "display-p3": [],
    });
    for (const definition of [
      representationDefinitions.srgb,
      representationDefinitions["display-p3"],
    ]) {
      expect(definition.model).toBe("rgb");
      expect(definition.encoding).toEqual({
        kind: "rgb",
        primaries: definition.id,
        transfer: "srgb",
      });
      expect(editorsByRepresentation[definition.id]).toHaveLength(0);
    }
    const srgb = representationDefinitions.srgb;
    const p3 = representationDefinitions["display-p3"];
    const rgb = value(srgb.author({ space: srgb.id, channels: [1.2, -0.1, 0.4], alpha: 0.5 }));
    const wide = value(p3.author({ space: p3.id, channels: [-0.2, 0.4, 1.1], alpha: 0.5 }));
    expect(value(srgb.observe(rgb, srgb.id))).toEqual(definitionOf(rgb));
    expect(value(p3.observe(wide, p3.id))).toEqual(definitionOf(wide));
    for (const [space, editors] of Object.entries(editorsByRepresentation)) {
      expect(new Set(editors).size).toBe(editors.length);
      for (const id of editors) {
        const editor = editorDefinitions[id];
        expect(editor.id).toBe(id);
        expect(editor.representationId).toBe(space);
        expect(geometryDefinitions[editor.geometryId].representationId).toBe(space);
        const operation = editOperationDefinitions[editor.pointOperationId];
        expect(operation.representationId).toBe(space);
        expect(operation.geometryId).toBe(editor.geometryId);
        expect(operation.kind).toBe("point");
      }
    }
  });

  it("allows zero, one and multiple contexts without adding a production editor", () => {
    type FixtureEditor =
      | { readonly id: "fixture-first" | "fixture-second"; readonly representationId: "oklch" }
      | { readonly id: "fixture-single"; readonly representationId: "oklab" };
    const relation = {
      oklch: ["fixture-first", "fixture-second"],
      oklab: ["fixture-single"],
      srgb: [],
      "display-p3": [],
    } as const satisfies EditorsByRepresentation<FixtureEditor>;
    expect(relation.oklch).toHaveLength(2);
    expect(relation.oklab).toHaveLength(1);
    expect(relation.srgb).toHaveLength(0);
    expect(Object.keys(editorDefinitions)).toHaveLength(2);
  });

  it("references the existing geometry authorities without bringing in their labels or samplers", () => {
    expect(Object.keys(geometryDefinitions)).toEqual(["oklch-lc-rectangle", "oklab-ab-disc"]);
    for (const geometry of Object.values(geometryDefinitions)) {
      const plane =
        geometry.representationId === "oklch" ? OKLCH_LIGHTNESS_CHROMA_PLANE : OKLAB_AB_PLANE;
      expect(geometry.constrain).toBe(plane.constrainPoint);
      expect(geometry.contains).toBe(plane.isPointInInstrumentDomain);
      expect(geometry.project).toBeTypeOf("function");
      expect(geometry.keyboard).toBeTypeOf("function");
      expect(geometry.xDirection).toBe("increasing");
      expect(geometry.yDirection).toBe("decreasing");
      expect(geometry).not.toHaveProperty("sampleField");
      expect(geometry).not.toHaveProperty("label");
    }
  });

  it("binds L/C axes, fixed Hue, rectangular bounds and keyboard movement to point authorship", () => {
    const editor = editorDefinitions["oklch-lc"];
    const geometry = geometryDefinitions[editor.geometryId];
    const operation = editOperationDefinitions[editor.pointOperationId];
    expect([geometry.x, geometry.y, geometry.fixed]).toEqual(["oklch.c", "oklch.l", "oklch.h"]);
    expect(geometry.domain).toEqual({ kind: "rectangle", lightness: [0, 1], maximumChroma: 0.4 });
    const source = value(
      representationDefinitions.oklch.author({
        space: "oklch",
        channels: [0.6, 0.2, 720],
        alpha: 0.3,
      }),
    );
    const projected = value(geometry.project(source));
    expect(projected.geometryId).toBe(geometry.id);
    expect(projected.channels).toEqual({ x: geometry.x, y: geometry.y, fixed: geometry.fixed });
    expect(projected.point).toEqual({ x: 0.5, y: 0.4 });
    expect(geometry.fromPoint(geometry.toPoint(0.75, 0.2))).toEqual({ l: 0.75, c: 0.2 });
    const point = geometry.keyboard(projected, "increase-x", true);
    const next = value(operation.author(source, { ...operation.request, point }));
    expect(definitionOf(next).channels[1]).toBeCloseTo(0.22, 14);
    expect(definitionOf(next).channels[2]).toBe(720);
    expect(definitionOf(next).alpha).toBe(0.3);
    expect(geometry.constrain({ x: 2, y: -1 })).toEqual({ x: 1, y: 0 });
  });

  it("binds a/b axes, raw overflow projection and disc-intersection keyboard math to point authorship", () => {
    const editor = editorDefinitions["oklab-ab"];
    const geometry = geometryDefinitions[editor.geometryId];
    const operation = editOperationDefinitions[editor.pointOperationId];
    expect([geometry.x, geometry.y, geometry.fixed]).toEqual(["oklab.a", "oklab.b", "oklab.l"]);
    expect(geometry.domain).toEqual({ kind: "disc", radius: 0.4 });
    const source = value(
      representationDefinitions.oklab.author({
        space: "oklab",
        channels: [1.4, 0.8, 0.24],
        alpha: -0,
      }),
    );
    const projected = value(geometry.project(source));
    expect(projected.geometryId).toBe(geometry.id);
    expect(projected.coordinates).toEqual({ x: 0.8, y: 0.24, fixed: 1.4 });
    expect(projected.point.x).toBeGreaterThan(1);
    expect(geometry.contains(projected.point)).toBe(false);
    expect(geometry.contains({ x: 1, y: 0 })).toBe(false);
    expect(geometry.toPoint(0, 0)).toEqual({ x: 0.5, y: 0.5 });
    const rawAxes = geometry.fromPoint(projected.point);
    expect(rawAxes.a).toBeCloseTo(0.8, 14);
    expect(rawAxes.b).toBeCloseTo(0.24, 14);
    const endPoint = geometry.keyboard(projected, "maximum-x", false);
    const next = value(operation.author(source, { ...operation.request, point: endPoint }));
    expect(definitionOf(next).channels[0]).toBe(1.4);
    expect(definitionOf(next).channels[1]).toBeCloseTo(0.32, 14);
    expect(definitionOf(next).channels[2]).toBeCloseTo(0.24, 14);
    expect(Object.is(definitionOf(next).alpha, -0)).toBe(true);
    const constrained = value(
      operation.author(source, { ...operation.request, point: projected.point }),
    );
    expect(geometry.contains(value(geometry.project(constrained)).point)).toBe(true);
    expect(definitionOf(source).channels[1]).toBe(0.8);
  });

  it("keeps definitions and relation arrays immutable", () => {
    for (const table of [geometryDefinitions, editorDefinitions, editorsByRepresentation]) {
      expect(Object.isFrozen(table)).toBe(true);
      for (const entry of Object.values(table)) expect(Object.isFrozen(entry)).toBe(true);
    }
    for (const geometry of Object.values(geometryDefinitions)) {
      expect(Object.isFrozen(geometry.domain)).toBe(true);
      if (geometry.domain.kind === "rectangle")
        expect(Object.isFrozen(geometry.domain.lightness)).toBe(true);
    }
  });
});
