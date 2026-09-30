import { describe, expect, it } from "vitest";
import { channelSections } from "../src/channelGeometry.js";

describe("shared visual presentation geometry", () => {
  it("retains explicitly identified native tangent points without manufacturing interval length", () => {
    expect(channelSections([{ start: 0, end: 0, tone: "srgb", point: true }])).toEqual([
      { start: 0, end: 0, tone: "srgb", point: true },
    ]);
  });
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
  });
});
