import type { PlanePoint } from "@gamut-plane/core";
import type { RgbContour } from "./rgbGuides.js";

/** Nearest point on the visible, certified RGB contour in encoded area coordinates.
 * Clip individual genuine segments; never create an edge along the viewport.
 */
export function nearestRgbBoundary(contour: RgbContour, origin: PlanePoint): PlanePoint | null {
  const { points } = contour;
  if (
    !Number.isFinite(origin.x) ||
    !Number.isFinite(origin.y) ||
    points.length % 2 !== 0 ||
    !points.every(Number.isFinite)
  )
    return null;
  let nearest: PlanePoint | null = null;
  const originScale = Math.max(1, Math.abs(origin.x), Math.abs(origin.y));
  const consider = (x: number, y: number) => {
    // Difference of squared distances, scaled before arithmetic: far-away authored
    // origins must not turn distinct endpoints into equal rounded distances.
    const difference =
      nearest === null
        ? -1
        : (x - nearest.x) * ((x + nearest.x) / originScale - 2 * (origin.x / originScale)) +
          (y - nearest.y) * ((y + nearest.y) / originScale - 2 * (origin.y / originScale));
    if (difference < 0) {
      nearest = { x, y };
    }
  };
  const count = points.length / 2;
  if (count === 1) {
    const x = points[0]!;
    const y = points[1]!;
    if (x >= 0 && x <= 1 && y >= 0 && y <= 1) consider(x, y);
  }
  const edges = contour.closed ? count : count - 1;
  for (let i = 0; i < edges; i++) {
    const j = (i + 1) % count;
    const ax = points[2 * i]!;
    const ay = points[2 * i + 1]!;
    const dx = points[2 * j]! - ax;
    const dy = points[2 * j + 1]! - ay;
    let lo = 0;
    let hi = 1;
    for (const [a, d] of [
      [ax, dx],
      [ay, dy],
    ] as const) {
      if (d === 0) {
        if (a < 0 || a > 1) hi = -1;
      } else {
        const start = -a / d;
        const end = (1 - a) / d;
        lo = Math.max(lo, Math.min(start, end));
        hi = Math.min(hi, Math.max(start, end));
      }
    }
    if (lo > hi) continue;
    const length = Math.hypot(dx, dy);
    // Scale the origin before the dot product so extended authored coordinates cannot overflow.
    const scale = Math.max(1, Math.abs(origin.x - ax), Math.abs(origin.y - ay));
    const along =
      length === 0
        ? 0
        : ((origin.x - ax) / scale) * (dx / length) + ((origin.y - ay) / scale) * (dy / length);
    const t =
      length === 0 || along <= lo * (length / scale)
        ? lo
        : along >= hi * (length / scale)
          ? hi
          : along * (scale / length);
    consider(ax + t * dx, ay + t * dy);
  }
  return nearest;
}
