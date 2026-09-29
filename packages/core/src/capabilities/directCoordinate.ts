import { authorPlaneEdit, projectColorToPlane, type ColorPlaneProjection } from "../picker/edit.js";
import { oklabDirectCoordinateRange } from "../picker/geometry.js";
import type { ColorValue } from "../color/value.js";

export function resolveOklabDirectRange(
  projection: Pick<ColorPlaneProjection<"oklab">, "representation">,
  coordinate: "a" | "b",
) {
  return oklabDirectCoordinateRange(projection.representation.channels[coordinate === "a" ? 2 : 1]);
}

/** Bounded scalar authorship avoids the normalized point round-trip moving the fixed coordinate. */
export function authorOklabDirectCoordinate(
  value: ColorValue,
  coordinate: "a" | "b",
  next: number,
) {
  const projection = projectColorToPlane(value, "oklab");
  if (!projection.ok) return projection;
  const range = resolveOklabDirectRange(projection.value, coordinate);
  if (!range || !Number.isFinite(next))
    return { ok: false, error: { code: "invalid-plane-edit" } } as const;
  return authorPlaneEdit(value, {
    plane: "oklab",
    kind: "channels",
    channels: { [coordinate]: Math.min(range.max, Math.max(range.min, next)) },
  });
}
