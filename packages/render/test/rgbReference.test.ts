import { afterEach, describe, expect, it, vi } from "vitest";
import { createColorValue, represent, getPickerGuide, type ColorValue } from "@gamut-plane/core";
import * as capabilities from "@gamut-plane/core/internal/capabilities";
import {
  resolveEditorVisualSupport,
  resolveField,
  resolveRequestedGuides,
} from "../src/capabilities/index.js";
import { currentField } from "../src/current/field.js";
import {
  referenceDisplay,
  RGB_REFERENCE_SLICE_COMPATIBILITY_TOLERANCE as tolerance,
} from "../src/current/referenceDisplay.js";
import { PICKER_GAMUT_TABLES } from "../src/generated/gamutTables.js";

vi.mock("@gamut-plane/core/internal/capabilities", async (original) => {
  const actual = await original<typeof capabilities>();
  return { ...actual, convertRgbReference: vi.fn(actual.convertRgbReference) };
});
afterEach(() => vi.restoreAllMocks());
const bindings = [
  ["srgb-rg", "srgb", 0, 1, 2],
  ["srgb-rb", "srgb", 0, 2, 1],
  ["srgb-gb", "srgb", 1, 2, 0],
  ["display-p3-rg", "display-p3", 0, 1, 2],
  ["display-p3-rb", "display-p3", 0, 2, 1],
  ["display-p3-gb", "display-p3", 1, 2, 0],
] as const;
function color(
  space: "srgb" | "display-p3",
  channels: readonly [number, number, number],
): ColorValue {
  const result = createColorValue({ space, channels, alpha: 0.37 });
  if (!result.ok) throw Error("fixture");
  return result.value;
}
const sample = getPickerGuide({ l: 0.6, c: 0.3, h: 240, alpha: 0.37 }, PICKER_GAMUT_TABLES.srgb);
describe("truthful RGB sampled Reference", () => {
  it.each(bindings)(
    "%s retains the original endpoint and enforces actual fixed-coordinate compatibility",
    (id, space, x, y, f) => {
      const channels = capabilities.convertRgbReference(sample.color, space)!;
      expect(channels.every((v) => v >= 0 && v <= 1)).toBe(true);
      const native: [number, number, number] = [...channels];
      native[x] = 1.2;
      native[y] = -0.1;
      const source = color(space, native);
      const editor = resolveEditorVisualSupport(id);
      const field = currentField(editor, resolveField(source, editor));
      const rows = resolveRequestedGuides(source, editor, ["srgb-boundary"]);
      const row = rows[0]!;
      if (row.kind !== "resolved") throw Error("row");
      const guides = [
        {
          ...row,
          forms: { ...row.forms, reference: { kind: "available" as const, value: sample } },
        },
      ];
      const checks = capabilities.analyzeRequestedGamuts(source, ["srgb-gamut"]);
      const result = referenceDisplay("srgb-gamut", guides, field, checks)!;
      expect(result.sampled).toBe(sample);
      expect(result.showExcursion).toBe(true);
      expect(result.spatial).toMatchObject({
        kind: "available",
        point: { x: channels[x], y: 1 - channels[y] },
      });
      expect(field.projection.point).toEqual({ x: 1.2, y: 1.1 });
      for (const delta of [tolerance * 0.999, tolerance * 1.001, 0.001]) {
        const shifted: [number, number, number] = [...native];
        shifted[f] += delta;
        const next = color(space, shifted);
        const nextField = currentField(editor, resolveField(next, editor));
        const projection = referenceDisplay("srgb-gamut", guides, nextField, checks)!;
        expect(projection.spatial.kind).toBe(delta < tolerance ? "available" : "unavailable");
        expect(projection.sampled).toBe(sample);
        expect(projection.showExcursion).toBe(true);
      }
      // The complete annotation gate remains independent of deltaC and slice contour success.
      for (const deltaC of [0, 0.2]) {
        const changed = [
          {
            ...row,
            forms: {
              ...row.forms,
              reference: { kind: "available" as const, value: { ...sample, deltaC } },
            },
          },
        ];
        expect(referenceDisplay("srgb-gamut", changed, field, checks)?.showExcursion).toBe(true);
        expect(referenceDisplay("srgb-gamut", changed, field, [])?.showExcursion).toBe(false);
      }
      expect(referenceDisplay(null, guides, field, checks)).toBeNull();
      expect(referenceDisplay("display-p3-gamut", guides, field, checks)).toBeNull();
      expect(referenceDisplay("srgb-gamut", [], field, checks)).toBeNull();
      for (const channels of [
        [0.3, 0.5, 0.5],
        [-1e-10, 0.5, 0.5],
        [Number.MAX_VALUE, 0, 0],
      ] as const) {
        const nonOutside = capabilities.analyzeRequestedGamuts(color("srgb", channels), [
          "srgb-gamut",
        ]);
        expect(referenceDisplay("srgb-gamut", guides, field, nonOutside)?.showExcursion).toBe(
          false,
        );
      }
      expect(referenceDisplay("srgb-gamut", guides, null, checks)?.spatial.kind).toBe(
        "unavailable",
      );
      vi.mocked(capabilities.convertRgbReference).mockReturnValueOnce(null);
      expect(referenceDisplay("srgb-gamut", guides, field, checks)?.spatial.kind).toBe(
        "unavailable",
      );
      for (const invalid of [NaN, Infinity, -0.00001, 1.00001]) {
        const converted: [number, number, number] = [...channels];
        converted[x] = invalid;
        vi.mocked(capabilities.convertRgbReference).mockReturnValueOnce(converted);
        expect(referenceDisplay("srgb-gamut", guides, field, checks)?.spatial.kind).toBe(
          "unavailable",
        );
      }
    },
  );
  it.each(["srgb", "display-p3"] as const)(
    "%s conversion noise is below the dedicated encoded threshold including transfer transitions",
    (space) => {
      let max = 0;
      const grid = [-1, -0.04045, -0.01, 0, 0.0031308, 0.040449907, 0.04045, 0.5, 1, 1.2];
      for (const r of grid)
        for (const g of grid)
          for (const b of grid) {
            const original = [r, g, b] as const;
            const observation = represent(color(space, original), "oklch");
            if (!observation.ok) throw Error("observation");
            const [l, c, h] = observation.value.channels;
            const converted = capabilities.convertRgbReference(
              { l, c, h: h ?? 0, alpha: 0.37 },
              space,
            )!;
            max = Math.max(max, ...original.map((v, i) => Math.abs(v - converted[i]!)));
          }
      expect(max).toBeLessThan(tolerance);
      expect(max).toBeGreaterThan(1e-8); // Protect the junction case; a coarse cube grid misses this noise.
      expect(
        capabilities.convertRgbReference({ l: Number.MAX_VALUE, c: 1, h: 20, alpha: 1 }, space),
      ).toBeNull();
    },
  );
});
