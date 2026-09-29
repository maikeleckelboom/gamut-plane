import { describe, expect, it } from "vitest";
import { editOperationDefinitions } from "../../src/capabilities/editOperationDefinitions.js";
import { geometryDefinitions } from "../../src/capabilities/geometryDefinitions.js";
import { createColorValue, definitionOf } from "../../src/color/value.js";
import type { ColorResult } from "../../src/result.js";

const operation = editOperationDefinitions["oklab-disc-coordinate"];
const geometry = geometryDefinitions["oklab-ab-disc"];
function unwrap<T>(result: ColorResult<T, unknown>): T {
  if (!result.ok) throw Error("fixture");
  return result.value;
}
describe("OKLab direct disc slices", () => {
  it("stabilizes server/browser last-bit observation differences while rounding inward", () => {
    const ranges = [-0.3541711497998213, -0.3541711497998214].map((counterpart) => {
      const source = unwrap(
        createColorValue({ space: "oklab", channels: [0.68, 0, counterpart], alpha: 1 }),
      );
      const range = operation.directRange(unwrap(geometry.project(source)), "a")!;
      const exact = Math.sqrt(0.4 ** 2 - counterpart ** 2);
      expect(range.max).toBeLessThanOrEqual(exact);
      expect(exact - range.max).toBeLessThan(1e-12);
      return range;
    });
    expect(ranges[0]).toEqual(ranges[1]);
  });
  for (const coordinate of ["a", "b"] as const) {
    const index = coordinate === "a" ? 1 : 2;
    const other = coordinate === "a" ? 2 : 1;
    for (const counterpart of [
      0, -0, 0.3, -0.3, 0.39999999999999997, -0.39999999999999997, 0.4, -0.4,
    ]) {
      it(`${coordinate} slice with fixed ${counterpart} contains endpoints and preserves all other channels`, () => {
        const channels: [number, number, number] = [0.68, 0, 0];
        channels[other] = counterpart;
        const source = unwrap(createColorValue({ space: "oklab", channels, alpha: 0.37 }));
        const range = operation.directRange(unwrap(geometry.project(source)), coordinate)!;
        const extent = Math.sqrt(Math.max(0, geometry.domain.radius ** 2 - counterpart ** 2));
        expect(range.max).toBeCloseTo(extent, 8);
        expect(range.min).toBeCloseTo(-extent, 8);
        if (counterpart === 0) expect(range).toEqual({ min: -0.4, max: 0.4 });
        for (const scalar of [range.min, range.min / 2, 0, range.max / 2, range.max, -2, 2]) {
          const next = unwrap(operation.authorCoordinate(source, coordinate, scalar));
          const defined = definitionOf(next);
          expect(defined.space).toBe("oklab");
          expect(defined.channels[index]).toBe(Math.min(range.max, Math.max(range.min, scalar)));
          expect(defined.channels[other]).toBe(counterpart);
          expect(defined.channels[0]).toBe(channels[0]);
          expect(defined.alpha).toBe(0.37);
          const projection = unwrap(geometry.project(next));
          expect(geometry.contains(projection.point)).toBe(true);
          expect(operation.directRange(projection, coordinate)).toEqual(range);
        }
      });
    }
    it(`${coordinate} slice is independent of the edited value, unavailable beyond radius, and never auto-authors`, () => {
      for (const counterpart of [0.3, -0.3, 0.4 + Number.EPSILON, -0.4 - Number.EPSILON, 0.6]) {
        const channels: [number, number, number] = [0.68, 0.7, 0.7];
        channels[other] = counterpart;
        const source = unwrap(createColorValue({ space: "oklab", channels, alpha: 0.37 }));
        const before = definitionOf(source);
        const range = operation.directRange(unwrap(geometry.project(source)), coordinate);
        expect(range === null).toBe(Math.abs(counterpart) > 0.4);
        if (!range) expect(operation.authorCoordinate(source, coordinate, 0).ok).toBe(false);
        else
          expect(
            definitionOf(unwrap(operation.authorCoordinate(source, coordinate, 0))).channels[other],
          ).toBe(counterpart);
        expect(definitionOf(source)).toEqual(before);
      }
    });
  }
});
