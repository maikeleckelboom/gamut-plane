/**
 * Presentation policy for the active section. Everything here is geometry for drawing: none of it
 * decides gamut membership, and none of it touches the authored color.
 */
type Vector = readonly [number, number, number];

/**
 * Which side of the section plane is removed so the section faces the viewer.
 * `1` removes the half-space above the plane (the camera is above it), `-1` below it, `0` none.
 * The scene is X = a, Y = L, Z = b, and the viewer is on the side `toViewer.y` points to.
 */
export type CutSide = -1 | 0 | 1;
export function cutSide(toViewerY: number, enabled: boolean): CutSide {
  if (!enabled) return 0;
  return toViewerY >= 0 ? 1 : -1;
}

/** Whether `point` survives the cut. `side` 0 keeps everything. */
export function isKept(point: Vector, side: CutSide, level: number): boolean {
  return side === 0 || (point[1] - level) * side <= 0;
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
): number {
  if (side === 0) return 0;
  const capacity = Math.floor(out.length / 6);
  let written = 0;
  for (let i = 0; i < count && written < capacity; i++) {
    const o = 6 * i;
    // Signed distance beyond the plane, positive on the removed side.
    const d0 = (source[o + 1]! - level) * side;
    const d1 = (source[o + 4]! - level) * side;
    if (d0 < 0 && d1 < 0) continue;
    const w = 6 * written;
    for (let k = 0; k < 6; k++) out[w + k] = source[o + k]!;
    if (d0 < 0 !== d1 < 0) {
      // Straddles the plane: replace the end that lies on the kept side by the crossing point.
      const t = d0 / (d0 - d1);
      const crossing = [0, 1, 2].map(
        (k) => source[o + k]! + t * (source[o + 3 + k]! - source[o + k]!),
      );
      crossing[1] = level;
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
 * Cosine of the largest angle between the view direction and the section normal for which the
 * section is presented on its own (see `isFaceOn`): 20 degrees.
 */
export const FACE_ON_COSINE = Math.cos((20 * Math.PI) / 180);

/**
 * Whether the camera looks along the lightness axis closely enough that the section reads as a flat
 * a/b field. The L axis, its labels and the near body would all project onto that field, so the
 * scene hides them there. This is a presentation threshold, not a scientific one.
 */
export function isFaceOn(toViewerY: number): boolean {
  return Math.abs(toViewerY) >= FACE_ON_COSINE;
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
): boolean {
  if (side === 0 || Math.abs(toViewer[1]) < 1e-9) return false;
  if ((point[1] - level) * side >= -margin) return false; // on the plane or on the removed side
  const t = (level - point[1]) / toViewer[1];
  if (t <= 0) return false;
  return inside([point[0] + toViewer[0] * t, level, point[2] + toViewer[2] * t]);
}

/** The drawn body: inside the focused gamut, on the side of the plane that the cut keeps. */
export function drawnSolid(
  inside: (point: Vector) => boolean,
  side: CutSide,
  level: number,
): (point: Vector) => boolean {
  return (point) => isKept(point, side, level) && inside(point);
}
