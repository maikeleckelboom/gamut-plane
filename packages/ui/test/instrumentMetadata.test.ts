import { describe, expect, it } from "vitest";
import { geometryDefinitions, editorDefinitions } from "@gamut-plane/core/internal/capabilities";
import {
  currentPrimaryEditors,
  editorUi,
  representationUi,
  orderedCompanions,
  channelControlPresentation,
} from "../src/instrumentMetadata.js";

describe("current instrument metadata", () => {
  it("derives one fixed rail and two plane cards from each admitted geometry", () => {
    const expected = [
      ["H", "L", "C"],
      ["L", "a", "b"],
      ["B", "R", "G"],
      ["G", "R", "B"],
      ["R", "G", "B"],
      ["B", "R", "G"],
      ["G", "R", "B"],
      ["R", "G", "B"],
    ];
    for (const [index, editor] of currentPrimaryEditors.entries()) {
      const geometry = geometryDefinitions[editorDefinitions[editor.id].geometryId];
      const controls = orderedCompanions<import("../src/instrumentMetadata.js").CompanionControl>(
        editor.companions,
        geometry,
      );
      expect(controls.map((control) => control.symbol)).toEqual(expected[index]);
      expect(
        controls.map((control) => channelControlPresentation(control.channelId, geometry)),
      ).toEqual(["rail", "card", "card"]);
      expect(controls[0]?.channelId).toBe(geometry.fixed);
      expect(new Set(controls.slice(1).map((control) => control.channelId))).toEqual(
        new Set([geometry.x, geometry.y]),
      );
    }
  });
  it("labels all four representations and explicitly admits the eight editors", () => {
    expect(Object.entries(representationUi).map(([key, row]) => [key, row.id, row.label])).toEqual([
      ["oklch", "oklch", "OKLCH"],
      ["oklab", "oklab", "OKLab"],
      ["srgb", "srgb", "sRGB"],
      ["display-p3", "display-p3", "Display P3"],
    ]);
    expect(currentPrimaryEditors.map((editor) => editor.id)).toEqual([
      "oklch-lc",
      "oklab-ab",
      "srgb-rg",
      "srgb-rb",
      "srgb-gb",
      "display-p3-rg",
      "display-p3-rb",
      "display-p3-gb",
    ]);
  });

  it("composes only the six shipped companions in display order with semantic operations", () => {
    expect(Object.keys(editorUi)).toEqual(currentPrimaryEditors.map((editor) => editor.id));
    expect(
      [editorUi["oklch-lc"], editorUi["oklab-ab"]].map((editor) =>
        editor.companions.map((control) => [
          control.channelId,
          control.operationId,
          control.controlKind,
          control.label,
        ]),
      ),
    ).toEqual([
      [
        ["oklch.h", "oklch-hue-edit", "range-and-number", "Hue"],
        ["oklch.l", "oklch-channel-patch", "range-and-number", "Lightness"],
        ["oklch.c", "oklch-channel-patch", "range-and-number", "Chroma"],
      ],
      [
        ["oklab.l", "oklab-channel-patch", "range-and-number", "Lightness"],
        ["oklab.a", "oklab-disc-coordinate", "range-and-number", "a"],
        ["oklab.b", "oklab-disc-coordinate", "range-and-number", "b"],
      ],
    ]);
    for (const editor of currentPrimaryEditors) {
      for (const control of editor.companions) expect(control).not.toHaveProperty("editorId");
    }
  });

  it("keeps slider spans, numeric completion bounds and display precision distinct", () => {
    expect(
      [editorUi["oklch-lc"], editorUi["oklab-ab"]].map((editor) =>
        editor.companions.map((control) => [
          "sliderRange" in control ? control.sliderRange : null,
          control.numericBounds,
          control.step,
          control.precision,
        ]),
      ),
    ).toEqual([
      [
        [{ min: 0, max: 360 }, { min: 0, max: 360 }, 0.1, 1],
        [{ min: 0, max: 1 }, { min: 0, max: 1 }, 0.001, 4],
        [{ min: 0, max: 0.4 }, { min: 0 }, 0.001, 4],
      ],
      [
        [{ min: 0, max: 1 }, { min: 0, max: 1 }, 0.001, 4],
        ["geometry", "geometry", 0.001, 4],
        ["geometry", "geometry", 0.001, 4],
      ],
    ]);
  });

  it("keeps R/G/B order, native operations and unbounded numbers across RGB Areas", () => {
    for (const editor of currentPrimaryEditors) {
      if (editor.representationId !== "srgb" && editor.representationId !== "display-p3") continue;
      expect(
        editor.companions.map((control) => [
          control.symbol,
          control.label,
          control.channelId,
          control.operationId,
        ]),
      ).toEqual([
        ["R", "Red", `${editor.representationId}.r`, `${editor.representationId}-channel-patch`],
        ["G", "Green", `${editor.representationId}.g`, `${editor.representationId}-channel-patch`],
        ["B", "Blue", `${editor.representationId}.b`, `${editor.representationId}-channel-patch`],
      ]);
      for (const control of editor.companions)
        expect(control).toMatchObject({
          sliderRange: { min: 0, max: 1 },
          numericBounds: {},
          step: 0.001,
          precision: 4,
        });
    }
  });

  it("freezes every nested product descriptor without functions or value-dependent facts", () => {
    function frozen(value: unknown): void {
      expect(typeof value).not.toBe("function");
      if (value === null || typeof value !== "object") return;
      expect(Object.isFrozen(value)).toBe(true);
      for (const child of Object.values(value)) frozen(child);
    }
    for (const catalog of [representationUi, editorUi, currentPrimaryEditors]) frozen(catalog);
    expect(Reflect.set(editorUi["oklch-lc"].companions[0].sliderRange, "max", 720)).toBe(false);
    expect(editorUi["oklch-lc"].companions[0].sliderRange.max).toBe(360);
  });
});
