import { describe, expect, it } from "vitest";
import {
  channelSections,
  channelThresholds,
  channelWarning,
  nearestThreshold,
} from "../src/channelGeometry.js";
import { projectionConnectorStyle } from "../src/presentation.js";

describe("shared visual presentation geometry", () => {
  it("merges only overlapping sampled intervals in their own gamut without mutating inputs", () => {
    const intervals = [
      { start: -1, end: 0.2, tone: "srgb" },
      { start: 0.1, end: 0.3, tone: "srgb" },
      { start: 0.5, end: 2, tone: "display-p3" },
      { start: 0.4, end: 0.4, tone: "srgb" },
    ] as const;
    const sections = channelSections(intervals);
    expect(sections).toEqual([
      { start: 0.5, end: 1, tone: "display-p3" },
      { start: 0, end: 0.3, tone: "srgb" },
    ]);
    expect(intervals[0].start).toBe(-1);
    const thresholds = channelThresholds(sections);
    expect(thresholds.map((value) => value.label)).toEqual([
      "Inside Display P3 gamut →",
      "← Inside sRGB gamut",
    ]);
    expect(nearestThreshold(thresholds, 0.31)?.position).toBe(0.3);
  });
  it("places channel warnings on the outside side and includes threshold and marker obstacles", () => {
    const thresholds = channelThresholds([{ start: 0.3, end: 1, tone: "display-p3" }]);
    const warning = channelWarning(
      0.29,
      320,
      [{ id: "projection", tone: "projection", lane: "srgb", position: 0.9, label: "projection" }],
      thresholds,
    );
    expect(warning.obstacles).toHaveLength(2);
    expect(warning.placement.side).toBe("left");
    expect(channelWarning(0.295, 320, [], thresholds).placement.side).toBe("left");
  });
  it("serializes rectangular and radial connectors deterministically", () => {
    expect(projectionConnectorStyle({ x: 0.7, y: 0.4 }, { x: 0.3, y: 0.4 }, false)).toEqual({
      left: "30.00000000%",
      top: "40.00000000%",
      width: "40.00000000%",
    });
    const radial = projectionConnectorStyle({ x: 0.6, y: 0.6 }, { x: 0.4, y: 0.4 }, true);
    expect(radial.width).toBe("28.28427125%");
    expect(radial.transform).toBe("translateY(-50%) rotate(-2.3561944902rad)");
  });
});
