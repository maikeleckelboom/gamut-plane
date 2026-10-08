/** Axes that declare nominal bounds (core planes); native RGB axes declare none and span [0, 1]. */
export type PlaneAxisBounds = object;

export interface PlaneAxisEnds {
  readonly start: string;
  readonly end: string;
}

/** The visible part of an axis as fractions of its nominal range, along increasing value. */
export interface PlaneAxisSpan {
  readonly start: number;
  readonly end: number;
}

function formatEnd(value: number): string {
  return String(Number(value.toFixed(3)));
}

function bound(axis: PlaneAxisBounds, key: "min" | "max", fallback: number): number {
  const value = (axis as { min?: number; max?: number })[key];
  return typeof value === "number" ? value : fallback;
}

/**
 * End labels for the gutter: start is left/bottom, end is right/top. Without a `visible` span they
 * are the nominal domain ends; with one they describe the visible coordinate range. The span never
 * implies that every point of that Cartesian range is editable in a disc.
 */
export function planeAxisEnds(axis: PlaneAxisBounds, visible?: PlaneAxisSpan): PlaneAxisEnds {
  const min = bound(axis, "min", 0);
  const max = bound(axis, "max", 1);
  if (visible === undefined) return { start: formatEnd(min), end: formatEnd(max) };
  const extent = max - min;
  return {
    start: formatEnd(min + extent * visible.start),
    end: formatEnd(min + extent * visible.end),
  };
}

/**
 * Visible axis spans for a camera window in normalized field coordinates. X increases to the
 * right and Y decreases down the screen in every shipped geometry, so the vertical span is
 * measured from the bottom edge.
 */
export function planeAxisSpans(
  window: Readonly<{ left: number; top: number; width: number; height: number }>,
): Readonly<{ x: PlaneAxisSpan; y: PlaneAxisSpan }> {
  return {
    x: { start: window.left, end: window.left + window.width },
    y: { start: 1 - (window.top + window.height), end: 1 - window.top },
  };
}
