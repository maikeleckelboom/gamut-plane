import { spatialColorDefinition } from "@gamut-plane/render/internal/spatial";

type Vector = readonly [number, number, number];

/**
 * Presentation-only point-in-solid probe for label occlusion. It reuses the core-owned OKLab to
 * linear RGB definition that the color shader uses, so it describes the drawn body. It is NOT an
 * authoritative gamut membership result (exact checks stay in core) and carries no tolerance claim.
 */
export function createBodyProbe(space: "srgb" | "display-p3") {
  const { oklabToLmsPrime: toLms, lmsToLinearRgb: toRgb } = spatialColorDefinition(space);
  const epsilon = 1e-9;
  /** `scene` is [a, L, b]. */
  return (scene: Vector): boolean => {
    const lab = [scene[1], scene[0], scene[2]] as const;
    const cone = [0, 1, 2].map((row) => {
      const value = toLms[row]![0]! * lab[0] + toLms[row]![1]! * lab[1] + toLms[row]![2]! * lab[2];
      return value * value * value;
    });
    return [0, 1, 2].every((row) => {
      const value =
        toRgb[row]![0]! * cone[0]! + toRgb[row]![1]! * cone[1]! + toRgb[row]![2]! * cone[2]!;
      return value >= -epsilon && value <= 1 + epsilon;
    });
  };
}

/**
 * Whether the orthographic ray from `point` toward the viewer enters the body. A point already
 * inside or on the surface is never reported as occluded: it is the thing being labeled.
 */
export function isOccluded(
  inside: (scene: Vector) => boolean,
  point: Vector,
  toViewer: Vector,
  reach = 1.4,
  step = 0.015,
): boolean {
  if (inside(point)) return false;
  for (let distance = step; distance <= reach; distance += step)
    if (
      inside([
        point[0] + toViewer[0] * distance,
        point[1] + toViewer[1] * distance,
        point[2] + toViewer[2] * distance,
      ])
    )
      return true;
  return false;
}
