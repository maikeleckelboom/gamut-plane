import type { PlanePoint } from "@gamut-plane/core";

/**
 * Presentation camera over one editor field's normalized enclosing square. It is never color
 * state: it holds no authored value, geometry identity or gamut fact.
 */
export interface FieldViewport {
  /** Magnification, 1 (the whole field) up to {@link MAX_VIEWPORT_ZOOM}. */
  readonly zoom: number;
  /** Field point shown at the middle of the viewport. */
  readonly center: Readonly<PlanePoint>;
}

/** The part of the normalized field currently visible, in field coordinates. */
export interface FieldSampleWindow {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export const MIN_VIEWPORT_ZOOM = 1;
export const MAX_VIEWPORT_ZOOM = 8;

/** Zooms this close to the fitted state are the fitted state; stepped zooms must round-trip. */
const FIT_ZOOM_SNAP = 1e-9;

export const FIT_VIEWPORT: FieldViewport = Object.freeze({
  zoom: 1,
  center: Object.freeze({ x: 0.5, y: 0.5 }),
});

/** The window of the fitted field; sampling it is the pre-camera behavior. */
export const FIT_SAMPLE_WINDOW: FieldSampleWindow = Object.freeze({
  left: 0,
  top: 0,
  width: 1,
  height: 1,
});

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new TypeError(`${name} must be a finite number`);
}

function assertPoint(point: Readonly<PlanePoint>, name: string): void {
  assertFinite(point.x, `${name}.x`);
  assertFinite(point.y, `${name}.y`);
}

/** Rejects non-finite camera state at the boundary. Range is {@link constrainViewport}'s job. */
export function assertViewport(viewport: FieldViewport): void {
  assertFinite(viewport.zoom, "zoom");
  assertPoint(viewport.center, "center");
}

export function isFitViewport(viewport: FieldViewport): boolean {
  return viewport.zoom === 1 && viewport.center.x === 0.5 && viewport.center.y === 0.5;
}

export function viewportsEqual(left: FieldViewport, right: FieldViewport): boolean {
  return (
    left === right ||
    (left.zoom === right.zoom &&
      left.center.x === right.center.x &&
      left.center.y === right.center.y)
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Clamps zoom to the supported interval and the center so the view stays inside the enclosing
 * field square. This is a camera bound only; it is not a gamut, domain or editor constraint.
 * Returns the argument itself when it is already valid, and always the canonical fit at 1x.
 */
export function constrainViewport(viewport: FieldViewport): FieldViewport {
  assertViewport(viewport);
  let zoom = clamp(viewport.zoom, MIN_VIEWPORT_ZOOM, MAX_VIEWPORT_ZOOM);
  if (Math.abs(zoom - MIN_VIEWPORT_ZOOM) < FIT_ZOOM_SNAP) zoom = MIN_VIEWPORT_ZOOM;
  if (zoom === MIN_VIEWPORT_ZOOM) return FIT_VIEWPORT;
  const half = 0.5 / zoom;
  const x = clamp(viewport.center.x, half, 1 - half);
  const y = clamp(viewport.center.y, half, 1 - half);
  if (zoom === viewport.zoom && x === viewport.center.x && y === viewport.center.y) return viewport;
  return Object.freeze({ zoom, center: Object.freeze({ x, y }) });
}

/** Field point to normalized viewport point. Points outside the field map outside [0, 1]. */
export function fieldToViewport(viewport: FieldViewport, point: Readonly<PlanePoint>): PlanePoint {
  assertViewport(viewport);
  assertPoint(point, "point");
  // The fitted camera must not perturb a coordinate by a rounding error.
  if (isFitViewport(viewport)) return { x: point.x, y: point.y };
  return {
    x: 0.5 + viewport.zoom * (point.x - viewport.center.x),
    y: 0.5 + viewport.zoom * (point.y - viewport.center.y),
  };
}

/**
 * Normalized viewport point to field point. No field, domain or visible-window clamp is applied:
 * a captured pointer beyond the surface still names a real point of the larger field.
 */
export function viewportToField(viewport: FieldViewport, point: Readonly<PlanePoint>): PlanePoint {
  assertViewport(viewport);
  assertPoint(point, "point");
  if (isFitViewport(viewport)) return { x: point.x, y: point.y };
  return {
    x: viewport.center.x + (point.x - 0.5) / viewport.zoom,
    y: viewport.center.y + (point.y - 0.5) / viewport.zoom,
  };
}

/** The visible field region, for sampling a raster and for deriving the SVG view box. */
export function sampleWindow(viewport: FieldViewport): FieldSampleWindow {
  assertViewport(viewport);
  if (isFitViewport(viewport)) return FIT_SAMPLE_WINDOW;
  const span = 1 / viewport.zoom;
  return {
    left: viewport.center.x - 0.5 / viewport.zoom,
    top: viewport.center.y - 0.5 / viewport.zoom,
    width: span,
    height: span,
  };
}

/**
 * Multiplies zoom by `factor` while keeping the field point under the normalized viewport
 * `anchor` fixed. The anchor holds before camera bounds apply; a bound that clamps the center can
 * move it. A request whose effective zoom equals the current zoom changes nothing, including the
 * center.
 */
export function zoomViewportAt(
  viewport: FieldViewport,
  anchor: Readonly<PlanePoint>,
  factor: number,
): FieldViewport {
  assertViewport(viewport);
  assertPoint(anchor, "anchor");
  assertFinite(factor, "factor");
  if (factor <= 0) throw new RangeError("factor must be positive");
  let zoom = clamp(viewport.zoom * factor, MIN_VIEWPORT_ZOOM, MAX_VIEWPORT_ZOOM);
  if (Math.abs(zoom - MIN_VIEWPORT_ZOOM) < FIT_ZOOM_SNAP) zoom = MIN_VIEWPORT_ZOOM;
  if (zoom === viewport.zoom) return viewport;
  const under = viewportToField(viewport, anchor);
  return constrainViewport({
    zoom,
    center: {
      x: under.x - (anchor.x - 0.5) / zoom,
      y: under.y - (anchor.y - 0.5) / zoom,
    },
  });
}

/**
 * Moves the content by a normalized viewport displacement, so the content follows a dragged
 * pointer. Compute the displacement from a stable gesture origin, not from the previous frame.
 */
export function panViewport(
  viewport: FieldViewport,
  displacement: Readonly<PlanePoint>,
): FieldViewport {
  assertViewport(viewport);
  assertPoint(displacement, "displacement");
  return constrainViewport({
    zoom: viewport.zoom,
    center: {
      x: viewport.center.x - displacement.x / viewport.zoom,
      y: viewport.center.y - displacement.y / viewport.zoom,
    },
  });
}
