export type PickerPlaneId = "oklch" | "oklab";

/**
 * A point in the editor's normalized field/editor coordinates: the enclosing square of the
 * active geometry, with its origin at the top-left. It is not a position within a presentation
 * viewport; a movable camera maps between the two outside of core.
 */
export interface PlanePoint {
  /** Normalized horizontal field position. Axis meaning is defined by the active plane. */
  x: number;
  /** Normalized vertical field position. Axis meaning is defined by the active plane. */
  y: number;
}

export const OKLCH_PICKER_MAX_CHROMA = 0.4;
export const OKLAB_PICKER_AXIS_LIMIT = OKLCH_PICKER_MAX_CHROMA;

/** A scalar slice through the editor disc, independent of authored validity or any gamut. */
export function oklabDirectCoordinateRange(
  counterpart: number,
): Readonly<{ min: number; max: number }> | null {
  const fixed = Math.abs(counterpart);
  if (!Number.isFinite(fixed) || fixed > OKLAB_PICKER_AXIS_LIMIT) return null;
  // Factoring avoids cancellation near the edge; exact boundary slices are the singleton zero.
  const rawExtent = Math.sqrt(
    (OKLAB_PICKER_AXIS_LIMIT - fixed) * (OKLAB_PICKER_AXIS_LIMIT + fixed),
  );
  // Cross-engine observation noise must not change SSR bounds. Round inward, never outside
  // the disc, at a resolution far finer than the direct control's 0.001 editing step.
  const extent = Math.floor(rawExtent * 1e12) / 1e12;
  return { min: extent === 0 ? 0 : -extent, max: extent };
}

const NORMALIZED_PLANE_DOMAIN_EPSILON = Number.EPSILON * 16;

export function assertFinitePoint(point: PlanePoint): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError("Plane coordinates must be finite numbers");
  }
}

export function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Clamps only to the rectangular picker domain, never to an output gamut. */
export function clampPlanePointToInstrumentBounds(point: PlanePoint): PlanePoint {
  assertFinitePoint(point);
  return { x: clampUnit(point.x), y: clampUnit(point.y) };
}

export function oklchCoordinatesToPlanePoint(l: number, c: number): PlanePoint {
  return { x: c / OKLCH_PICKER_MAX_CHROMA, y: 1 - l };
}

export function oklchCoordinatesFromPlanePoint(point: PlanePoint): { l: number; c: number } {
  const bounded = clampPlanePointToInstrumentBounds(point);
  return { l: 1 - bounded.y, c: bounded.x * OKLCH_PICKER_MAX_CHROMA };
}

export function isPointInRectangularInstrument(point: PlanePoint): boolean {
  assertFinitePoint(point);
  return (
    point.x >= -NORMALIZED_PLANE_DOMAIN_EPSILON &&
    point.x <= 1 + NORMALIZED_PLANE_DOMAIN_EPSILON &&
    point.y >= -NORMALIZED_PLANE_DOMAIN_EPSILON &&
    point.y <= 1 + NORMALIZED_PLANE_DOMAIN_EPSILON
  );
}

export function oklabCoordinatesToPlanePoint(a: number, b: number): PlanePoint {
  return {
    x: (a + OKLAB_PICKER_AXIS_LIMIT) / (OKLAB_PICKER_AXIS_LIMIT * 2),
    y: (OKLAB_PICKER_AXIS_LIMIT - b) / (OKLAB_PICKER_AXIS_LIMIT * 2),
  };
}

export function oklabCoordinatesFromPlanePoint(point: PlanePoint): { a: number; b: number } {
  assertFinitePoint(point);
  return {
    a: (point.x * 2 - 1) * OKLAB_PICKER_AXIS_LIMIT,
    b: (1 - point.y * 2) * OKLAB_PICKER_AXIS_LIMIT,
  };
}

export function constrainOklabPlanePoint(point: PlanePoint): PlanePoint {
  assertFinitePoint(point);
  const x = point.x - 0.5;
  const y = point.y - 0.5;
  const radius = Math.hypot(x, y);
  if (radius <= 0.5) return { x: point.x, y: point.y };
  const scale = 0.5 / radius;
  return { x: 0.5 + x * scale, y: 0.5 + y * scale };
}

export function isPointInOklabInstrumentDomain(point: PlanePoint): boolean {
  assertFinitePoint(point);
  return Math.hypot(point.x - 0.5, point.y - 0.5) <= 0.5 + NORMALIZED_PLANE_DOMAIN_EPSILON;
}
