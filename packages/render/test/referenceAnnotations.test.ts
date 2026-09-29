import { describe, expect, it } from "vitest";
import { planeWarningOffset } from "../src/current/referenceAnnotations.js";

describe("plane warning placement", () => {
  const size = { width: 400, height: 300 };
  it("prefers above-right even in the right half when there is room", () => {
    expect(planeWarningOffset({ x: 0.8, y: 0.5 }, size)).toEqual({ x: 18, y: -18 });
  });
  it.each([
    [
      { x: 0, y: 0 },
      { x: 18, y: 18 },
    ],
    [
      { x: 1, y: 0 },
      { x: -18, y: 18 },
    ],
    [
      { x: 0, y: 1 },
      { x: 18, y: -18 },
    ],
    [
      { x: 1, y: 1 },
      { x: -18, y: -18 },
    ],
  ])("keeps the glyph inside the field at %j", (point, expected) => {
    const offset = planeWarningOffset(point!, size);
    expect(offset).toEqual(expected);
    const center = { x: point!.x * size.width + offset.x, y: point!.y * size.height + offset.y };
    expect(center.x - 6).toBeGreaterThanOrEqual(0);
    expect(center.x + 6).toBeLessThanOrEqual(size.width);
    expect(center.y - 6).toBeGreaterThanOrEqual(0);
    expect(center.y + 6).toBeLessThanOrEqual(size.height);
    // The nearest glyph corner clears the 9px active-marker radius.
    expect(Math.hypot(Math.abs(offset.x) - 6, Math.abs(offset.y) - 6) - 9).toBeGreaterThan(6);
  });
  it("uses the same initial preference before a surface can be measured", () => {
    expect(planeWarningOffset({ x: 1, y: 0 }, { width: 0, height: 0 })).toEqual({
      x: 18,
      y: -18,
    });
  });
});
