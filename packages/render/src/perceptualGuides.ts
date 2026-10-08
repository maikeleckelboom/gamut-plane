import {
  OKLAB_AB_PLANE,
  OKLCH_PICKER_MAX_CHROMA,
  type DisplayGamut,
  type OklchSample,
  type PickerGuide,
} from "@gamut-plane/core";
import {
  assertOklchSample,
  gamutRayCrossings,
  gamutRayIntervals,
  type GamutRayCrossing,
} from "@gamut-plane/core/internal/capabilities";

const GUIDE_CHROMA_EPSILON = 1e-6;

/**
 * Fidelity target for traced perceptual guides, in normalized field units: the drawn polyline and
 * the true slice boundary should be within this Euclidean distance in both directions.
 * Midpoint refinement alone does not certify the entire curve; independent sweeps measure it.
 * It is 1 CSS px at the maximum 8x magnification of a 480 CSS px field.
 */
export const GUIDE_FIDELITY_BOUND = 1 / (8 * 480);

/** Midpoint chord threshold, reserving room for Float32 and SVG rounding. */
const CHORD_TOLERANCE = GUIDE_FIDELITY_BOUND / 2;
/** Events (corners and folds) are isolated to this fraction of the slice parameter range. */
const EVENT_RESOLUTION = 1e-13;
const MAX_REFINEMENT_DEPTH = 24;
/** Hard work bounds per traced guide; exceeding either is a reported failure, never a coarse guide. */
const RAY_BUDGET = 16_384;
const VERTEX_BUDGET = 16_384;
const LIGHTNESS_SEEDS = 64;
const HUE_SEEDS = 120;
/** L/C traces stop this far from black and white, whose boundary is a single point. */
const LIGHTNESS_EDGE = 1e-9;

/**
 * The exit crossing that bounds `chroma` from below: the end of the in-gamut interval containing
 * it, or the nearest exit beneath it when it lies outside. Zero when the ray has no crossing.
 */
export function boundingExitChroma(l: number, h: number, chroma: number, gamut: DisplayGamut) {
  let bound = 0;
  for (const interval of gamutRayIntervals(l, h, gamut)) {
    if (interval.start > chroma) break;
    bound = interval.end;
  }
  return bound;
}

/**
 * The guide facts for one observed color: the numerical crossing of the boundary approximated
 * by the drawn guide. Visual guidance only; exact status
 * belongs to analyzeGamut(ColorValue).
 */
export function getTracedPickerGuide(color: OklchSample, gamut: DisplayGamut): PickerGuide {
  assertOklchSample(color);
  const maximumChroma = boundingExitChroma(color.l, color.h, color.c, gamut);
  const excursion = Math.max(0, color.c - maximumChroma);
  return {
    gamut,
    maximumChroma,
    deltaC: excursion <= GUIDE_CHROMA_EPSILON ? 0 : excursion,
    color: { ...color, c: maximumChroma },
  };
}

// ---- traced slices --------------------------------------------------------------------------

interface Sample {
  readonly t: number;
  readonly crossings: readonly GamutRayCrossing[];
  /** Plane points per crossing, interleaved x/y. */
  readonly points: Float64Array;
}

interface Slice {
  readonly t0: number;
  readonly t1: number;
  readonly seeds: number;
  readonly periodic: boolean;
  evaluate(t: number): Sample;
}

const EVENT = Symbol("event");
type Entry = Sample | typeof EVENT;

class BudgetExceeded extends Error {}

/**
 * Why a slice could not be traced within its contract: its bounded work ran out, or its branches
 * did not join into one complete boundary. Neither is ever drawn as a partial or coarse guide.
 */
export type GuideTraceFailure = "approximation-budget" | "numerical-failure";
export type TracedGuide = Float32Array | GuideTraceFailure;

function failure(error: unknown): GuideTraceFailure {
  if (error instanceof BudgetExceeded) return "approximation-budget";
  throw error;
}

function sameSignature(left: Sample, right: Sample): boolean {
  if (left.crossings.length !== right.crossings.length) return false;
  for (let index = 0; index < left.crossings.length; index += 1) {
    const a = left.crossings[index]!;
    const b = right.crossings[index]!;
    if (a.exit !== b.exit || a.binding !== b.binding) return false;
  }
  return true;
}

function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Ordered samples with event markers between differing signatures. */
function sampleSlice(slice: Slice): Entry[] {
  let evaluations = 0;
  const evaluate = (t: number) => {
    evaluations += 1;
    if (evaluations > RAY_BUDGET) throw new BudgetExceeded();
    return slice.evaluate(t);
  };
  const resolution = (slice.t1 - slice.t0) * EVENT_RESOLUTION;
  const entries: Entry[] = [];
  const deviation = (a: Sample, m: Sample, b: Sample) => {
    let worst = 0;
    for (let k = 0; k < a.crossings.length; k += 1) {
      worst = Math.max(
        worst,
        segmentDistance(
          m.points[2 * k]!,
          m.points[2 * k + 1]!,
          a.points[2 * k]!,
          a.points[2 * k + 1]!,
          b.points[2 * k]!,
          b.points[2 * k + 1]!,
        ),
      );
    }
    return worst;
  };
  // Appends what lies strictly between `a` and `b`; callers append the ends.
  const between = (a: Sample, b: Sample, depth: number): void => {
    if (!sameSignature(a, b)) {
      if (b.t - a.t <= resolution) {
        entries.push(EVENT);
        return;
      }
      const m = evaluate((a.t + b.t) / 2);
      between(a, m, depth + 1);
      entries.push(m);
      between(m, b, depth + 1);
      return;
    }
    const m = evaluate((a.t + b.t) / 2);
    if (!sameSignature(a, m) || deviation(a, m, b) > CHORD_TOLERANCE) {
      if (depth >= MAX_REFINEMENT_DEPTH) throw new BudgetExceeded();
      between(a, m, depth + 1);
      entries.push(m);
      between(m, b, depth + 1);
    }
  };
  const first = evaluate(slice.t0);
  let previous = first;
  entries.push(first);
  for (let index = 1; index <= slice.seeds; index += 1) {
    const t = slice.t0 + ((slice.t1 - slice.t0) * index) / slice.seeds;
    // A periodic slice ends on its own first ray, so the seam is exact.
    const next =
      slice.periodic && index === slice.seeds
        ? { t, crossings: first.crossings, points: first.points }
        : evaluate(t);
    between(previous, next, 0);
    entries.push(next);
    previous = next;
  }
  return entries;
}

interface Span {
  readonly exits: readonly boolean[];
  /** Per branch, the plane polyline along this span in increasing slice parameter. */
  readonly branches: number[][];
}

function spansOf(entries: readonly Entry[]): Span[] {
  const spans: Span[] = [];
  let current: Sample[] = [];
  const close = () => {
    if (current.length === 0) return;
    const head = current[0]!;
    spans.push({
      exits: head.crossings.map((crossing) => crossing.exit),
      branches: head.crossings.map((_, k) =>
        current.flatMap((sample) => [sample.points[2 * k]!, sample.points[2 * k + 1]!]),
      ),
    });
    current = [];
  };
  for (const entry of entries) {
    if (entry === EVENT) close();
    else current.push(entry);
  }
  close();
  return spans;
}

/**
 * How branch ends meet across one event: a corner continues the same branch, a fold joins the
 * two converging branches on the side that has them.
 */
function junction(left: Span | null, right: Span | null): Map<string, string> {
  const map = new Map<string, string>();
  const end = (span: Span, k: number, last: boolean) => {
    const branch = span.branches[k]!;
    return last ? [branch.at(-2)!, branch.at(-1)!] : [branch[0]!, branch[1]!];
  };
  const leftIds = left ? left.branches.map((_, k) => k) : [];
  const rightIds = right ? right.branches.map((_, k) => k) : [];
  const pair = (span: Span, ids: number[], side: "L" | "R") => {
    let best = 0;
    let bestDistance = Infinity;
    for (let index = 0; index + 1 < ids.length; index += 1) {
      const [ax, ay] = end(span, ids[index]!, side === "L");
      const [bx, by] = end(span, ids[index + 1]!, side === "L");
      const distance = Math.hypot(ax! - bx!, ay! - by!);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
    map.set(`${side}:${ids[best]}`, `${side}:${ids[best + 1]}`);
    map.set(`${side}:${ids[best + 1]}`, `${side}:${ids[best]}`);
    ids.splice(best, 2);
  };
  // A fold removes or adds branches in adjacent pairs on one side.
  if (left) while (leftIds.length > rightIds.length + 1) pair(left, leftIds, "L");
  if (right) while (rightIds.length > leftIds.length + 1) pair(right, rightIds, "R");
  for (let index = 0; index < Math.min(leftIds.length, rightIds.length); index += 1) {
    map.set(`L:${leftIds[index]}`, `R:${rightIds[index]}`);
    map.set(`R:${rightIds[index]}`, `L:${leftIds[index]}`);
  }
  return map;
}

interface Piece {
  readonly span: number;
  readonly branch: number;
  readonly forward: boolean;
}

/** Joins spans into boundary chains. Exits run with the slice parameter, entries against it. */
function stitch(
  spans: readonly Span[],
  periodic: boolean,
): {
  chain(span: number, branch: number, forward: boolean): Readonly<{ pieces: Piece[]; end: string }>;
  visited: Set<string>;
  total: number;
} {
  const count = spans.length;
  const junctions: Map<string, string>[] = [];
  for (let index = 0; index <= count; index += 1) {
    if (periodic && (index === 0 || index === count)) continue;
    junctions[index] = junction(
      index > 0 ? spans[index - 1]! : null,
      index < count ? spans[index]! : null,
    );
  }
  if (periodic) junctions[0] = junctions[count] = junction(spans[count - 1]!, spans[0]!);
  const visited = new Set<string>();
  const total = spans.reduce((sum, span) => sum + span.branches.length, 0);
  function chain(span: number, branch: number, forward: boolean) {
    const pieces: Piece[] = [];
    for (let guard = 0; guard <= total; guard += 1) {
      const key = `${span}:${branch}`;
      if (visited.has(key)) return { pieces, end: "loop" };
      visited.add(key);
      pieces.push({ span, branch, forward });
      const at = forward ? span + 1 : span;
      if (!periodic && (at === 0 || at === count))
        return { pieces, end: at === 0 ? "start" : "end" };
      const partner = junctions[at]!.get(`${forward ? "L" : "R"}:${branch}`);
      if (partner === undefined) return { pieces, end: "broken" };
      const [side, index] = partner.split(":");
      if (side === "R") {
        span = periodic && at === count ? 0 : at;
        forward = true;
      } else {
        span = periodic && at === 0 ? count - 1 : at - 1;
        forward = false;
      }
      branch = Number(index);
    }
    return { pieces, end: "broken" };
  }
  return { chain, visited, total };
}

function emit(spans: readonly Span[], pieces: readonly Piece[], out: number[]): void {
  for (const { span, branch, forward } of pieces) {
    const line = spans[span]!.branches[branch]!;
    if (forward) for (let k = 0; k < line.length; k += 2) push(out, line[k]!, line[k + 1]!);
    else for (let k = line.length - 2; k >= 0; k -= 2) push(out, line[k]!, line[k + 1]!);
  }
}

function push(out: number[], x: number, y: number): void {
  // Compare in the representation we actually return: localized events can collapse in Float32.
  x = Math.fround(x);
  y = Math.fround(y);
  if (out.length >= 2 && out[out.length - 2] === x && out[out.length - 1] === y) return;
  if (out.length >= VERTEX_BUDGET * 2) throw new BudgetExceeded();
  out.push(x, y);
}

/**
 * Traced OKLCH L/C boundary at one hue: an open polyline from black to white through discovered
 * branches, including notches. The gray axis is the editor-domain edge
 * and is not part of it.
 */
function traceLightnessChroma(gamut: DisplayGamut, hue: number): TracedGuide {
  const slice: Slice = {
    t0: LIGHTNESS_EDGE,
    t1: 1 - LIGHTNESS_EDGE,
    seeds: LIGHTNESS_SEEDS,
    periodic: false,
    evaluate(t) {
      const crossings = gamutRayCrossings(t, hue, gamut);
      const points = new Float64Array(crossings.length * 2);
      crossings.forEach((crossing, k) => {
        points[2 * k] = crossing.chroma / OKLCH_PICKER_MAX_CHROMA;
        points[2 * k + 1] = 1 - t;
      });
      return { t, crossings, points };
    },
  };
  try {
    const spans = spansOf(sampleSlice(slice));
    const { chain, visited, total } = stitch(spans, false);
    const out: number[] = [];
    const black = [0, 1] as const;
    const white = [0, 0] as const;
    const first = spans[0]!;
    const last = spans.at(-1)!;
    const fromStart: Readonly<{ pieces: Piece[]; end: string }>[] = [];
    for (let k = first.branches.length - 1; k >= 0; k -= 1)
      if (first.exits[k] && !visited.has(`0:${k}`)) fromStart.push(chain(0, k, true));
    const fromEnd: Readonly<{ pieces: Piece[]; end: string }>[] = [];
    for (let k = last.branches.length - 1; k >= 0; k -= 1)
      if (!last.exits[k] && !visited.has(`${spans.length - 1}:${k}`))
        fromEnd.push(chain(spans.length - 1, k, false));
    push(out, ...black);
    for (const loop of fromStart.filter((candidate) => candidate.end === "start")) {
      emit(spans, loop.pieces, out);
      push(out, ...black);
    }
    for (const main of fromStart.filter((candidate) => candidate.end === "end"))
      emit(spans, main.pieces, out);
    push(out, ...white);
    for (const loop of fromEnd.filter((candidate) => candidate.end === "end")) {
      emit(spans, loop.pieces, out);
      push(out, ...white);
    }
    // Every branch must belong to exactly one chain between black and white.
    const ends = [...fromStart, ...fromEnd].map((candidate) => candidate.end);
    const mains = ends.filter((end, index) => index < fromStart.length && end === "end").length;
    if (visited.size !== total || mains !== 1 || ends.some((end) => end === "broken"))
      return "numerical-failure";
    return Float32Array.from(out);
  } catch (error) {
    return failure(error);
  }
}

/**
 * Traced OKLab a/b boundary at one lightness: the closed boundary loop around the gray, with its
 * first point repeated at the end. A lightness of 0 or 1 is the gray point alone.
 */
function traceOklab(gamut: DisplayGamut, lightness: number): TracedGuide {
  if (lightness < 0 || lightness > 1) return new Float32Array();
  if (lightness === 0 || lightness === 1) return Float32Array.of(0.5, 0.5, 0.5, 0.5);
  const span = OKLAB_AB_PLANE.xAxis.max - OKLAB_AB_PLANE.xAxis.min;
  const slice: Slice = {
    t0: 0,
    t1: 360,
    seeds: HUE_SEEDS,
    periodic: true,
    evaluate(t) {
      const radians = t * (Math.PI / 180);
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);
      const crossings = gamutRayCrossings(lightness, t, gamut);
      const points = new Float64Array(crossings.length * 2);
      crossings.forEach((crossing, k) => {
        points[2 * k] = 0.5 + (crossing.chroma * cosine) / span;
        points[2 * k + 1] = 0.5 - (crossing.chroma * sine) / span;
      });
      return { t, crossings, points };
    },
  };
  try {
    const spans = spansOf(sampleSlice(slice));
    const { chain, visited, total } = stitch(spans, true);
    // The loop through the first ray's innermost exit encloses the gray; a second, separate loop
    // could not be drawn as one closed contour, so it is a failure rather than an omission.
    const loop = chain(0, 0, true);
    if (loop.end !== "loop" || visited.size !== total) return "numerical-failure";
    const out: number[] = [];
    emit(spans, loop.pieces, out);
    push(out, out[0]!, out[1]!);
    return Float32Array.from(out);
  } catch (error) {
    return failure(error);
  }
}

// One remembered result per plane kind and gamut: dragging inside a plane keeps its slice.
const memo = new Map<string, Readonly<{ fixed: number; traced: TracedGuide }>>();

function remembered(key: string, fixed: number, trace: () => TracedGuide): TracedGuide {
  const hit = memo.get(key);
  const traced = hit && Object.is(hit.fixed, fixed) ? hit.traced : trace();
  if (!hit || !Object.is(hit.fixed, fixed)) memo.set(key, { fixed, traced });
  return typeof traced === "string" ? traced : traced.slice();
}

/**
 * Adaptively traced OKLCH L/C guide at `hue`, as interleaved normalized field points, or an explicit
 * work/topology failure. Finite event sampling is not a completeness certificate.
 */
export function traceLightnessChromaGuide(gamut: DisplayGamut, hue: number): TracedGuide {
  if (!Number.isFinite(hue)) throw new TypeError("Boundary hue must be finite");
  return remembered(`lc:${gamut}`, hue, () => traceLightnessChroma(gamut, hue));
}

/** Adaptively traced closed OKLab a/b guide at `lightness`; see {@link traceLightnessChromaGuide}. */
export function traceOklabGuide(gamut: DisplayGamut, lightness: number): TracedGuide {
  if (!Number.isFinite(lightness)) throw new TypeError("Contour lightness must be finite");
  return remembered(`ab:${gamut}`, lightness, () => traceOklab(gamut, lightness));
}
