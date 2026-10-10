// Experiment-only, candidate-independent surface error metrics. Sampled, not continuous bounds.
import {
  cross,
  decodeEncoded,
  dot,
  faceRgb,
  faceSurface,
  FACE_FREE_AXES,
  halton,
  norm,
  scene,
  sub,
  unit,
  type Space,
  type Vec3,
} from "./oracle.ts";
import type { CandidateMesh } from "./candidates.ts";

export interface Stats {
  count: number;
  max: number;
  rms: number;
  p50: number;
  p99: number;
  p999: number;
}
export function statsOf(values: ArrayLike<number>): Stats {
  const sorted = Float64Array.from(values as ArrayLike<number>).sort();
  const n = sorted.length;
  if (!n) return { count: 0, max: 0, rms: 0, p50: 0, p99: 0, p999: 0 };
  let sum = 0;
  for (const v of sorted) sum += v * v;
  const at = (q: number) => sorted[Math.min(n - 1, Math.floor(q * n))]!;
  return {
    count: n,
    max: sorted[n - 1]!,
    rms: Math.sqrt(sum / n),
    p50: at(0.5),
    p99: at(0.99),
    p999: at(0.999),
  };
}

/** Squared distance from p to triangle abc (Ericson, closest point on triangle), scalar and allocation-free. */
function distance2(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): number {
  const abx = bx - ax,
    aby = by - ay,
    abz = bz - az;
  const acx = cx - ax,
    acy = cy - ay,
    acz = cz - az;
  const apx = px - ax,
    apy = py - ay,
    apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  let qx: number, qy: number, qz: number;
  const done = (x: number, y: number, z: number) => (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2;
  if (d1 <= 0 && d2 <= 0) return done(ax, ay, az);
  const bpx = px - bx,
    bpy = py - by,
    bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return done(bx, by, bz);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return done(ax + v * abx, ay + v * aby, az + v * abz);
  }
  const cpx = px - cx,
    cpy = py - cy,
    cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return done(cx, cy, cz);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return done(ax + w * acx, ay + w * acy, az + w * acz);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return done(bx + w * (cx - bx), by + w * (cy - by), bz + w * (cz - bz));
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom,
    w = vc * denom;
  qx = ax + abx * v + acx * w;
  qy = ay + aby * v + acy * w;
  qz = az + abz * v + acz * w;
  return done(qx, qy, qz);
}

/** Brute-force reference for tests: distance from p to the closed triangle abc. */
export function distanceToTriangleScalarForTest(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  return Math.sqrt(
    distance2(p[0], p[1], p[2], a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]),
  );
}

/** Uniform-grid nearest-triangle accelerator over the whole mesh (not a corresponding-triangle bound). */
export class TriangleGrid {
  private readonly positions: Float64Array;
  private readonly triangles: Uint32Array;
  private readonly cell: number;
  private readonly origin: Vec3;
  private readonly dims: Vec3;
  private readonly start: Int32Array;
  private readonly items: Int32Array;
  private readonly stamp: Int32Array;
  private query = 0;
  constructor(positions: Float64Array, triangles: Uint32Array, cell = 0.04) {
    this.positions = positions;
    this.triangles = triangles;
    this.cell = cell;
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, positions[i + k]!);
        max[k] = Math.max(max[k]!, positions[i + k]!);
      }
    this.origin = min.map((v) => v - 1e-9) as Vec3;
    this.dims = [0, 1, 2].map((k) => Math.floor((max[k]! - this.origin[k]!) / cell) + 1) as Vec3;
    const cells = this.dims[0] * this.dims[1] * this.dims[2];
    const count = triangles.length / 3;
    const ranges = new Int32Array(count * 6);
    const counts = new Int32Array(cells + 1);
    for (let t = 0; t < count; t++) {
      const lo = [Infinity, Infinity, Infinity],
        hi = [-Infinity, -Infinity, -Infinity];
      for (let c = 0; c < 3; c++) {
        const v = triangles[3 * t + c]!;
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k]!, positions[3 * v + k]!);
          hi[k] = Math.max(hi[k]!, positions[3 * v + k]!);
        }
      }
      for (let k = 0; k < 3; k++) {
        ranges[6 * t + k] = Math.floor((lo[k]! - this.origin[k]!) / cell);
        ranges[6 * t + 3 + k] = Math.floor((hi[k]! - this.origin[k]!) / cell);
      }
      for (let z = ranges[6 * t + 2]!; z <= ranges[6 * t + 5]!; z++)
        for (let y = ranges[6 * t + 1]!; y <= ranges[6 * t + 4]!; y++)
          for (let x = ranges[6 * t]!; x <= ranges[6 * t + 3]!; x++)
            counts[(z * this.dims[1] + y) * this.dims[0] + x + 1]!++;
    }
    for (let i = 0; i < cells; i++) counts[i + 1]! += counts[i]!;
    this.start = counts;
    this.items = new Int32Array(counts[cells]!);
    const fill = new Int32Array(cells);
    for (let t = 0; t < count; t++)
      for (let z = ranges[6 * t + 2]!; z <= ranges[6 * t + 5]!; z++)
        for (let y = ranges[6 * t + 1]!; y <= ranges[6 * t + 4]!; y++)
          for (let x = ranges[6 * t]!; x <= ranges[6 * t + 3]!; x++) {
            const cell2 = (z * this.dims[1] + y) * this.dims[0] + x;
            this.items[this.start[cell2]! + fill[cell2]!++] = t;
          }
    this.stamp = new Int32Array(count);
  }

  /** Exact distance from p to the nearest triangle of the whole mesh. */
  nearest(p: Vec3): number {
    const { dims, origin, cell, positions, triangles } = this;
    this.query++;
    const cx = Math.min(dims[0] - 1, Math.max(0, Math.floor((p[0] - origin[0]) / cell)));
    const cy = Math.min(dims[1] - 1, Math.max(0, Math.floor((p[1] - origin[1]) / cell)));
    const cz = Math.min(dims[2] - 1, Math.max(0, Math.floor((p[2] - origin[2]) / cell)));
    let best = Infinity;
    const limit = Math.max(dims[0], dims[1], dims[2]);
    for (let r = 0; r <= limit; r++) {
      // Visit only the Chebyshev shell at radius r.
      for (let z = cz - r; z <= cz + r; z++) {
        if (z < 0 || z >= dims[2]) continue;
        for (let y = cy - r; y <= cy + r; y++) {
          if (y < 0 || y >= dims[1]) continue;
          const fullRow = Math.abs(z - cz) === r || Math.abs(y - cy) === r;
          for (let x = cx - r; x <= cx + r; x += fullRow || r === 0 ? 1 : 2 * r) {
            if (x < 0 || x >= dims[0]) continue;
            const index = (z * dims[1] + y) * dims[0] + x;
            for (let k = this.start[index]!; k < this.start[index + 1]!; k++) {
              const t = this.items[k]!;
              if (this.stamp[t] === this.query) continue;
              this.stamp[t] = this.query;
              const a = triangles[3 * t]! * 3,
                b = triangles[3 * t + 1]! * 3,
                c = triangles[3 * t + 2]! * 3;
              const d = distance2(
                p[0],
                p[1],
                p[2],
                positions[a]!,
                positions[a + 1]!,
                positions[a + 2]!,
                positions[b]!,
                positions[b + 1]!,
                positions[b + 2]!,
                positions[c]!,
                positions[c + 1]!,
                positions[c + 2]!,
              );
              if (d < best) best = d;
            }
          }
        }
      }
      // Any unvisited triangle lies at least r cells away from the query cell.
      if (Math.sqrt(best) <= r * cell) break;
    }
    return Math.sqrt(best);
  }
}

export interface ProbeSet {
  name: string;
  scene: Float64Array;
  face: Uint8Array;
}
const NEAR_BLACK_VALUES = [0, 1e-12, 1e-9, 1e-6, 1e-4, 0.001, 0.01, 0.1, 0.25, 0.5, 0.9, 1];
const CUBE_EDGES: readonly (readonly [Vec3, Vec3])[] = [
  [
    [0, 0, 0],
    [1, 0, 0],
  ],
  [
    [0, 0, 0],
    [0, 1, 0],
  ],
  [
    [0, 0, 0],
    [0, 0, 1],
  ],
  [
    [1, 0, 0],
    [1, 1, 0],
  ],
  [
    [1, 0, 0],
    [1, 0, 1],
  ],
  [
    [0, 1, 0],
    [1, 1, 0],
  ],
  [
    [0, 1, 0],
    [0, 1, 1],
  ],
  [
    [0, 0, 1],
    [0, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 0, 1],
  ],
  [
    [1, 1, 0],
    [1, 1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 1],
  ],
  [
    [1, 0, 1],
    [1, 1, 1],
  ],
];

/**
 * Candidate-independent held-out points ON THE TRUE SURFACE, in four strata. Every candidate is
 * measured against exactly these points. None is used to choose any candidate's knots or splits.
 */
export function heldOutProbes(space: Space, perFace = 4096): ProbeSet[] {
  const make = (name: string, rgbs: Vec3[], faces: number[]): ProbeSet => {
    const out = new Float64Array(rgbs.length * 3);
    rgbs.forEach((q, i) => out.set(scene(q, space), 3 * i));
    return { name, scene: out, face: Uint8Array.from(faces) };
  };
  const lin: Vec3[] = [],
    enc: Vec3[] = [],
    black: Vec3[] = [],
    edges: Vec3[] = [];
  const lf: number[] = [],
    ef: number[] = [],
    bf: number[] = [],
    edf: number[] = [];
  for (let face = 0; face < 6; face++)
    for (let i = 1; i <= perFace; i++) {
      const u = halton(i, 2),
        v = halton(i, 3);
      lin.push(faceRgb(face, u, v));
      lf.push(face);
      enc.push(faceRgb(face, decodeEncoded(u), decodeEncoded(v)));
      ef.push(face);
    }
  for (let face = 0; face < 6; face++)
    for (const u of NEAR_BLACK_VALUES)
      for (const v of NEAR_BLACK_VALUES) {
        black.push(faceRgb(face, u, v));
        bf.push(face);
      }
  CUBE_EDGES.forEach(([a, b]) => {
    for (let i = 0; i <= 1023; i++) {
      const t = decodeEncoded(i / 1023);
      edges.push([0, 1, 2].map((k) => a[k]! + (b[k]! - a[k]!) * t) as Vec3);
      edf.push(0);
    }
  });
  return [
    make("uniform-linear-rgb", lin, lf),
    make("uniform-encoded-rgb", enc, ef),
    make("near-black-geometric", black, bf),
    make("cube-edges", edges, edf),
  ];
}

export interface TrueToMeshReport {
  probes: string;
  all: Stats;
  nearBlack: Stats;
  elsewhere: Stats;
}
/** Held-out true surface point -> nearest triangle of the whole candidate mesh. */
export function trueToMesh(grid: TriangleGrid, set: ProbeSet): TrueToMeshReport {
  const n = set.scene.length / 3;
  const all = new Float64Array(n);
  const near: number[] = [],
    far: number[] = [];
  for (let i = 0; i < n; i++) {
    const p: Vec3 = [set.scene[3 * i]!, set.scene[3 * i + 1]!, set.scene[3 * i + 2]!];
    const d = grid.nearest(p);
    all[i] = d;
    (p[1] < 0.05 ? near : far).push(d);
  }
  return { probes: set.name, all: statsOf(all), nearBlack: statsOf(near), elsewhere: statsOf(far) };
}

/** Radial rim samples of one lower (cone) face: scene points F(Q(s)) along the outer boundary path. */
export class ConeFace {
  readonly axis: number;
  readonly rim: Vec3[];
  constructor(axis: number, space: Space, samples = 4096) {
    this.axis = axis;
    const [u, v] = FACE_FREE_AXES[axis]!;
    this.rim = Array.from({ length: samples + 1 }, (_, i) => {
      const s = (2 * i) / samples; // 0..2 along the two outer edges
      const q: Vec3 = [0, 0, 0];
      q[u] = s <= 1 ? 1 : 2 - s;
      q[v] = s <= 1 ? s : 1;
      return scene(q, space);
    });
  }
  /** Distance from x to the cone: min over generator segments [black, rim(s)], refined locally. */
  distance(x: Vec3): number {
    const segment = (r: Vec3) => {
      const length2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
      const t = length2 > 0 ? Math.max(0, Math.min(1, dot(x, r) / length2)) : 0;
      return Math.hypot(x[0] - t * r[0], x[1] - t * r[1], x[2] - t * r[2]);
    };
    let best = Infinity,
      index = 0;
    for (let i = 0; i < this.rim.length; i++) {
      const d = segment(this.rim[i]!);
      if (d < best) {
        best = d;
        index = i;
      }
    }
    // Rim chord interpolation between the neighboring dense samples (linear in s).
    const lo = this.rim[Math.max(0, index - 1)]!,
      hi = this.rim[Math.min(this.rim.length - 1, index + 1)]!;
    let a = 0,
      b = 1;
    const at = (w: number): Vec3 => [
      lo[0] + (hi[0] - lo[0]) * w,
      lo[1] + (hi[1] - lo[1]) * w,
      lo[2] + (hi[2] - lo[2]) * w,
    ];
    for (let k = 0; k < 40; k++) {
      const m1 = a + (b - a) / 3,
        m2 = b - (b - a) / 3;
      if (segment(at(m1)) < segment(at(m2))) b = m2;
      else a = m1;
    }
    const refined = segment(at((a + b) / 2));
    return Math.min(best, refined);
  }
  /** Unit normal line of the cone at the generator through rim sample index (finite difference). */
  normalAt(x: Vec3): Vec3 | null {
    let best = Infinity,
      index = 1;
    const r = (i: number) => this.rim[i]!;
    for (let i = 1; i < this.rim.length - 1; i++) {
      const v = r(i);
      const length2 = dot(v, v);
      const t = Math.max(0, Math.min(1, dot(x, v) / length2));
      const d = Math.hypot(x[0] - t * v[0], x[1] - t * v[1], x[2] - t * v[2]);
      if (d < best) {
        best = d;
        index = i;
      }
    }
    const tangent = sub(r(index + 1), r(index - 1));
    const normal = cross(r(index), tangent);
    return norm(normal) > 0 ? unit(normal) : null;
  }
}

/**
 * Gauss-Newton projection of x onto one true upper face, started from the source parameters.
 * Returns the distance to the nearest true point on THAT face's patch (clamped to [0, 1]^2), an
 * upper bound for the distance to the whole surface.
 */
export function projectToFace(
  x: Vec3,
  face: number,
  start: readonly [number, number],
  space: Space,
): { distance: number; u: number; v: number } {
  let u = Math.min(1, Math.max(0, start[0])),
    v = Math.min(1, Math.max(0, start[1]));
  let { point, du, dv } = faceSurface(face, u, v, space);
  let residual = sub(point, x);
  let best = norm(residual);
  for (let iteration = 0; iteration < 24; iteration++) {
    const a = dot(du, du),
      b = dot(du, dv),
      c = dot(dv, dv);
    const gu = dot(du, residual),
      gv = dot(dv, residual);
    const damping = 1e-12 * (a + c);
    const det = (a + damping) * (c + damping) - b * b;
    if (!(Math.abs(det) > 0)) break;
    let step = 1;
    let accepted = false;
    const du0 = -((c + damping) * gu - b * gv) / det;
    const dv0 = -((a + damping) * gv - b * gu) / det;
    for (let backtrack = 0; backtrack < 12; backtrack++, step /= 2) {
      const nu = Math.min(1, Math.max(0, u + step * du0)),
        nv = Math.min(1, Math.max(0, v + step * dv0));
      const trial = faceSurface(face, nu, nv, space);
      const trialResidual = sub(trial.point, x);
      const d = norm(trialResidual);
      if (d < best) {
        u = nu;
        v = nv;
        point = trial.point;
        du = trial.du;
        dv = trial.dv;
        residual = trialResidual;
        const moved = Math.abs(best - d);
        best = d;
        accepted = true;
        if (moved < 1e-15) return { distance: best, u, v };
        break;
      }
    }
    if (!accepted) break;
  }
  return { distance: best, u, v };
}

export interface MeshToTrueReport {
  samples: number;
  all: Stats;
  nearBlack: Stats;
  elsewhere: Stats;
  coneFaces: Stats;
  upperFaces: Stats;
}
/**
 * Candidate surface sample -> true surface. Four samples per triangle (centroid and three edge
 * midpoints). Upper-face samples project onto their own true face by Gauss-Newton; lower (cone)
 * face samples use the exact distance to the cone's generator rays. Each value is the distance to
 * a true surface point, so it is an upper bound on distance to the surface.
 */
export function meshToTrue(mesh: CandidateMesh, space: Space): MeshToTrueReport {
  const cones = [0, 1, 2].map((axis) => new ConeFace(axis, space));
  const all: number[] = [],
    near: number[] = [],
    far: number[] = [],
    cone: number[] = [],
    upper: number[] = [];
  const weights: Vec3[] = [
    [1 / 3, 1 / 3, 1 / 3],
    [0.5, 0.5, 0],
    [0, 0.5, 0.5],
    [0.5, 0, 0.5],
  ];
  for (let t = 0; t < mesh.triangles.length / 3; t++) {
    const ids = [mesh.triangles[3 * t]!, mesh.triangles[3 * t + 1]!, mesh.triangles[3 * t + 2]!];
    const face = mesh.faces[t]!,
      axis = face >> 1;
    const free = FACE_FREE_AXES[axis]!;
    for (const w of weights) {
      const x: Vec3 = [0, 1, 2].map((k) =>
        ids.reduce((s, id, i) => s + mesh.positions[3 * id + k]! * w[i]!, 0),
      ) as Vec3;
      let d: number;
      if (face & 1) {
        const guess = [free[0], free[1]].map((k) =>
          ids.reduce((s, id, i) => s + mesh.linearRgb[3 * id + k]! * w[i]!, 0),
        ) as [number, number];
        d = projectToFace(x, face, guess, space).distance;
        upper.push(d);
      } else {
        d = cones[axis]!.distance(x);
        cone.push(d);
      }
      all.push(d);
      (x[1] < 0.05 ? near : far).push(d);
    }
  }
  return {
    samples: all.length,
    all: statsOf(all),
    nearBlack: statsOf(near),
    elsewhere: statsOf(far),
    coneFaces: statsOf(cone),
    upperFaces: statsOf(upper),
  };
}
