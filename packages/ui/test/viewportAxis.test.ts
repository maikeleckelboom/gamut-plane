import { describe, expect, it } from "vitest";
import { planeAxisEnds, planeAxisSpans } from "../src/planeAxisEnds.js";
import { formatViewportZoom, viewportStatusCopy } from "../src/viewportCopy.js";

const CENTERED_2X = { left: 0.25, top: 0.25, width: 0.5, height: 0.5 };
const OKLCH_C = { min: 0, max: 0.4 };
const UNIT = { min: 0, max: 1 };
const OKLAB = { min: -0.4, max: 0.4 };
const NATIVE_RGB = {};

describe("visible axis ranges", () => {
  it("keeps the nominal endpoint strings at the fitted window", () => {
    const fit = planeAxisSpans({ left: 0, top: 0, width: 1, height: 1 });
    expect(fit).toEqual({ x: { start: 0, end: 1 }, y: { start: 0, end: 1 } });
    expect(planeAxisEnds(OKLCH_C, fit.x)).toEqual(planeAxisEnds(OKLCH_C));
    expect(planeAxisEnds(OKLAB, fit.x)).toEqual({ start: "-0.4", end: "0.4" });
    expect(planeAxisEnds(NATIVE_RGB)).toEqual({ start: "0", end: "1" });
  });

  it("describes independently computed ranges at centered 2x for every axis family", () => {
    const { x, y } = planeAxisSpans(CENTERED_2X);
    expect(planeAxisEnds(OKLCH_C, x)).toEqual({ start: "0.1", end: "0.3" });
    expect(planeAxisEnds(UNIT, y)).toEqual({ start: "0.25", end: "0.75" });
    expect(planeAxisEnds(OKLAB, x)).toEqual({ start: "-0.2", end: "0.2" });
    expect(planeAxisEnds(OKLAB, y)).toEqual({ start: "-0.2", end: "0.2" });
    expect(planeAxisEnds(NATIVE_RGB, x)).toEqual({ start: "0.25", end: "0.75" });
    expect(planeAxisEnds(NATIVE_RGB, y)).toEqual({ start: "0.25", end: "0.75" });
  });

  it("measures the vertical axis from the bottom edge since Y decreases down the screen", () => {
    // The top-left quarter at 2x shows the upper half of lightness and the lower half of chroma.
    const topLeft = planeAxisSpans({ left: 0, top: 0, width: 0.5, height: 0.5 });
    expect(planeAxisEnds(UNIT, topLeft.y)).toEqual({ start: "0.5", end: "1" });
    expect(planeAxisEnds(OKLCH_C, topLeft.x)).toEqual({ start: "0", end: "0.2" });
    const bottomRight = planeAxisSpans({ left: 0.5, top: 0.5, width: 0.5, height: 0.5 });
    expect(planeAxisEnds(UNIT, bottomRight.y)).toEqual({ start: "0", end: "0.5" });
    expect(planeAxisEnds(OKLCH_C, bottomRight.x)).toEqual({ start: "0.2", end: "0.4" });
  });

  it("never displays a negative zero and does not round the underlying span", () => {
    const tiny = planeAxisSpans({ left: 0.4999, top: 0.4999, width: 0.0002, height: 0.0002 });
    expect(planeAxisEnds(OKLAB, tiny.x)).toEqual({ start: "0", end: "0" });
    expect(tiny.x.start).toBe(0.4999);
  });
});

describe("viewport copy", () => {
  it("formats the zoom for display only", () => {
    expect(formatViewportZoom(1)).toBe("100%");
    expect(formatViewportZoom(1.25)).toBe("125%");
    expect(formatViewportZoom(1.5625)).toBe("156%");
    expect(formatViewportZoom(8)).toBe("800%");
  });

  it("describes ranges and explains a camera-hidden selection without live announcements", () => {
    const base = {
      zoom: 2,
      xLabel: "chroma",
      yLabel: "lightness",
      x: { start: "0.1", end: "0.3" },
      y: { start: "0.25", end: "0.75" },
    };
    expect(viewportStatusCopy({ ...base, selectionHidden: false })).toBe(
      "Zoom 200%. Horizontal chroma 0.1 to 0.3. Vertical lightness 0.25 to 0.75.",
    );
    expect(viewportStatusCopy({ ...base, selectionHidden: true })).toContain(
      "outside the visible region",
    );
  });
});
