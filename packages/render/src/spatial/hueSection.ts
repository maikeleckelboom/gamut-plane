import {
  spatialColorDefinition,
  linearRgbToOklabBatch,
  RGB_NUMERIC_REVISION,
  type RgbRepresentationId,
} from "@gamut-plane/core/internal/capabilities";
import { lightnessMonotonicityMargin } from "./lightnessSection.js";
import {
  evaluate,
  HueFailure,
  isolateRoots,
  type HueFailureCode,
  type PolynomialWork,
} from "./huePolynomial.js";

export const HUE_SECTION_REVISION = "hue-section-projective-v2";
export interface HueSectionLimits {
  readonly maxEvaluations: number;
  readonly maxVertices: number;
  readonly maxDepth: number;
  readonly maxRootIterations: number;
}
export const DEFAULT_HUE_SECTION_LIMITS: HueSectionLimits = Object.freeze({
  maxEvaluations: 100_000,
  maxVertices: 8192,
  maxDepth: 20,
  maxRootIterations: 80,
});
export interface HueSectionOptions {
  readonly space: RgbRepresentationId;
  /** Explicit viewing direction in degrees. Finite, normalized modulo 360, never inferred. */
  readonly hue: number;
  readonly chordTolerance?: number;
  readonly limits?: Partial<HueSectionLimits>;
}
export interface HueSectionVertex {
  readonly lightness: number;
  readonly chroma: number;
  /** Projective direction C/(L+C); null only at black. */
  readonly direction: number | null;
  /** Bit mask of binding faces, bit (2*channel+bound). Numeric residual tolerance 2e-11. */
  readonly bindings: number;
}
export interface HueSectionArc {
  readonly kind: "gamut-surface" | "domain-neutral";
  /** Binding face mask of the arc interior. Zero for the neutral domain boundary. */
  readonly bindings: number;
  /** Analytic lower cone generators and the neutral axis are straight. */
  readonly geometry: "line" | "sampled-curve";
  /** Global vertex IDs, in traversal order. Adjacent arcs share an ID, not welded coordinates. */
  readonly vertices: readonly number[];
}
export interface HueSection {
  readonly kind: "region";
  readonly space: RgbRepresentationId;
  readonly requestedHue: number;
  readonly hue: number;
  readonly coordinateSystem: "oklab-world-a-L-b";
  readonly generatorRevision: string;
  readonly definitionRevision: string;
  readonly vertices: readonly HueSectionVertex[];
  readonly positions: Float64Array;
  readonly linearRgb: Float64Array;
  readonly arcs: readonly HueSectionArc[];
  /** Each loop starts at shared black vertex 0; separate sectors may meet only at black. */
  readonly loops: readonly (readonly number[])[];
  /** Isolated admissible directions: true cube-edge rays attached to black, outside region loops. */
  readonly contacts: readonly number[];
  readonly events: readonly Readonly<{
    vertex: number;
    kind: "constraint-transition" | "lightness-stationary" | "chroma-stationary";
  }>[];
  /** Sampled vertex bounds in [L,C], including stationary extrema. */
  readonly bounds: Readonly<{ min: readonly [number, number]; max: readonly [number, number] }>;
  readonly quality: Readonly<{
    status: "sampled";
    chordTolerance: number;
    maxObservedChordDeviation: number;
    maxConstraintResidual: number;
    work: Readonly<
      PolynomialWork & {
        conversions: number;
        vertices: number;
        segments: number;
        maxDepth: number;
        retainedBufferBytes: number;
        peakPointRecords: number;
      }
    >;
  }>;
}
export type HueSectionResult =
  | Readonly<{ ok: true; value: HueSection }>
  | Readonly<{ ok: false; error: HueFailureCode; detail: string }>;

interface Point {
  u: number;
  l: number;
  c: number;
  rgb: number[];
  bindings: number;
}
interface Event {
  u: number;
  lower: number;
  upper: boolean;
  stationary: "lightness-stationary" | "chroma-stationary" | null;
  owners?: readonly number[];
  sourceEdge?: number;
}

/** Actual half-plane intersection via homogeneous inverse RGB. See phase-3c2a-hue-half-plane.md.
 * No fixed-lightness envelope, rendered mesh, GPU allocation, or authored-color input. */
export function generateHueSection(options: HueSectionOptions): HueSectionResult {
  try {
    if (
      !options ||
      typeof options !== "object" ||
      !Number.isFinite(options.hue) ||
      !["srgb", "display-p3"].includes(options.space)
    )
      throw new HueFailure("invalid-options", "finite explicit hue and built-in space required");
    const tolerance = options.chordTolerance ?? 1e-5;
    const limits = { ...DEFAULT_HUE_SECTION_LIMITS, ...options.limits };
    if (
      !(tolerance > 0 && tolerance <= 1e-3) ||
      !Number.isFinite(tolerance) ||
      !Object.values(limits).every((v) => Number.isSafeInteger(v) && v > 0)
    )
      throw new HueFailure("invalid-options", "invalid tolerance or work limits");
    for (const key of Object.keys(limits) as (keyof typeof limits)[])
      if (limits[key] > DEFAULT_HUE_SECTION_LIMITS[key])
        throw new HueFailure("invalid-options", "limits may only reduce hard ceilings");
    if (!(lightnessMonotonicityMargin(options.space) > 1))
      throw new HueFailure("numerical-failure", "positive lightness not established");
    // Preserve already normalized doubles exactly. Adding 360 unconditionally can round
    // a canonical source-edge hue on a second normalization and lose its source identity.
    const normalize = (value: number) => {
      const remainder = value % 360;
      return remainder < 0 ? remainder + 360 : remainder === 0 ? 0 : remainder;
    };
    const hue = normalize(options.hue);
    const angle = (hue * Math.PI) / 180,
      cosine = Math.cos(angle),
      sine = Math.sin(angle);
    const definition = spatialColorDefinition(options.space);
    // D(u)=(1-u,u*cos(h),u*sin(h)); inverse(D) is a cubic on a compact domain.
    const cones = definition.oklabToLmsPrime.map((row) => [
      row[0]!,
      row[1]! * cosine + row[2]! * sine - row[0]!,
    ]);
    const polynomials = definition.lmsToLinearRgb.map((row) =>
      [0, 1, 2, 3].map((power) =>
        row.reduce(
          (sum, weight, k) =>
            sum +
            weight * [1, 3, 3, 1][power]! * cones[k]![0]! ** (3 - power) * cones[k]![1]! ** power,
          0,
        ),
      ),
    );
    const work = {
      polynomialEvaluations: 0,
      rootIterations: 0,
      conversions: 0,
      vertices: 0,
      segments: 0,
      maxDepth: 0,
      retainedBufferBytes: 0,
      peakPointRecords: 0,
    };
    const roots = (p: readonly number[]) =>
      isolateRoots(p, work, limits.maxEvaluations, limits.maxRootIterations);
    const qAt = (u: number) => {
      work.polynomialEvaluations += 3;
      if (work.polynomialEvaluations > limits.maxEvaluations)
        throw new HueFailure("resource-budget", "polynomial evaluation budget");
      work.conversions++;
      return polynomials.map((p) => evaluate(p, u));
    };
    const events: Event[] = [
      { u: 0, lower: 0, upper: false, stationary: null },
      { u: 1, lower: 0, upper: false, stationary: null },
    ];
    polynomials.forEach((p, k) => {
      for (const u of roots(p))
        events.push({ u, lower: 1 << (2 * k), upper: false, stationary: null });
    });
    // Exact source identity at canonical primary hues, NOT angular proximity snapping. Two
    // lower faces share the RGB black-to-primary edge. The same converted primary determines
    // its hue, projective direction and common endpoint; independent roots only verify it.
    const primaries = linearRgbToOklabBatch(
      new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
      options.space,
    );
    work.conversions += 3;
    if (!primaries.ok) throw new HueFailure("numerical-failure", "primary conversion failed");
    for (let channel = 0; channel < 3; channel++) {
      const l = primaries.value[3 * channel]!,
        a = primaries.value[3 * channel + 1]!,
        b = primaries.value[3 * channel + 2]!;
      if (hue !== normalize((Math.atan2(b, a) * 180) / Math.PI)) continue;
      const c = Math.hypot(a, b),
        u = c / (l + c),
        mask = 21 & ~(1 << (2 * channel));
      const matches = events.filter(
        (event) => (event.lower & mask) !== 0 && Math.abs(event.u - u) < 1e-12,
      );
      if (
        matches.length !== 2 ||
        (matches[0]!.lower | matches[1]!.lower) !== mask ||
        qAt(u).some((v, k) => k !== channel && Math.abs(v) > 2e-13)
      )
        throw new HueFailure("numerical-failure", "canonical source edge not verified");
      for (const match of matches) events.splice(events.indexOf(match), 1);
      events.push({ u, lower: mask, upper: false, stationary: null, sourceEdge: channel });
    }
    // An unresolved ordering of lower roots can change sector topology. Never weld it.
    events.sort((a, b) => a.u - b.u);
    for (let i = 1; i < events.length; i++)
      if (events[i]!.u - events[i - 1]!.u < 1e-12)
        throw new HueFailure("numerical-failure", "unresolved coincident lower constraints");
    const sectors: [Event, Event][] = [];
    for (let i = 0; i + 1 < events.length; i++) {
      const a = events[i]!,
        b = events[i + 1]!;
      if (qAt((a.u + b.u) / 2).every((q) => q >= 0)) sectors.push([a, b]);
    }
    if (sectors.length === 0 || sectors[0]![0].u !== 0 || sectors.at(-1)![1].u === 1)
      throw new HueFailure("numerical-failure", "unsupported directional topology");
    const upperEvents: Event[] = [];
    for (let a = 0; a < 3; a++)
      for (let b = a + 1; b < 3; b++) {
        const difference = polynomials[a]!.map((v, i) => v - polynomials[b]![i]!);
        for (const u of roots(difference))
          upperEvents.push({ u, lower: 0, upper: true, stationary: null, owners: [a, b] });
      }
    // Exact extrema of L=(1-u)/cbrt(q) and C=u/cbrt(q) on each owning face.
    polynomials.forEach((p, owner) => {
      const [a, b, c, d] = p as [number, number, number, number];
      for (const u of roots([3 * a + b, 2 * b + 2 * c, c + 3 * d]))
        upperEvents.push({
          u,
          lower: 0,
          upper: false,
          stationary: "lightness-stationary",
          owners: [owner],
        });
      for (const u of roots([3 * a, 2 * b, c]))
        upperEvents.push({
          u,
          lower: 0,
          upper: false,
          stationary: "chroma-stationary",
          owners: [owner],
        });
    });
    let maxResidual = 0,
      maxDeviation = 0;
    const at = (u: number): Point => {
      const q = qAt(u),
        maximum = Math.max(...q);
      if (!(maximum > 0) || !Number.isFinite(maximum))
        throw new HueFailure("numerical-failure", "invalid radial cap");
      const scale = 1 / Math.cbrt(maximum);
      const rgb = q.map((v) => v / maximum);
      let bindings = 0;
      rgb.forEach((v, channel) => {
        if (v < -2e-11 || v > 1 + 2e-11)
          throw new HueFailure("numerical-failure", "radial point outside cube");
        for (let bound = 0; bound <= 1; bound++)
          if (Math.abs(v - bound) <= 2e-11) {
            bindings |= 1 << (2 * channel + bound);
            maxResidual = Math.max(maxResidual, Math.abs(v - bound));
          }
      });
      return { u, l: (1 - u) * scale, c: u * scale, rgb, bindings };
    };
    const vertices: HueSectionVertex[] = [
      { lightness: 0, chroma: 0, direction: null, bindings: 21 },
    ];
    const positions: number[] = [0, 0, 0],
      rgb: number[] = [0, 0, 0];
    const add = (p: Point) => {
      if (vertices.length >= limits.maxVertices)
        throw new HueFailure("resource-budget", "vertex budget");
      const id = vertices.length;
      vertices.push({ lightness: p.l, chroma: p.c, direction: p.u, bindings: p.bindings });
      positions.push(p.c * cosine, p.l, p.c * sine);
      rgb.push(...p.rgb);
      return id;
    };
    const arcs: HueSectionArc[] = [],
      loops: number[][] = [],
      contacts: number[] = [];
    const resultEvents: {
      vertex: number;
      kind: "constraint-transition" | "lightness-stationary" | "chroma-stationary";
    }[] = [];
    const distance = (p: Point, a: Point, b: Point) => {
      const dl = b.l - a.l,
        dc = b.c - a.c;
      const t = Math.max(
        0,
        Math.min(1, ((p.l - a.l) * dl + (p.c - a.c) * dc) / (dl * dl + dc * dc || 1)),
      );
      return Math.hypot(p.l - a.l - t * dl, p.c - a.c - t * dc);
    };
    for (const [start, end] of sectors) {
      const cuts = [
        start,
        ...upperEvents.filter((event) => {
          if (!(event.u > start.u && event.u < end.u)) return false;
          const q = qAt(event.u),
            maximum = Math.max(...q);
          return event.owners!.every((owner) => maximum - q[owner]! <= 2e-13);
        }),
        end,
      ].sort((a, b) => a.u - b.u);
      // Exact equal parameters share mathematical identity; no proximity welding.
      const uniqueCuts = cuts.filter((event, i) => i === 0 || event.u !== cuts[i - 1]!.u);
      const first = at(start.u),
        firstId = add(first);
      const loop = [arcs.length];
      arcs.push({
        kind: start.u === 0 ? "domain-neutral" : "gamut-surface",
        bindings: start.lower,
        geometry: "line",
        vertices: [0, firstId],
      });
      resultEvents.push({ vertex: firstId, kind: "constraint-transition" });
      let previous = first,
        previousId = firstId;
      for (let i = 1; i < uniqueCuts.length; i++) {
        const event = uniqueCuts[i]!,
          endpoint = at(event.u);
        const middleRgb = qAt((previous.u + endpoint.u) / 2);
        const owner = middleRgb.indexOf(Math.max(...middleRgb));
        const ids = [previousId];
        const refine = (a: Point, b: Point, depth: number) => {
          work.maxDepth = Math.max(work.maxDepth, depth);
          work.peakPointRecords = Math.max(work.peakPointRecords, 5 + depth * 3);
          const probes = [0.25, 0.5, 0.75].map((t) => at(a.u + (b.u - a.u) * t));
          const error = Math.max(...probes.map((p) => distance(p, a, b)));
          if (error > tolerance) {
            if (depth >= limits.maxDepth)
              throw new HueFailure("resource-budget", "refinement depth budget");
            refine(a, probes[1]!, depth + 1);
            refine(probes[1]!, b, depth + 1);
          } else {
            maxDeviation = Math.max(maxDeviation, error);
            ids.push(add(b));
          }
        };
        refine(previous, endpoint, 0);
        loop.push(arcs.length);
        arcs.push({
          kind: "gamut-surface",
          bindings: 1 << (2 * owner + 1),
          geometry: "sampled-curve",
          vertices: ids,
        });
        previous = endpoint;
        previousId = ids.at(-1)!;
        for (const coincident of cuts.filter((cut) => cut.u === event.u)) {
          if (coincident.upper || coincident.lower)
            resultEvents.push({ vertex: previousId, kind: "constraint-transition" });
          if (coincident.stationary)
            resultEvents.push({ vertex: previousId, kind: coincident.stationary });
        }
      }
      loop.push(arcs.length);
      arcs.push({
        kind: "gamut-surface",
        bindings: end.lower,
        geometry: "line",
        vertices: [previousId, 0],
      });
      loops.push(loop);
    }
    for (const event of events) {
      if (event.sourceEdge === undefined || sectors.some(([a, b]) => event === a || event === b))
        continue;
      const point = at(event.u),
        id = add(point);
      contacts.push(arcs.length);
      arcs.push({
        kind: "gamut-surface",
        bindings: event.lower,
        geometry: "line",
        vertices: [0, id],
      });
      resultEvents.push({ vertex: id, kind: "constraint-transition" });
    }
    work.vertices = vertices.length;
    work.segments = arcs.reduce((sum, arc) => sum + arc.vertices.length - 1, 0);
    const positionBuffer = Float64Array.from(positions),
      rgbBuffer = Float64Array.from(rgb);
    work.retainedBufferBytes = positionBuffer.byteLength + rgbBuffer.byteLength;
    return {
      ok: true,
      value: {
        kind: "region",
        space: options.space,
        requestedHue: options.hue,
        hue,
        coordinateSystem: "oklab-world-a-L-b",
        generatorRevision: HUE_SECTION_REVISION,
        definitionRevision: RGB_NUMERIC_REVISION,
        vertices,
        positions: positionBuffer,
        linearRgb: rgbBuffer,
        arcs,
        loops,
        contacts,
        events: resultEvents,
        bounds: {
          min: [0, 0],
          max: [
            Math.max(...vertices.map((p) => p.lightness)),
            Math.max(...vertices.map((p) => p.chroma)),
          ],
        },
        quality: {
          status: "sampled",
          chordTolerance: tolerance,
          maxObservedChordDeviation: maxDeviation,
          maxConstraintResidual: maxResidual,
          work,
        },
      },
    };
  } catch (error) {
    if (error instanceof HueFailure) return { ok: false, error: error.code, detail: error.message };
    throw error;
  }
}
