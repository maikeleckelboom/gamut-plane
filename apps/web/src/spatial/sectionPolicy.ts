/**
 * Presentation policy for the active section. Everything here is geometry for drawing: none of it
 * decides gamut membership, and none of it touches the authored color.
 */
type Vector = readonly [number, number, number];
const vertical: Vector = [0, 1, 0];
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Explicit removed half-space: `1` above the plane, `-1` below it, `0` none.
 * Camera orientation does not own this intent. The scene is X = a, Y = L, Z = b.
 */
export type CutSide = -1 | 0 | 1;
/** Whether `point` survives the cut. `side` 0 keeps everything. */
export function isKept(
  point: Vector,
  side: CutSide,
  level: number,
  normal: Vector = vertical,
): boolean {
  return side === 0 || (dot(point, normal) - level) * side <= 0;
}

/**
 * Keep, from segments `[x,y,z,x,y,z]`, the parts on the removed side of the plane (including the
 * plane itself) and write them to `out`. Used to draw the silhouette of the part of the body that
 * the cut removed, so the whole gamut stays recognizable. Returns the number of segments written;
 * stops at the capacity of `out`.
 */
export function clipSegmentsToRemoved(
  source: Float32Array,
  count: number,
  side: CutSide,
  level: number,
  out: Float32Array,
  normal: Vector = vertical,
): number {
  if (side === 0) return 0;
  const capacity = Math.floor(out.length / 6);
  let written = 0;
  for (let i = 0; i < count && written < capacity; i++) {
    const o = 6 * i;
    // Signed distance beyond the plane, positive on the removed side.
    const d0 = (dot([source[o]!, source[o + 1]!, source[o + 2]!], normal) - level) * side;
    const d1 = (dot([source[o + 3]!, source[o + 4]!, source[o + 5]!], normal) - level) * side;
    if (d0 < 0 && d1 < 0) continue;
    const w = 6 * written;
    for (let k = 0; k < 6; k++) out[w + k] = source[o + k]!;
    if (d0 < 0 !== d1 < 0) {
      // Straddles the plane: replace the end that lies on the kept side by the crossing point.
      const t = d0 / (d0 - d1);
      const crossing = [0, 1, 2].map(
        (k) => source[o + k]! + t * (source[o + 3 + k]! - source[o + k]!),
      );
      const replace = d0 < 0 ? 0 : 3;
      for (let k = 0; k < 3; k++) out[w + replace + k] = crossing[k]!;
    }
    written++;
  }
  return written;
}

/**
 * Whether a drawn solid lies between `point` and the viewer along an orthographic ray. The first
 * `margin` is ignored so a point on or just under the surface is not reported as hidden. This is a
 * presentation probe for deciding whether to offer a recovery action. Neither it nor occlusion in
 * the picture says anything about gamut membership.
 */
export function isPointHidden(
  solid: (point: Vector) => boolean,
  point: Vector,
  toViewer: Vector,
  options: { reach?: number; step?: number; margin?: number } = {},
): boolean {
  const { reach = 1.6, step = 0.01, margin = 0.004 } = options;
  for (let distance = margin; distance <= reach; distance += step)
    if (
      solid([
        point[0] + toViewer[0] * distance,
        point[1] + toViewer[1] * distance,
        point[2] + toViewer[2] * distance,
      ])
    )
      return true;
  return false;
}

/**
 * Whether the section's own fill hides `point`: the point lies behind the plane (on the kept side),
 * and the ray from it to the viewer crosses the plane inside the focused gamut. Used when the body is
 * not drawn, so the section fill is the only thing in front of it.
 */
export function isHiddenByCap(
  inside: (point: Vector) => boolean,
  point: Vector,
  toViewer: Vector,
  side: CutSide,
  level: number,
  margin = 1e-4,
  normal: Vector = vertical,
): boolean {
  const direction = dot(toViewer, normal);
  if (side === 0 || Math.abs(direction) < 1e-9) return false;
  if ((dot(point, normal) - level) * side >= -margin) return false;
  const t = (level - dot(point, normal)) / direction;
  if (t <= 0) return false;
  return inside([
    point[0] + toViewer[0] * t,
    point[1] + toViewer[1] * t,
    point[2] + toViewer[2] * t,
  ]);
}

/** The drawn body: inside the focused gamut, on the side of the plane that the cut keeps. */
export function drawnSolid(
  inside: (point: Vector) => boolean,
  side: CutSide,
  level: number,
  normal: Vector = vertical,
): (point: Vector) => boolean {
  return (point) => isKept(point, side, level, normal) && inside(point);
}
