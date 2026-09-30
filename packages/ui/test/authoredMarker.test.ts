import { expect, it, vi } from "vitest";
import { authoredMarkerPoint } from "../src/currentProductPresentation.js";
import { rgbChannelContext } from "../src/directCoordinateControl.js";

it("uses raw RGB authored points while preserving perceptual geometry constraints", () => {
  const point = { x: 1.2, y: -0.3 };
  const constrain = vi.fn(() => ({ x: 1, y: 0 }));
  for (const representationId of ["srgb", "display-p3"] as const)
    expect(authoredMarkerPoint({ representationId, constrain }, point)).toBe(point);
  expect(constrain).not.toHaveBeenCalled();
  for (const representationId of ["oklch", "oklab"] as const)
    expect(authoredMarkerPoint({ representationId, constrain }, point)).toEqual({ x: 1, y: 0 });
  expect(constrain).toHaveBeenCalledTimes(2);
});

it("uses only native operation siblings and alpha for RGB draft/gesture context", () => {
  const observed = { space: "srgb", channels: [1.2, -0, -0.3], alpha: 0.37 } as const;
  const context = rgbChannelContext("r", observed);
  expect(context).toBe("srgb:-0:-0.3:0.37");
  expect(rgbChannelContext("r", { ...observed, channels: [0.5, -0, -0.3] })).toBe(context);
  expect(rgbChannelContext("r", { ...observed, channels: [1.2, 0.5, -0.3] })).not.toBe(context);
});
