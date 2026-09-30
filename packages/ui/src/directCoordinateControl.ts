import type { ColorRepresentation } from "@gamut-plane/core";

/** Observed sibling coordinates are operation inputs; comparison preferences are not. */
export function rgbChannelContext(
  coordinate: "r" | "g" | "b",
  representation: ColorRepresentation<"srgb" | "display-p3">,
): string {
  const index = { r: 0, g: 1, b: 2 }[coordinate];
  return [
    representation.space,
    ...representation.channels.filter((_, channel) => channel !== index),
    representation.alpha,
  ]
    .map((value) => (Object.is(value, -0) ? "-0" : String(value)))
    .join(":");
}

/** Fixed operation inputs, excluding the directly authored coordinate and comparison state. */
export function directCoordinateContext(
  coordinate: "a" | "b",
  representation: ColorRepresentation,
): string {
  return [
    representation.channels[0],
    representation.channels[coordinate === "a" ? 2 : 1],
    representation.alpha,
  ]
    .map((value) => (Object.is(value, -0) ? "-0" : String(value)))
    .join(":");
}

/** Geometry supplies the bounds; this layer supplies only the inspection/recovery explanation. */
export function directCoordinateHelp(
  coordinate: "a" | "b",
  range: Readonly<{ min: number; max: number }> | null,
): string {
  if (!range)
    return `Direct ${coordinate} editing is unavailable while ${coordinate === "a" ? "b" : "a"} is outside the editor disc. Use the plane to choose a point.`;
  return "";
}
