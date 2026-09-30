import type { ColorRepresentation } from "@gamut-plane/core";
import {
  convertLinearRgb,
  decodeRgbCoordinate,
  encodeRgbCoordinate,
  representationDefinitions,
  type GeometryDefinition,
} from "@gamut-plane/core/internal/capabilities";

export type RgbGeometry = Extract<GeometryDefinition, { representationId: "srgb" | "display-p3" }>;
type Space = RgbGeometry["representationId"];
type Vector = readonly [number, number, number];
type Point = readonly [number, number];
type Index = 0 | 1 | 2;
export type RgbCoverage = "full" | "partial" | "empty";
export type RgbDimension = "empty" | "point" | "line" | "area";
export type RgbNumericResult<T> =
  | Readonly<{ kind: "available"; value: T }>
  | Readonly<{ kind: "value-unavailable"; reason: "numerical-failure" | "approximation-budget" }>;
export interface RgbContour {
  readonly points: Float64Array;
  readonly closed: boolean;
  readonly coverage: RgbCoverage;
  /** Dimension of the complete slice, independently of nominal-square coverage. */
  readonly dimension: RgbDimension;
  readonly nominalDimension: RgbDimension;
  readonly errorBound: number;
}
export type RgbInterval = Readonly<{
  coverage: RgbCoverage;
  interval: Readonly<{ start: number; end: number }> | null;
}>;
export type RgbChannelIntervals<R extends Space = Space> = {
  readonly [C in "r" | "g" | "b"]: Readonly<{
    channelId: `${R}.${C}`;
    result: RgbNumericResult<RgbInterval>;
  }>;
};

/** Linear-coordinate geometric decisions only; never exact gamut or Reference tolerance. */
export const RGB_GEOMETRY_EPSILON = 1e-12;
/** Per screen-coordinate chord error, before SVG's 0.000005-coordinate rounding. */
export const RGB_CURVE_ERROR = 1e-5;
export const RGB_CURVE_MAX_POINTS = 16384;
const transition = 0.0031308;
const epsilon = RGB_GEOMETRY_EPSILON;
const available = <T>(value: T): RgbNumericResult<T> => ({ kind: "available", value });
const failure = { kind: "value-unavailable", reason: "numerical-failure" } as const;

export function rgbAxisIndices(
  geometry: RgbGeometry,
): Readonly<{ x: Index; y: Index; fixed: Index }> {
  const channels = representationDefinitions[geometry.representationId].channels;
  return {
    x: channels.find((c) => c.id === geometry.x)!.index,
    y: channels.find((c) => c.id === geometry.y)!.index,
    fixed: channels.find((c) => c.id === geometry.fixed)!.index,
  };
}

function cube(editor: Space, target: Space): Vector[] {
  return Array.from({ length: 8 }, (_, i) =>
    convertLinearRgb([i & 1, (i >> 1) & 1, (i >> 2) & 1], target, editor),
  );
}
function extrema(vertices: readonly Vector[], axis: Index): readonly [number, number] {
  return [Math.min(...vertices.map((v) => v[axis])), Math.max(...vertices.map((v) => v[axis]))];
}
function outsideBounds(encoded: number, vertices: readonly Vector[], axis: Index): boolean {
  const [lo, hi] = extrema(vertices, axis);
  return encoded < encodeRgbCoordinate(lo) || encoded > encodeRgbCoordinate(hi);
}
function cross(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
/** Deterministic convex hull also retains a singleton or a line's two endpoints. */
function hull(input: readonly Point[]): Point[] {
  const sorted = [...input].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const points = sorted.filter(
    (p, i) =>
      i === 0 ||
      Math.max(Math.abs(p[0] - sorted[i - 1]![0]), Math.abs(p[1] - sorted[i - 1]![1])) > epsilon,
  );
  if (points.length < 3) return points;
  const chain = (values: readonly Point[]) => {
    const result: Point[] = [];
    for (const p of values) {
      while (result.length > 1 && cross(result.at(-2)!, result.at(-1)!, p) <= 0) result.pop();
      result.push(p);
    }
    result.pop();
    return result;
  };
  return [...chain(points), ...chain(points.toReversed())];
}
function dimension(points: readonly Point[]): RgbDimension {
  return points.length === 0
    ? "empty"
    : points.length === 1
      ? "point"
      : points.length === 2
        ? "line"
        : "area";
}

/** Clip only the coverage witness. Never publish these artificial square edges as a contour. */
function nominalIntersection(points: readonly Point[]): Point[] {
  let output = [...points];
  for (const [axis, bound, sign] of [
    [0, 0, 1],
    [0, 1, -1],
    [1, 0, 1],
    [1, 1, -1],
  ] as const) {
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i]!;
      const b = input[(i + 1) % input.length]!;
      const da = (a[axis] - bound) * sign;
      const db = (b[axis] - bound) * sign;
      if (da >= 0) output.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        output.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
      }
    }
  }
  return hull(output);
}

/** Certified scalar second-derivative bound on a transition-free linear segment. */
function chordError(a: number, b: number): number {
  const min = Math.min(Math.abs(a), Math.abs(b));
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max <= transition) return 0;
  const power = 1 / 2.4;
  const curvature = 1.055 * power * (1 - power) * Math.max(transition, min) ** (power - 2);
  // The library's rounded transfer junction has a jump < 3e-8 encoded units.
  return (curvature * (b - a) ** 2) / 8 + 3e-8;
}
function approximate(points: readonly Point[]): Float64Array | null {
  const result: number[] = [];
  const emit = (p: Point) => result.push(encodeRgbCoordinate(p[0]), 1 - encodeRgbCoordinate(p[1]));
  if (points.length === 0) return new Float64Array();
  emit(points[0]!);
  const edges = points.length > 2 ? points.length : points.length - 1;
  for (let i = 0; i < edges; i++) {
    const a = points[i]!,
      b = points[(i + 1) % points.length]!;
    const cuts = [0, 1];
    for (const axis of [0, 1] as const) {
      if (a[axis] === b[axis]) continue;
      for (const boundary of [-transition, 0, transition]) {
        const t = (boundary - a[axis]) / (b[axis] - a[axis]);
        if (t > 0 && t < 1) cuts.push(t);
      }
    }
    cuts.sort((a, b) => a - b);
    const point = (t: number): Point => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    const segment = (start: Point, end: Point, depth: number): boolean => {
      if (result.length / 2 >= RGB_CURVE_MAX_POINTS) return false;
      if (Math.max(chordError(start[0], end[0]), chordError(start[1], end[1])) <= RGB_CURVE_ERROR) {
        emit(end);
        return true;
      }
      if (depth === 24) return false;
      const middle: Point = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
      return segment(start, middle, depth + 1) && segment(middle, end, depth + 1);
    };
    for (let j = 1; j < cuts.length; j++)
      if (!segment(point(cuts[j - 1]!), point(cuts[j]!), 0)) return null;
  }
  return new Float64Array(result);
}

export function rgbGamutSlice(
  geometry: RgbGeometry,
  target: Space,
  fixed: number,
): RgbNumericResult<RgbContour> {
  if (!Number.isFinite(fixed)) return failure;
  if (geometry.representationId === target) {
    const full = fixed >= 0 && fixed <= 1;
    return available({
      points: new Float64Array(full ? [0, 1, 1, 1, 1, 0, 0, 0, 0, 1] : []),
      closed: full,
      coverage: full ? "full" : "empty",
      dimension: full ? "area" : "empty",
      nominalDimension: full ? "area" : "empty",
      errorBound: 0,
    });
  }
  const axes = rgbAxisIndices(geometry);
  const vertices = cube(geometry.representationId, target);
  if (!vertices.every((v) => v.every(Number.isFinite))) return failure;
  const empty = (): RgbNumericResult<RgbContour> =>
    available({
      points: new Float64Array(),
      closed: false,
      coverage: "empty",
      dimension: "empty",
      nominalDimension: "empty",
      errorBound: RGB_CURVE_ERROR,
    });
  // Compare bounded encoded cube extrema before decoding potentially enormous finite authorship.
  if (outsideBounds(fixed, vertices, axes.fixed)) return empty();
  const linearFixed = decodeRgbCoordinate(fixed);
  if (!Number.isFinite(linearFixed)) return failure;
  const intersections: Point[] = [];
  for (let i = 0; i < 8; i++) {
    const a = vertices[i]!;
    if (Math.abs(a[axes.fixed] - linearFixed) <= epsilon)
      intersections.push([a[axes.x], a[axes.y]]);
    for (const bit of [1, 2, 4]) {
      if ((i & bit) !== 0) continue;
      const b = vertices[i | bit]!;
      if (
        Math.abs(a[axes.fixed] - linearFixed) <= epsilon ||
        Math.abs(b[axes.fixed] - linearFixed) <= epsilon
      )
        continue;
      const delta = b[axes.fixed] - a[axes.fixed];
      if (delta === 0) continue;
      const t = (linearFixed - a[axes.fixed]) / delta;
      if (t > 0 && t < 1)
        intersections.push([
          a[axes.x] + t * (b[axes.x] - a[axes.x]),
          a[axes.y] + t * (b[axes.y] - a[axes.y]),
        ]);
    }
  }
  const polygon = hull(intersections);
  const nominal = nominalIntersection(polygon);
  const corners: readonly Point[] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const full = corners.every((p) => {
    const native: [number, number, number] = [0, 0, 0];
    native[axes.x] = p[0];
    native[axes.y] = p[1];
    native[axes.fixed] = linearFixed;
    return convertLinearRgb(native, geometry.representationId, target).every(
      (v) => v >= -epsilon && v <= 1 + epsilon,
    );
  });
  const points = approximate(polygon);
  if (points === null) return { kind: "value-unavailable", reason: "approximation-budget" };
  if (!points.every(Number.isFinite)) return failure;
  return available({
    points,
    closed: polygon.length > 2,
    coverage: full ? "full" : nominal.length ? "partial" : "empty",
    dimension: dimension(polygon),
    nominalDimension: dimension(nominal),
    errorBound: RGB_CURVE_ERROR,
  });
}

export function rgbChannelInterval(
  space: Space,
  target: Space,
  channels: Vector,
  axis: Index,
): RgbNumericResult<RgbInterval> {
  if (!channels.every(Number.isFinite)) return failure;
  const empty = () => available<RgbInterval>({ coverage: "empty", interval: null });
  const vertices = cube(space, target);
  if (!vertices.every((v) => v.every(Number.isFinite))) return failure;
  const siblings = ([0, 1, 2] as const).filter((i) => i !== axis);
  if (space === target)
    return siblings.some((i) => channels[i] < 0 || channels[i] > 1)
      ? empty()
      : available({ coverage: "full", interval: { start: 0, end: 1 } });
  if (siblings.some((i) => outsideBounds(channels[i], vertices, i))) return empty();
  const native: [number, number, number] = [0, 0, 0];
  for (const i of siblings) native[i] = decodeRgbCoordinate(channels[i]);
  const origin = convertLinearRgb(native, space, target);
  const unit: [number, number, number] = [0, 0, 0];
  unit[axis] = 1;
  const direction = convertLinearRgb(unit, space, target);
  if (![...origin, ...direction].every(Number.isFinite)) return failure;
  let lo = 0,
    hi = 1;
  for (const i of [0, 1, 2] as const) {
    const coefficient = direction[i];
    // On the unit track a coefficient this small contributes only geometric roundoff.
    if (Math.abs(coefficient) <= epsilon) {
      if (origin[i] < -epsilon || origin[i] > 1 + epsilon) return empty();
      continue;
    }
    const a = -origin[i] / coefficient,
      b = (1 - origin[i]) / coefficient;
    lo = Math.max(lo, Math.min(a, b));
    hi = Math.min(hi, Math.max(a, b));
  }
  if (lo > hi) {
    if (lo - hi > epsilon) return empty();
    // Resolve coincident bounds on the nominal track, never modifying authored inputs.
    lo = hi = Math.min(1, Math.max(0, (lo + hi) / 2));
  }
  const start = encodeRgbCoordinate(lo),
    end = encodeRgbCoordinate(hi);
  if (![start, end].every(Number.isFinite)) return failure;
  return available({
    coverage: lo === 0 && hi === 1 ? "full" : "partial",
    interval: { start, end },
  });
}

export function rgbChannelIntervals<R extends Space>(
  observation: ColorRepresentation<R>,
  target: Space,
): RgbChannelIntervals<R> {
  return {
    r: {
      channelId: `${observation.space}.r`,
      result: rgbChannelInterval(observation.space, target, observation.channels, 0),
    },
    g: {
      channelId: `${observation.space}.g`,
      result: rgbChannelInterval(observation.space, target, observation.channels, 1),
    },
    b: {
      channelId: `${observation.space}.b`,
      result: rgbChannelInterval(observation.space, target, observation.channels, 2),
    },
  };
}
