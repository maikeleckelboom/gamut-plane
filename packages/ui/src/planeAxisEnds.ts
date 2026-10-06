/** Axes that declare nominal bounds (core planes); native RGB axes declare none and span [0, 1]. */
export type PlaneAxisBounds = object;

export interface PlaneAxisEnds {
  readonly start: string;
  readonly end: string;
}

function formatEnd(value: number): string {
  return String(Number(value.toFixed(3)));
}

function bound(axis: PlaneAxisBounds, key: "min" | "max", fallback: number): number {
  const value = (axis as { min?: number; max?: number })[key];
  return typeof value === "number" ? value : fallback;
}

/** Nominal-domain end labels for the gutter: start is left/bottom, end is right/top. */
export function planeAxisEnds(axis: PlaneAxisBounds): PlaneAxisEnds {
  return { start: formatEnd(bound(axis, "min", 0)), end: formatEnd(bound(axis, "max", 1)) };
}
