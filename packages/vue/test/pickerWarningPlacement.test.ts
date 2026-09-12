import { describe, expect, it } from "vitest";

import {
  PICKER_ACTIVE_MARKER_RADIUS,
  PICKER_PROJECTION_MARKER_RADIUS,
  PICKER_SLIDER_ANNOTATION_CLEARANCE,
  PICKER_SLIDER_EDGE_CLEARANCE,
  PICKER_SLIDER_THUMB_WIDTH,
  PICKER_SLIDER_WARNING_SIDE_GAP,
  PICKER_WARNING_GLYPH_SIZE,
  PICKER_WARNING_MARKER_CLEARANCE,
  PICKER_WARNING_PREFERRED_OFFSET,
  PICKER_WARNING_SURFACE_INSET,
} from "../src/components/planeInstrumentStyle";
import {
  getSliderWarningPosition,
  placePlanarWarning,
  type PlanarWarningPlacementInput,
} from "../src/components/pickerWarningPlacement";

const SURFACE_SIZE = { width: 100, height: 100 } as const;
const WARNING_SIZE = {
  width: PICKER_WARNING_GLYPH_SIZE,
  height: PICKER_WARNING_GLYPH_SIZE,
} as const;

function placementInput(
  activeCenter: Readonly<{ x: number; y: number }>,
): PlanarWarningPlacementInput {
  return {
    activeCenter: { ...activeCenter },
    surfaceSize: { ...SURFACE_SIZE },
    activeRadius: PICKER_ACTIVE_MARKER_RADIUS,
    warningSize: { ...WARNING_SIZE },
    preferredOffset: { ...PICKER_WARNING_PREFERRED_OFFSET },
    surfaceInset: PICKER_WARNING_SURFACE_INSET,
    markerClearance: PICKER_WARNING_MARKER_CLEARANCE,
  };
}

function expectWithinSurface(placement: { left: number; top: number }): void {
  expect(placement.left).toBeGreaterThanOrEqual(PICKER_WARNING_SURFACE_INSET);
  expect(placement.top).toBeGreaterThanOrEqual(PICKER_WARNING_SURFACE_INSET);
  expect(placement.left + WARNING_SIZE.width).toBeLessThanOrEqual(
    SURFACE_SIZE.width - PICKER_WARNING_SURFACE_INSET,
  );
  expect(placement.top + WARNING_SIZE.height).toBeLessThanOrEqual(
    SURFACE_SIZE.height - PICKER_WARNING_SURFACE_INSET,
  );
}

function expectClearOfActive(
  placement: { left: number; top: number },
  activeCenter: Readonly<{ x: number; y: number }>,
): void {
  const nearestX = Math.min(
    placement.left + WARNING_SIZE.width,
    Math.max(placement.left, activeCenter.x),
  );
  const nearestY = Math.min(
    placement.top + WARNING_SIZE.height,
    Math.max(placement.top, activeCenter.y),
  );
  const distance = Math.hypot(activeCenter.x - nearestX, activeCenter.y - nearestY);
  expect(distance).toBeGreaterThanOrEqual(
    PICKER_ACTIVE_MARKER_RADIUS + PICKER_WARNING_MARKER_CLEARANCE,
  );
}

describe("placePlanarWarning", () => {
  it("uses the preferred above-right placement when it fits", () => {
    expect(placePlanarWarning(placementInput({ x: 50, y: 50 }))).toEqual({
      left: 59,
      top: 27,
    });
  });

  it.each([
    ["top", { x: 50, y: 0 }],
    ["right", { x: 100, y: 50 }],
    ["bottom", { x: 50, y: 100 }],
    ["left", { x: 0, y: 50 }],
    ["top-left", { x: 0, y: 0 }],
    ["top-right", { x: 100, y: 0 }],
    ["bottom-right", { x: 100, y: 100 }],
    ["bottom-left", { x: 0, y: 100 }],
  ])("flips and clamps at the %s edge or corner", (_name, activeCenter) => {
    const placement = placePlanarWarning(placementInput(activeCenter));
    expectWithinSurface(placement);
    expectClearOfActive(placement, activeCenter);
  });

  it("avoids a boundary projection marker at the preferred position when another quadrant fits", () => {
    const input = placementInput({ x: 50, y: 50 });
    input.projectionMarker = {
      center: { x: 66, y: 34 },
      radius: PICKER_PROJECTION_MARKER_RADIUS,
    };

    expect(placePlanarWarning(input)).toEqual({ left: 27, top: 27 });
  });

  it("is deterministic and does not mutate nested input geometry", () => {
    const input = placementInput({ x: 6, y: 94 });
    input.projectionMarker = {
      center: { x: 22, y: 78 },
      radius: PICKER_PROJECTION_MARKER_RADIUS,
    };
    const snapshot = structuredClone(input);

    const first = placePlanarWarning(input);
    const second = placePlanarWarning(input);

    expect(second).toEqual(first);
    expect(input).toEqual(snapshot);
    expectWithinSurface(first);
  });
});

describe("getSliderWarningPosition", () => {
  const dimensions = {
    trackWidth: 100,
    thumbWidth: PICKER_SLIDER_THUMB_WIDTH,
    warningWidth: PICKER_WARNING_GLYPH_SIZE,
    edgeClearance: PICKER_SLIDER_EDGE_CLEARANCE,
    markerGap: PICKER_SLIDER_WARNING_SIDE_GAP,
    obstacleClearance: PICKER_SLIDER_ANNOTATION_CLEARANCE,
  } as const;

  it("clamps minimum, maximum, and out-of-range positions within the warning edges", () => {
    expect(getSliderWarningPosition({ ...dimensions, position: 0 })).toEqual({
      normalizedPosition: 0,
      positionPercent: 0,
      thumbOffset: 5,
      side: "right",
      sideOffset: 14,
      edge: 9,
    });
    expect(getSliderWarningPosition({ ...dimensions, position: -1 })).toEqual(
      getSliderWarningPosition({ ...dimensions, position: 0 }),
    );
    expect(getSliderWarningPosition({ ...dimensions, position: 1 })).toEqual({
      normalizedPosition: 1,
      positionPercent: 100,
      thumbOffset: -5,
      side: "left",
      sideOffset: -14,
      edge: 9,
    });
    expect(getSliderWarningPosition({ ...dimensions, position: 2 })).toEqual(
      getSliderWarningPosition({ ...dimensions, position: 1 }),
    );
  });

  it("maps through native thumb travel before applying warning-width clamping", () => {
    const position = getSliderWarningPosition({
      position: 0.25,
      trackWidth: 100,
      thumbWidth: 20,
      warningWidth: 4,
      edgeClearance: 0,
      markerGap: 3,
      obstacleClearance: 1,
    });
    const trackWidth = 100;
    const unclampedCenter =
      (position.positionPercent / 100) * trackWidth + position.thumbOffset + position.sideOffset;
    expect(unclampedCenter).toBe(45);
    expect(position.side).toBe("right");
    expect(position.edge).toBe(2);
  });

  it("keeps the preferred side past the midpoint when it is clear", () => {
    expect(getSliderWarningPosition({ ...dimensions, position: 0.75 }).side).toBe("right");
  });

  it("flips only when the preferred candidate touches an obstacle", () => {
    expect(
      getSliderWarningPosition({
        ...dimensions,
        position: 0.75,
        obstacles: [{ center: 86.5, width: 3 }],
      }).side,
    ).toBe("left");
    expect(
      getSliderWarningPosition({
        ...dimensions,
        position: 0.75,
        obstacles: [{ center: 58.5, width: 3 }],
      }).side,
    ).toBe("right");
  });

  it("chooses the lower-collision candidate when both sides are occupied", () => {
    const placement = getSliderWarningPosition({
      ...dimensions,
      position: 0.5,
      obstacles: [
        { center: 64, width: 3 },
        { center: 64, width: 3 },
        { center: 36, width: 3 },
      ],
    });

    expect(placement.side).toBe("left");
  });
});
