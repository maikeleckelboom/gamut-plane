import {
  RGB_NUMERIC_REVISION,
  linearRgbToOklabBatch,
  spatialColorDefinition,
  type RgbRepresentationId,
} from "@gamut-plane/core/internal/capabilities";

/**
 * Exact constant-lightness section of an RGB gamut in OKLab.
 *
 * The section is the intersection of the gamut {q in [0,1]^3 : linear RGB} with the plane L = L0.
 * Its boundary is the set of cube-face points whose OKLab lightness is L0, so every vertex here lies
 * on the true curved gamut boundary: an RGB channel is exactly 0 or 1 and the lightness is L0 to
 * rounding. Nothing is intersected with a triangle mesh, and no section is derived from a maximum
 * chroma envelope.
 *
 * Method (see docs/phase-3c1-linked-lightness-section.md):
 *
 * 1. L(q) = w . cbrt(M q) is strictly increasing in every linear channel on the cube. This is a
 *    property of the built-in gamut definitions, verified at run time by `lightnessMonotonicityMargin`
 *    (a sufficient analytic condition on the core matrices); it is not assumed silently.
 * 2. Consequently each of the 12 cube edges crosses L0 at most once, each cube face holds either no
 *    contour or exactly one arc joining two edge crossings, and that arc is a graph over
 *    tau = u - v in the face coordinates (u, v). Arc points are found by a safeguarded root search
 *    along the diagonal chord of constant tau.
 * 3. Arcs join only at shared cube-edge crossings (edge identity), never by proximity. A generic
 *    assembler turns the arc graph into closed loops, so several loops are representable even though
 *    the built-in gamuts produce one.
 * 4. Each arc is refined by bounded midpoint bisection until every tested chord midpoint is within a
 *    declared in-plane tolerance of its segment. This is a finite-sample statement, not a continuous
 *    Hausdorff bound.
 *
 * All conversions use core's batch bridge. Work is bounded; anything that cannot be resolved within
 * the declared limits is reported as an error, never as fabricated geometry.
 */

export const LIGHTNESS_SECTION_REVISION = "lightness-section-faces-v1";
export const DEFAULT_SECTION_CHORD_TOLERANCE = 1e-5;
export interface SectionLimits {
  /** Total OKLab conversions for one section. */
  readonly maxConversions: number;
  /** Total vertices over all loops. */
  readonly maxVertices: number;
  /** Midpoint refinement rounds. */
  readonly maxRefinementRounds: number;
  /** Root-search iterations per chord. */
  readonly maxSolverIterations: number;
  /** Interior samples per arc before refinement. */
  readonly initialSamplesPerArc: number;
}
export const DEFAULT_SECTION_LIMITS: SectionLimits = Object.freeze({
  maxConversions: 300_000,
  maxVertices: 16_384,
  maxRefinementRounds: 16,
  maxSolverIterations: 100,
  initialSamplesPerArc: 24,
});

export interface LightnessSectionOptions {
  readonly space: RgbRepresentationId;
  /** OKLab lightness of the plane. */
  readonly lightness: number;
  /** In-plane tolerance (OKLab units) for the tested chord midpoints. Defaults to 1e-5. */
  readonly chordTolerance?: number;
  readonly limits?: Partial<SectionLimits>;
}

/** One closed polyline of the section boundary. */
export interface SectionLoop {
  /** Scene [a, L, b] vertices. L is the requested lightness exactly. The last segment closes the loop. */
  readonly positions: Float64Array;
  /** Source linear RGB of each vertex; at least one channel is exactly 0 or 1. */
  readonly linearRgb: Float64Array;
  /** Cube edge (see `cubeEdgeId`) when the vertex is a crossing of one, otherwise -1. */
  readonly edges: Int8Array;
  /** Face binding `2 * channel + bound` of the cube face that contains segment i (vertex i to i + 1). */
  readonly segmentFaces: Uint8Array;
  /** Shoelace area in the (a, b) plane; every loop is counterclockwise (positive). */
  readonly signedArea: number;
}
export interface SectionWork {
  readonly conversions: number;
  /** Conversions spent inside root searches (a subset of `conversions`). */
  readonly rootEvaluations: number;
  readonly refinementRounds: number;
  readonly arcs: number;
  readonly vertices: number;
}
export interface LightnessSection {
  /**
   * `region`: one or more boundary loops. `point`: L is 0 or 1 and the in-gamut set is the neutral
   * point alone. `empty`: L lies outside [0, 1], where no color of the gamut exists.
   */
  readonly kind: "region" | "point" | "empty";
  readonly space: RgbRepresentationId;
  readonly gamut: "srgb-gamut" | "display-p3-gamut";
  readonly lightness: number;
  readonly loops: readonly SectionLoop[];
  /** Scene [a, L, b] of the neutral point for `point`, otherwise empty. */
  readonly points: Float64Array;
  /** In-plane extent of the loops, or null. */
  readonly bounds: Readonly<{
    min: readonly [number, number];
    max: readonly [number, number];
  }> | null;
  readonly generatorRevision: string;
  readonly definitionRevision: string;
  readonly quality: Readonly<{
    chordTolerance: number;
    /** Largest tested midpoint deviation actually observed (always at most the tolerance). */
    maxObservedChordDeviation: number;
    /** Largest |L(vertex) - L0| of the converted vertices. */
    maxLightnessResidual: number;
    work: SectionWork;
  }>;
}
export type SectionError =
  | "invalid-options"
  | "resource-budget"
  | "numerical-failure"
  | "topology-inconsistent";
export type LightnessSectionResult =
  | Readonly<{ ok: true; value: LightnessSection }>
  | Readonly<{ ok: false; error: SectionError; detail: string }>;

const EPSILON = Number.EPSILON;
// Row 0 of the inverse of core's OKLab -> LMS' matrix is the lightness weight vector.
type Matrix = readonly (readonly number[])[];

function invert3(m: Matrix): number[][] {
  const [a, b, c] = m[0]!,
    [d, e, f] = m[1]!,
    [g, h, i] = m[2]!;
  const det = a! * (e! * i! - f! * h!) - b! * (d! * i! - f! * g!) + c! * (d! * h! - e! * g!);
  return [
    [(e! * i! - f! * h!) / det, (c! * h! - b! * i!) / det, (b! * f! - c! * e!) / det],
    [(f! * g! - d! * i!) / det, (a! * i! - c! * g!) / det, (c! * d! - a! * f!) / det],
    [(d! * h! - e! * g!) / det, (b! * g! - a! * h!) / det, (a! * e! - b! * d!) / det],
  ];
}

/**
 * Sufficient analytic condition that L is strictly increasing in every linear channel on the cube.
 *
 * dL/dq_j = (1/3) sum_k w_k M_kj x_k^(-2) with x_k = cbrt(l_k) > 0 and M the linear RGB -> LMS matrix.
 * With every M entry positive, only the weight(s) of negative sign can oppose, and l_m / l_s is bounded
 * by max_j(M_mj / M_sj). Returns the smallest, over channels, of the strongest positive term divided by
 * the opposing term at its worst ratio. A value above 1 proves strict monotonicity; the built-in
 * gamuts have a margin above 200. Infinity when no weight opposes. 0 when the structure is unsupported.
 */
export function lightnessMonotonicityMargin(space: RgbRepresentationId): number {
  const definition = spatialColorDefinition(space);
  const toLms = invert3(definition.lmsToLinearRgb);
  const weights = invert3(definition.oklabToLmsPrime)[0]!;
  if (!toLms.every((row) => row.every((value) => value > 0))) return 0;
  const negative = weights.map((w, k) => (w < 0 ? k : -1)).filter((k) => k >= 0);
  if (negative.length === 0) return Number.POSITIVE_INFINITY;
  if (negative.length > 1) return 0;
  const s = negative[0]!;
  let margin = Number.POSITIVE_INFINITY;
  for (let j = 0; j < 3; j++) {
    let best = 0;
    weights.forEach((w, k) => {
      if (w <= 0) return;
      const ratio = Math.max(...[0, 1, 2].map((i) => toLms[k]![i]! / toLms[s]![i]!));
      best = Math.max(
        best,
        (w * toLms[k]![j]!) / (Math.abs(weights[s]!) * toLms[s]![j]! * ratio ** (2 / 3)),
      );
    });
    margin = Math.min(margin, best);
  }
  return margin;
}

export class SectionFailure extends Error {
  readonly code: SectionError;
  constructor(code: SectionError, detail: string) {
    super(detail);
    this.code = code;
  }
}

/** Counts every conversion against the budget and turns library failures into aborts. */
class Evaluator {
  conversions = 0;
  iterations = 0;
  maxResidual = 0;
  private readonly space: RgbRepresentationId;
  private readonly limit: number;
  constructor(space: RgbRepresentationId, limit: number) {
    this.space = space;
    this.limit = limit;
  }
  /** Packed [L, a, b] for packed linear RGB. */
  convert(points: Float64Array): Float64Array {
    this.conversions += points.length / 3;
    if (this.conversions > this.limit)
      throw new SectionFailure("resource-budget", `more than ${this.limit} conversions`);
    const result = linearRgbToOklabBatch(points, this.space);
    if (!result.ok)
      throw new SectionFailure("numerical-failure", `conversion: ${result.error.code}`);
    return result.value;
  }
}

/** Points p0 + s d for s in [0, length]. */
interface Line {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly length: number;
}
interface Root {
  readonly s: number;
  readonly rgb: readonly [number, number, number];
  readonly a: number;
  readonly b: number;
  readonly residual: number;
}

/**
 * All roots of f(origin + s d) = level on [0, length], solved together so conversions are batched.
 * f is increasing along every line used here, so f(0) <= level <= f(length) brackets exactly one root.
 * The search is a safeguarded Illinois iteration on f^3 - level^3, which is close to linear along a
 * chord even where the cube root makes f steep near black. A violated bracket is a numerical failure.
 */
function solveLines(
  evaluator: Evaluator,
  level: number,
  lines: readonly Line[],
  maxIterations: number,
): Root[] {
  const count = lines.length;
  if (count === 0) return [];
  const at = (index: number, s: number, out: Float64Array, offset: number) => {
    const line = lines[index]!;
    for (let k = 0; k < 3; k++) out[offset + k] = line.origin[k]! + s * line.direction[k]!;
  };
  const ends = new Float64Array(6 * count);
  lines.forEach((line, i) => {
    at(i, 0, ends, 6 * i);
    at(i, line.length, ends, 6 * i + 3);
  });
  const endValues = evaluator.convert(ends);
  const lo = new Float64Array(count),
    hi = new Float64Array(count),
    glo = new Float64Array(count),
    ghi = new Float64Array(count),
    side = new Int8Array(count);
  const best = new Float64Array(4 * count); // s, a, b, f of the latest evaluation per line
  const done = new Uint8Array(count);
  const target = level * level * level;
  for (let i = 0; i < count; i++) {
    const line = lines[i]!;
    const f0 = endValues[6 * i]!,
      f1 = endValues[6 * i + 3]!;
    if (!(f0 <= level && level <= f1))
      throw new SectionFailure("numerical-failure", `line ${i} does not bracket L = ${level}`);
    lo[i] = 0;
    hi[i] = line.length;
    glo[i] = f0 * f0 * f0 - target;
    ghi[i] = f1 * f1 * f1 - target;
    const endpoint = f0 === level ? 0 : f1 === level ? 1 : -1;
    if (endpoint >= 0) {
      const offset = 6 * i + 3 * endpoint;
      best[4 * i] = endpoint === 0 ? 0 : line.length;
      best[4 * i + 1] = endValues[offset + 1]!;
      best[4 * i + 2] = endValues[offset + 2]!;
      best[4 * i + 3] = endValues[offset]!;
      done[i] = 1;
    }
  }
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const active: number[] = [];
    const guesses: number[] = [];
    for (let i = 0; i < count; i++) {
      if (done[i]) continue;
      let x = (lo[i]! * ghi[i]! - hi[i]! * glo[i]!) / (ghi[i]! - glo[i]!);
      if (!(x > lo[i]! && x < hi[i]!)) x = 0.5 * (lo[i]! + hi[i]!);
      if (!(x > lo[i]! && x < hi[i]!)) {
        // The bracket has collapsed to adjacent doubles: the remaining end is the answer.
        x = Math.abs(glo[i]!) <= Math.abs(ghi[i]!) ? lo[i]! : hi[i]!;
      }
      active.push(i);
      guesses.push(x);
    }
    if (active.length === 0) break;
    const points = new Float64Array(3 * active.length);
    active.forEach((i, k) => at(i, guesses[k]!, points, 3 * k));
    const values = evaluator.convert(points);
    evaluator.iterations += active.length;
    active.forEach((i, k) => {
      const x = guesses[k]!;
      const f = values[3 * k]!;
      best[4 * i] = x;
      best[4 * i + 1] = values[3 * k + 1]!;
      best[4 * i + 2] = values[3 * k + 2]!;
      best[4 * i + 3] = f;
      const g = f * f * f - target;
      const collapsed =
        hi[i]! - lo[i]! <= 4 * EPSILON * Math.max(Math.abs(lo[i]!), Math.abs(hi[i]!));
      if (g === 0 || Math.abs(f - level) <= 8 * EPSILON * level || collapsed) {
        done[i] = 1;
        return;
      }
      if (g < 0) {
        lo[i] = x;
        glo[i] = g;
        if (side[i] === -1) ghi[i] = ghi[i]! * 0.5;
        side[i] = -1;
      } else {
        hi[i] = x;
        ghi[i] = g;
        if (side[i] === 1) glo[i] = glo[i]! * 0.5;
        side[i] = 1;
      }
    });
  }
  const roots: Root[] = [];
  for (let i = 0; i < count; i++) {
    const residual = best[4 * i + 3]! - level;
    evaluator.maxResidual = Math.max(evaluator.maxResidual, Math.abs(residual));
    if (!(Math.abs(residual) <= 1e-12 * Math.max(level, 1e-300)))
      throw new SectionFailure(
        "numerical-failure",
        `line ${i} did not converge (residual ${residual})`,
      );
    const s = best[4 * i]!;
    const line = lines[i]!;
    roots.push({
      s,
      rgb: [
        line.origin[0]! + s * line.direction[0]!,
        line.origin[1]! + s * line.direction[1]!,
        line.origin[2]! + s * line.direction[2]!,
      ],
      a: best[4 * i + 1]!,
      b: best[4 * i + 2]!,
      residual,
    });
  }
  return roots;
}

// --- Cube topology -------------------------------------------------------------------------------

/** Corner index 4r + 2g + b for the unit-cube corner (r, g, b). */
const corner = (r: number, g: number, b: number) => 4 * r + 2 * g + b;

/**
 * Cube edge identity: `4 * channel + 2 * bound(o1) + bound(o2)` where `channel` is the varying channel
 * and o1 < o2 are the other two. Twelve edges, ids 0 to 11. Each lies on the two faces
 * `2 * o1 + bound(o1)` and `2 * o2 + bound(o2)`.
 */
export function cubeEdgeId(channel: number, bounds: readonly [number, number, number]): number {
  const [o1, o2] = [0, 1, 2].filter((c) => c !== channel) as [number, number];
  return 4 * channel + 2 * bounds[o1]! + bounds[o2]!;
}
function edgeGeometry(edge: number) {
  const channel = edge >> 2;
  const [o1, o2] = [0, 1, 2].filter((c) => c !== channel) as [number, number];
  const bounds: [number, number, number] = [0, 0, 0];
  bounds[o1] = (edge >> 1) & 1;
  bounds[o2] = edge & 1;
  const origin = [bounds[0], bounds[1], bounds[2]] as const;
  const direction = [0, 0, 0] as [number, number, number];
  direction[channel] = 1;
  const end = [...origin] as [number, number, number];
  end[channel] = 1;
  return {
    channel,
    origin,
    direction: direction as readonly [number, number, number],
    cornerLow: corner(origin[0], origin[1], origin[2]),
    cornerHigh: corner(end[0], end[1], end[2]),
    faces: [2 * o1 + bounds[o1]!, 2 * o2 + bounds[o2]!] as const,
  };
}
const EDGES = Array.from({ length: 12 }, (_, edge) => edgeGeometry(edge));

/** Face coordinates: channel `fixed` is held at `bound`; (p, q) are the other two channels. */
function faceGeometry(face: number) {
  const fixed = face >> 1;
  const bound = face & 1;
  const [p, q] = [0, 1, 2].filter((c) => c !== fixed) as [number, number];
  const edgesOf = EDGES.map((edge, id) => ({ edge, id })).filter(({ edge }) =>
    edge.faces.includes(face),
  );
  return { fixed, bound, p, q, edgeIds: edgesOf.map(({ id }) => id) };
}
const FACES = Array.from({ length: 6 }, (_, face) => faceGeometry(face));

interface ArcNode {
  readonly tau: number;
  readonly rgb: readonly [number, number, number];
  readonly a: number;
  readonly b: number;
}
interface Arc {
  readonly face: number;
  /** Edge ids of the first and last node. */
  readonly startEdge: number;
  readonly endEdge: number;
  nodes: ArcNode[];
  open: boolean[];
}

/** Distance from (px, py) to segment (ax, ay)-(bx, by). */
function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax,
    dy = by - ay;
  const length2 = dx * dx + dy * dy;
  const t = length2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function validate(options: LightnessSectionOptions): {
  tolerance: number;
  limits: SectionLimits;
} | null {
  if (typeof options !== "object" || options === null) return null;
  if (options.space !== "srgb" && options.space !== "display-p3") return null;
  if (typeof options.lightness !== "number" || !Number.isFinite(options.lightness)) return null;
  const tolerance = options.chordTolerance ?? DEFAULT_SECTION_CHORD_TOLERANCE;
  if (!(tolerance > 0 && tolerance <= 0.01) || !Number.isFinite(tolerance)) return null;
  const limits = { ...DEFAULT_SECTION_LIMITS, ...options.limits };
  for (const key of Object.keys(DEFAULT_SECTION_LIMITS) as (keyof SectionLimits)[])
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1) return null;
  if (limits.maxConversions > 4_000_000) return null;
  return { tolerance, limits };
}

/**
 * The constant-lightness section of one built-in RGB gamut. Deterministic: equal options give
 * bit-identical results. Never returns partial geometry on failure.
 */
export function generateLightnessSection(options: LightnessSectionOptions): LightnessSectionResult {
  const checked = validate(options);
  if (!checked)
    return {
      ok: false,
      error: "invalid-options",
      detail: "space, lightness or limits are invalid",
    };
  const { tolerance, limits } = checked;
  const { space, lightness: level } = options;
  const identity = {
    space,
    gamut: space === "srgb" ? ("srgb-gamut" as const) : ("display-p3-gamut" as const),
    lightness: level,
    generatorRevision: LIGHTNESS_SECTION_REVISION,
    definitionRevision: RGB_NUMERIC_REVISION,
  };
  const noWork: SectionWork = {
    conversions: 0,
    rootEvaluations: 0,
    refinementRounds: 0,
    arcs: 0,
    vertices: 0,
  };
  const simple = (kind: "point" | "empty"): LightnessSectionResult => ({
    ok: true,
    value: {
      ...identity,
      kind,
      loops: [],
      points: kind === "point" ? Float64Array.of(0, level, 0) : new Float64Array(0),
      bounds: null,
      quality: {
        chordTolerance: tolerance,
        maxObservedChordDeviation: 0,
        maxLightnessResidual: 0,
        work: noWork,
      },
    },
  });
  // Outside [0, 1] no color of the gamut exists; exactly 0 or 1 admits only the neutral point.
  if (level < 0 || level > 1) return simple("empty");
  if (level === 0 || level === 1) return simple("point");
  if (!(lightnessMonotonicityMargin(space) > 1))
    return {
      ok: false,
      error: "numerical-failure",
      detail: "lightness is not provably monotone for this gamut definition",
    };
  const evaluator = new Evaluator(space, limits.maxConversions);
  try {
    return { ok: true, value: build(evaluator, identity, level, tolerance, limits) };
  } catch (error) {
    if (error instanceof SectionFailure)
      return { ok: false, error: error.code, detail: error.message };
    throw error;
  }
}

function build(
  evaluator: Evaluator,
  identity: Pick<
    LightnessSection,
    "space" | "gamut" | "lightness" | "generatorRevision" | "definitionRevision"
  >,
  level: number,
  tolerance: number,
  limits: SectionLimits,
): LightnessSection {
  // Corner lightness; a corner counts as below the plane when L(corner) <= L0. The tie rule is a
  // symbolic perturbation of L0, applied consistently to every edge and face, so a plane through a
  // cube vertex still yields a closed, correctly connected boundary.
  const cornerPoints = new Float64Array(24);
  for (let r = 0; r < 2; r++)
    for (let g = 0; g < 2; g++)
      for (let b = 0; b < 2; b++) cornerPoints.set([r, g, b], 3 * corner(r, g, b));
  const cornerValues = evaluator.convert(cornerPoints);
  const below = Array.from({ length: 8 }, (_, k) => cornerValues[3 * k]! <= level);
  if (!below[corner(0, 0, 0)] || below[corner(1, 1, 1)])
    throw new SectionFailure(
      "numerical-failure",
      "black or white lie on the wrong side of the plane",
    );

  // Monotonicity guard on every edge, at seven interior samples each (the analytic margin is the
  // proof; this catches a conversion that disagrees with it).
  const guard = new Float64Array(12 * 7 * 3);
  EDGES.forEach((edge, id) => {
    for (let k = 1; k <= 7; k++) {
      const offset = 3 * (7 * id + k - 1);
      for (let c = 0; c < 3; c++)
        guard[offset + c] = edge.origin[c]! + (k / 8) * edge.direction[c]!;
    }
  });
  const guardValues = evaluator.convert(guard);
  EDGES.forEach((edge, id) => {
    let previous = cornerValues[3 * edge.cornerLow]!;
    for (let k = 1; k <= 7; k++) {
      const value = guardValues[3 * (7 * id + k - 1)]!;
      if (!(value > previous))
        throw new SectionFailure(
          "numerical-failure",
          `lightness is not increasing along edge ${id}`,
        );
      previous = value;
    }
    if (!(cornerValues[3 * edge.cornerHigh]! > previous))
      throw new SectionFailure("numerical-failure", `lightness is not increasing along edge ${id}`);
  });

  // Edge crossings.
  const flagged = EDGES.map((edge, id) => ({ edge, id })).filter(
    ({ edge }) => below[edge.cornerLow] !== below[edge.cornerHigh],
  );
  const edgeRoots = solveLines(
    evaluator,
    level,
    flagged.map(({ edge }) => ({
      origin: edge.origin,
      direction: edge.direction,
      length: 1,
    })),
    limits.maxSolverIterations,
  );
  const rootOf = new Map<number, Root>();
  flagged.forEach(({ id }, k) => rootOf.set(id, edgeRoots[k]!));

  // One arc per face holding two crossings. Face coordinates: u = channel p, v = channel q.
  const arcs: Arc[] = [];
  const faceCoordinates = (face: ReturnType<typeof faceGeometry>, rgb: readonly number[]) =>
    [rgb[face.p]!, rgb[face.q]!] as const;
  FACES.forEach((face, faceId) => {
    const ids = face.edgeIds.filter((id) => rootOf.has(id));
    if (ids.length === 0) return;
    if (ids.length !== 2)
      throw new SectionFailure(
        "topology-inconsistent",
        `face ${faceId} has ${ids.length} edge crossings; expected 0 or 2`,
      );
    const nodes = ids.map((id) => {
      const root = rootOf.get(id)!;
      const [u, v] = faceCoordinates(face, root.rgb);
      return { id, node: { tau: u - v, rgb: root.rgb, a: root.a, b: root.b } as ArcNode };
    });
    arcs.push({
      face: faceId,
      startEdge: nodes[0]!.id,
      endEdge: nodes[1]!.id,
      nodes: [nodes[0]!.node, nodes[1]!.node],
      // Two crossings at the same tau are the same point: nothing to sample or refine.
      open: [nodes[0]!.node.tau !== nodes[1]!.node.tau],
    });
  });

  // Chord of constant tau inside a face: points (u, v) = (max(tau, 0) + s, max(-tau, 0) + s).
  const chord = (arc: Arc, tau: number): Line => {
    const face = FACES[arc.face]!;
    const u0 = Math.max(tau, 0),
      v0 = Math.max(-tau, 0);
    const origin = [0, 0, 0] as [number, number, number];
    origin[face.fixed] = face.bound;
    origin[face.p] = u0;
    origin[face.q] = v0;
    const direction = [0, 0, 0] as [number, number, number];
    direction[face.p] = 1;
    direction[face.q] = 1;
    return { origin, direction, length: 1 - Math.abs(tau) };
  };
  const solveChords = (queries: { arc: Arc; tau: number }[]): ArcNode[] =>
    solveLines(
      evaluator,
      level,
      queries.map(({ arc, tau }) => chord(arc, tau)),
      limits.maxSolverIterations,
    ).map((root, k) => ({ tau: queries[k]!.tau, rgb: root.rgb, a: root.a, b: root.b }));

  // Initial interior samples, uniform in tau between the two crossings.
  const initial: { arc: Arc; tau: number }[] = [];
  for (const arc of arcs) {
    const first = arc.nodes[0]!.tau,
      last = arc.nodes[1]!.tau;
    if (first === last) continue;
    for (let k = 1; k <= limits.initialSamplesPerArc; k++)
      initial.push({ arc, tau: first + ((last - first) * k) / (limits.initialSamplesPerArc + 1) });
  }
  if (initial.length > 0) {
    const solved = solveChords(initial);
    const byArc = new Map<Arc, ArcNode[]>();
    initial.forEach(({ arc }, k) => byArc.set(arc, [...(byArc.get(arc) ?? []), solved[k]!]));
    for (const [arc, interior] of byArc) {
      arc.nodes = [arc.nodes[0]!, ...interior, arc.nodes[1]!];
      arc.open = arc.nodes.slice(1).map(() => true);
    }
  }

  // Midpoint refinement. An interval closes when its chord midpoint is within tolerance of its
  // segment; otherwise the midpoint becomes a vertex and both halves reopen.
  let observed = 0;
  let rounds = 0;
  const vertexCount = () => arcs.reduce((sum, arc) => sum + arc.nodes.length, 0);
  for (;;) {
    const queries: { arc: Arc; index: number; tau: number }[] = [];
    for (const arc of arcs)
      arc.open.forEach((isOpen, index) => {
        if (!isOpen) return;
        const low = arc.nodes[index]!,
          high = arc.nodes[index + 1]!;
        queries.push({ arc, index, tau: 0.5 * (low.tau + high.tau) });
      });
    if (queries.length === 0) break;
    if (rounds >= limits.maxRefinementRounds)
      throw new SectionFailure(
        "resource-budget",
        `refinement exceeded ${limits.maxRefinementRounds} rounds`,
      );
    rounds++;
    const nodes = solveChords(queries);
    const splits = new Map<Arc, Map<number, ArcNode>>();
    queries.forEach(({ arc, index }, k) => {
      const mid = nodes[k]!;
      const low = arc.nodes[index]!,
        high = arc.nodes[index + 1]!;
      const deviation = distanceToSegment(mid.a, mid.b, low.a, low.b, high.a, high.b);
      if (deviation <= tolerance) {
        observed = Math.max(observed, deviation);
        arc.open[index] = false;
        return;
      }
      let perArc = splits.get(arc);
      if (!perArc) splits.set(arc, (perArc = new Map()));
      perArc.set(index, mid);
    });
    for (const [arc, perArc] of splits) {
      const nextNodes: ArcNode[] = [];
      const nextOpen: boolean[] = [];
      arc.nodes.forEach((node, index) => {
        nextNodes.push(node);
        if (index === arc.nodes.length - 1) return;
        const mid = perArc.get(index);
        if (mid) {
          nextNodes.push(mid);
          nextOpen.push(true, true);
        } else nextOpen.push(arc.open[index]!);
      });
      arc.nodes = nextNodes;
      arc.open = nextOpen;
    }
    if (vertexCount() > limits.maxVertices)
      throw new SectionFailure("resource-budget", `more than ${limits.maxVertices} vertices`);
  }

  const loops = assembleSectionLoops(arcs, level);
  const total = loops.reduce((sum, loop) => sum + loop.edges.length, 0);
  if (total > limits.maxVertices)
    throw new SectionFailure("resource-budget", `more than ${limits.maxVertices} vertices`);
  let minA = Infinity,
    minB = Infinity,
    maxA = -Infinity,
    maxB = -Infinity;
  for (const loop of loops)
    for (let k = 0; k < loop.edges.length; k++) {
      minA = Math.min(minA, loop.positions[3 * k]!);
      maxA = Math.max(maxA, loop.positions[3 * k]!);
      minB = Math.min(minB, loop.positions[3 * k + 2]!);
      maxB = Math.max(maxB, loop.positions[3 * k + 2]!);
    }
  return {
    ...identity,
    kind: loops.length > 0 ? "region" : "empty",
    loops,
    points: new Float64Array(0),
    bounds: loops.length > 0 ? { min: [minA, minB], max: [maxA, maxB] } : null,
    quality: {
      chordTolerance: tolerance,
      maxObservedChordDeviation: observed,
      maxLightnessResidual: evaluator.maxResidual,
      work: {
        conversions: evaluator.conversions,
        rootEvaluations: evaluator.iterations,
        refinementRounds: rounds,
        arcs: arcs.length,
        vertices: total,
      },
    },
  };
}

/** One arc of the boundary inside a single cube face, between two cube-edge crossings. */
export interface SectionArc {
  /** Face binding `2 * channel + bound`. */
  readonly face: number;
  /** Cube-edge ids of the first and last node. */
  readonly startEdge: number;
  readonly endEdge: number;
  readonly nodes: readonly Readonly<{
    rgb: readonly [number, number, number];
    a: number;
    b: number;
  }>[];
}

/**
 * Join arcs into closed loops by cube-edge identity: an arc continues into the other arc that ends at
 * the same cube edge, never into the geometrically nearest one. Every edge crossing must be shared by
 * exactly two arcs. Any number of loops is representable; each is oriented counterclockwise in (a, b).
 * Throws `topology-inconsistent` aborts for a crossing that is not shared by two arcs, for a loop that
 * does not close, and for arcs left over.
 */
export function assembleSectionLoops(arcs: readonly SectionArc[], level: number): SectionLoop[] {
  // Loops are found by following edge identity.

  const incident = new Map<number, number[]>();
  arcs.forEach((arc, index) => {
    for (const edge of [arc.startEdge, arc.endEdge])
      incident.set(edge, [...(incident.get(edge) ?? []), index]);
  });
  for (const [edge, list] of incident)
    if (list.length !== 2)
      throw new SectionFailure(
        "topology-inconsistent",
        `edge ${edge} joins ${list.length} arcs, expected 2`,
      );
  const used = new Set<number>();
  const loops: SectionLoop[] = [];
  for (let first = 0; first < arcs.length; first++) {
    if (used.has(first)) continue;
    const chain: { arc: SectionArc; reversed: boolean }[] = [];
    let index: number = first;
    let reversed = false;
    for (;;) {
      used.add(index);
      const arc: SectionArc = arcs[index]!;
      chain.push({ arc, reversed });
      const exit: number = reversed ? arc.startEdge : arc.endEdge;
      const next: number | undefined = incident.get(exit)!.find((candidate) => candidate !== index);
      if (next === undefined)
        throw new SectionFailure("topology-inconsistent", `edge ${exit} has no continuing arc`);
      if (next === first) {
        const closing = arcs[first]!;
        if (exit !== closing.startEdge)
          throw new SectionFailure("topology-inconsistent", "loop does not close at its start");
        break;
      }
      if (used.has(next)) throw new SectionFailure("topology-inconsistent", "arcs visited twice");
      const nextArc: SectionArc = arcs[next]!;
      reversed = nextArc.startEdge !== exit;
      index = next;
    }
    // Vertex lists: each arc contributes all but its last node (the next arc starts there).
    const vertices: { node: SectionArc["nodes"][number]; edge: number; face: number }[] = [];
    for (const { arc, reversed: backwards } of chain) {
      const ordered = backwards ? arc.nodes.toReversed() : arc.nodes;
      ordered.slice(0, -1).forEach((node, k) =>
        vertices.push({
          node,
          edge: k === 0 ? (backwards ? arc.endEdge : arc.startEdge) : -1,
          face: arc.face,
        }),
      );
    }
    let area = 0;
    vertices.forEach(({ node }, k) => {
      const next = vertices[(k + 1) % vertices.length]!.node;
      area += node.a * next.b - next.a * node.b;
    });
    area *= 0.5;
    // Counterclockwise in (a, b); each segment keeps the face that contains it.
    const ordered = area >= 0 ? vertices : vertices.toReversed();
    const count = ordered.length;
    const faces = new Uint8Array(count);
    // Reversing the order maps new vertex k to old vertex n - 1 - k, so its outgoing segment is the
    // old outgoing segment of vertex n - 2 - k.
    for (let k = 0; k < count; k++)
      faces[k] = area >= 0 ? vertices[k]!.face : vertices[(2 * count - 2 - k) % count]!.face;
    const positions = new Float64Array(3 * count);
    const rgb = new Float64Array(3 * count);
    const edges = new Int8Array(count);
    ordered.forEach(({ node, edge }, k) => {
      positions[3 * k] = node.a;
      positions[3 * k + 1] = level;
      positions[3 * k + 2] = node.b;
      rgb.set(node.rgb, 3 * k);
      edges[k] = edge;
    });
    loops.push({
      positions,
      linearRgb: rgb,
      edges,
      segmentFaces: faces,
      signedArea: Math.abs(area),
    });
  }
  if (used.size !== arcs.length)
    throw new SectionFailure("topology-inconsistent", "some arcs belong to no loop");
  return loops;
}
