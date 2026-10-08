import { describe, expect, it } from "vitest";
import { fitBoundaryContour } from "../src/viewport/boundaryFit.js";
import { sampleWindow } from "../src/viewport/math.js";

function fit(
  points: readonly number[],
  domain: "rectangle" | "disc" = "rectangle",
  closed = false,
) {
  return fitBoundaryContour({ points: new Float64Array(points), closed }, domain);
}

describe("nominal-domain boundary framing", () => {
  it("fits resolved geometry with ten percent padding on each side, independent of a camera crop", () => {
    const result = fit([0.2, 0.3, 0.4, 0.6]);
    if (result.kind !== "available") throw Error("fixture");
    expect(result.bounds).toEqual({ left: 0.2, top: 0.3, right: 0.4, bottom: 0.6 });
    expect(result.viewport.zoom).toBeCloseTo(25 / 9, 12);
    expect(result.viewport.center.x).toBeCloseTo(0.3, 12);
    expect(result.viewport.center.y).toBeCloseTo(0.45, 12);
    expect(sampleWindow(result.viewport).top).toBeCloseTo(0.27, 12);
    expect(sampleWindow(result.viewport).height).toBeCloseTo(0.36, 12);
  });
  it("clips genuine open segments instead of clamping vertices or adding domain edges", () => {
    const result = fit([-3, 0.3, 4, 0.3]);
    expect(result).toMatchObject({
      kind: "available",
      bounds: { left: 0, right: 1, top: 0.3, bottom: 0.3 },
      viewport: { zoom: 1 },
    });
    expect(fit([-2, -2, 2, -2, 2, 2, -2, 2], "rectangle", true)).toEqual({
      kind: "unavailable",
      reason: "empty",
    });
  });
  it("includes the closing edge only for a closed contour", () => {
    const points = [-1, -1, -1, 2, 2, 2];
    expect(fit(points)).toEqual({ kind: "unavailable", reason: "empty" });
    expect(fit(points, "rectangle", true)).toMatchObject({
      kind: "available",
      bounds: { left: 0, top: 0, right: 1, bottom: 1 },
    });
  });
  it("clips to the true disc rather than its enclosing square", () => {
    const result = fit([-1, 0.2, 2, 0.2], "disc");
    if (result.kind !== "available") throw Error("fixture");
    expect(result.bounds.left).toBeCloseTo(0.1, 12);
    expect(result.bounds.right).toBeCloseTo(0.9, 12);
    expect(result.viewport.zoom).toBeCloseTo(25 / 24, 12);
    // Center constraints keep the viewport in the nominal square, even when padding cannot be symmetric.
    expect(sampleWindow(result.viewport).top).toBe(0);
    expect(fit([0, 0, 0.1, 0.1], "disc")).toEqual({ kind: "unavailable", reason: "empty" });
  });
  it.each([
    [[0.5, 0.5], "rectangle", { x: 0.5, y: 0.5 }],
    [[0, 0], "rectangle", { x: 0.0625, y: 0.0625 }],
    [[0.5, 0.5, 0.5, 0.5], "disc", { x: 0.5, y: 0.5 }],
    [[0.49, 0.49, 0.51, 0.51], "disc", { x: 0.5, y: 0.5 }],
    [[-2, 0, 2, 0], "disc", { x: 0.5, y: 0.0625 }],
    [[0, 0, Number.MIN_VALUE, 0], "rectangle", { x: 0.0625, y: 0.0625 }],
  ] as const)(
    "safely frames small, repeated, tangent or point geometry %s",
    (points, domain, center) => {
      const result = fit(points, domain);
      expect(result).toMatchObject({ kind: "available", viewport: { zoom: 8, center } });
    },
  );
  it.each(
    [
      [0, 0, 1, 1],
      [0.02, 0.5, 0.98, 0.5],
    ].map((points) => [points]),
  )("uses the closest constrained fit for a large boundary %s", (points) => {
    expect(fit(points)).toMatchObject({
      kind: "available",
      viewport: { zoom: 1, center: { x: 0.5, y: 0.5 } },
    });
  });
  it.each([[], [1.1, 0.4], [2, 0.5, 3, 0.5]].map((points) => [points]))(
    "does not fit empty or off-domain geometry %s",
    (points) => {
      expect(fit(points)).toEqual({ kind: "unavailable", reason: "empty" });
    },
  );
  it.each(
    [
      [0.5],
      [NaN, 0],
      [Infinity, 0],
      [-Number.MAX_VALUE, 0, Number.MAX_VALUE, 1],
      [-1e300, 0.5, 1e300, 0.5],
    ].map((points) => [points]),
  )("rejects malformed or numerically unavailable geometry %s", (points) => {
    expect(fit(points)).toEqual({ kind: "unavailable", reason: "unavailable" });
  });
});
