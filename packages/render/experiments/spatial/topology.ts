// Experiment-only topology and embedding diagnostics. Sampled and finite-precision: none of these
// is an exact-predicate certificate, and none is a continuous Hausdorff or embedding proof.
import { faceOutwardNormal, FACE_FREE_AXES, type Space, type Vec3 } from "./oracle.ts";
import type { CandidateMesh } from "./candidates.ts";

const point = (buffer: ArrayLike<number>, i: number): Vec3 => [
  buffer[3 * i]!,
  buffer[3 * i + 1]!,
  buffer[3 * i + 2]!,
];
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export interface TopologyReport {
  vertices: number;
  triangles: number;
  edges: number;
  euler: number;
  /** Every undirected edge has exactly two incident triangles, traversed in opposite directions. */
  closedOrientedManifold: boolean;
  connectedComponents: number;
  unreferencedVertices: number;
  zeroAreaTriangles: number;
  /** Smallest and largest triangle area, in OKLab units squared. */
  minArea: number;
  maxArea: number;
  /** Largest ratio of longest edge to the triangle's smallest altitude: a skinniness measure. */
  maxAspect: number;
  /** Smallest interior angle over all triangles, degrees. */
  minAngleDegrees: number;
  /** Triangles whose interior angle is below 1 degree or above 179 degrees. */
  sliverTriangles: number;
  /** Per source-face triangle counts, indexed by the face byte. */
  facePopulation: number[];
  /** Triangles whose source face disagrees with their three vertices' RGB constraint. */
  faceProvenanceViolations: number;
}

export function analyzeTopology(mesh: CandidateMesh): TopologyReport {
  const vertices = mesh.positions.length / 3;
  const count = mesh.triangles.length / 3;
  const directed = new Map<string, number>();
  const used = new Uint8Array(vertices);
  let closed = true;
  let minArea = Infinity,
    maxArea = 0,
    zero = 0,
    maxAspect = 0,
    minAngle = 180,
    sliver = 0,
    violations = 0;
  const facePopulation = [0, 0, 0, 0, 0, 0];
  const parent = Int32Array.from({ length: vertices }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  for (let t = 0; t < count; t++) {
    const ids = [mesh.triangles[3 * t]!, mesh.triangles[3 * t + 1]!, mesh.triangles[3 * t + 2]!];
    ids.forEach((v) => (used[v] = 1));
    const [a, b, c] = ids.map((v) => point(mesh.positions, v)) as [Vec3, Vec3, Vec3];
    const ab = subtract(b, a),
      ac = subtract(c, a),
      bc = subtract(c, b);
    const area = Math.hypot(...cross(ab, ac)) / 2;
    if (!(area > 0)) zero++;
    minArea = Math.min(minArea, area);
    maxArea = Math.max(maxArea, area);
    const lengths = [Math.hypot(...ab), Math.hypot(...bc), Math.hypot(...ac)];
    const longest = Math.max(...lengths);
    if (area > 0) {
      maxAspect = Math.max(maxAspect, (longest * longest) / (2 * area));
      const angles = [
        Math.acos(Math.max(-1, Math.min(1, dot(ab, ac) / (lengths[0]! * lengths[2]!)))),
        Math.acos(Math.max(-1, Math.min(1, -dot(ab, bc) / (lengths[0]! * lengths[1]!)))),
        Math.acos(Math.max(-1, Math.min(1, dot(bc, subtract(a, c)) / (lengths[1]! * lengths[2]!)))),
      ].map((r) => (r * 180) / Math.PI);
      const smallest = Math.min(...angles),
        largest = Math.max(...angles);
      minAngle = Math.min(minAngle, smallest);
      if (smallest < 1 || largest > 179) sliver++;
    }
    for (let k = 0; k < 3; k++) {
      const from = ids[k]!,
        to = ids[(k + 1) % 3]!;
      const key = `${from}>${to}`;
      directed.set(key, (directed.get(key) ?? 0) + 1);
      parent[find(from)] = find(to);
    }
    const face = mesh.faces[t]!;
    facePopulation[face]!++;
    const axis = face >> 1;
    for (const v of ids)
      if (Math.abs(mesh.linearRgb[3 * v + axis]! - (face & 1)) > 1e-14) violations++;
  }
  let edges = 0;
  for (const [key, times] of directed) {
    const [from, to] = key.split(">") as [string, string];
    if (times !== 1 || directed.get(`${to}>${from}`) !== 1) closed = false;
    else if (Number(from) < Number(to)) edges++;
  }
  const roots = new Set<number>();
  for (let v = 0; v < vertices; v++) if (used[v]) roots.add(find(v));
  let unreferenced = 0;
  for (let v = 0; v < vertices; v++) if (!used[v]) unreferenced++;
  return {
    vertices,
    triangles: count,
    edges,
    euler: vertices - unreferenced - edges + count,
    closedOrientedManifold: closed,
    connectedComponents: roots.size,
    unreferencedVertices: unreferenced,
    zeroAreaTriangles: zero,
    minArea,
    maxArea,
    maxAspect,
    minAngleDegrees: minAngle,
    sliverTriangles: sliver,
    facePopulation,
    faceProvenanceViolations: violations,
  };
}

export interface OrientationReport {
  /** Triangles whose chord normal points against the true outward surface normal at the centroid. */
  inwardTriangles: number;
  /** Largest angle between a chord normal and the true outward normal at the centroid's source. */
  maxNormalDeviationDegrees: number;
  checked: number;
}

/**
 * Compares every triangle's chord normal with the true outward face normal at the triangle's RGB
 * centroid. Needs no convexity or center assumption. Apex-incident cone triangles whose centroid
 * source is the apex's neighbor are evaluated at the centroid of their rim pair to stay off the
 * singular black point.
 */
export function analyzeOrientation(mesh: CandidateMesh, space: Space): OrientationReport {
  let inward = 0,
    worst = 0,
    checked = 0;
  for (let t = 0; t < mesh.triangles.length / 3; t++) {
    const ids = [mesh.triangles[3 * t]!, mesh.triangles[3 * t + 1]!, mesh.triangles[3 * t + 2]!];
    const [a, b, c] = ids.map((v) => point(mesh.positions, v)) as [Vec3, Vec3, Vec3];
    const normal = cross(subtract(b, a), subtract(c, a));
    const length = Math.hypot(...normal);
    if (!(length > 0)) continue;
    const face = mesh.faces[t]!;
    const axis = face >> 1;
    const free = FACE_FREE_AXES[axis]!;
    let u = 0,
      v = 0,
      weight = 0;
    for (const id of ids) {
      const rgb = point(mesh.linearRgb, id);
      // Skip the black apex: its source is on the singularity for all three cone faces.
      if (rgb[0] === 0 && rgb[1] === 0 && rgb[2] === 0) continue;
      u += rgb[free[0]];
      v += rgb[free[1]];
      weight++;
    }
    if (!weight) continue;
    // Keep the evaluation point strictly interior of the face so the Jacobian is regular.
    const clamp = (x: number) => Math.min(1 - 1e-9, Math.max(1e-9, x / weight));
    const outward = faceOutwardNormal(face, clamp(u), clamp(v), space);
    if (!outward) continue;
    checked++;
    const cosine = dot(normal, outward) / length;
    if (cosine <= 0) inward++;
    worst = Math.max(worst, (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180) / Math.PI);
  }
  return { inwardTriangles: inward, maxNormalDeviationDegrees: worst, checked };
}

export interface StarShapeReport {
  /** Triangles whose tetrahedron with black has positive signed volume (strictly outward-facing). */
  outwardFromBlack: number;
  /** Triangles that contain black or are coplanar with it within the relative tolerance (radial). */
  radial: number;
  /** Triangles seen from black as inward-facing: each is a fold of the radial projection. */
  inwardFromBlack: number;
  minRelativeVolume: number;
}

/**
 * Star-shapedness about black. The exact gamut is a radial graph over a solid angle, so a mesh is
 * embedded if (a) every non-radial triangle is outward as seen from black, (b) radial (cone)
 * triangles are exactly coplanar with black, and (c) the closed mesh is an oriented manifold.
 * This is a numerical diagnostic with a relative tolerance, not an exact predicate.
 */
export function analyzeStarShape(mesh: CandidateMesh, tolerance = 1e-12): StarShapeReport {
  let outward = 0,
    radial = 0,
    inward = 0,
    minRelative = Infinity;
  for (let t = 0; t < mesh.triangles.length / 3; t++) {
    const [a, b, c] = [0, 1, 2].map((k) => point(mesh.positions, mesh.triangles[3 * t + k]!)) as [
      Vec3,
      Vec3,
      Vec3,
    ];
    const volume = dot(a, cross(b, c));
    const scale = Math.hypot(...a) * Math.hypot(...b) * Math.hypot(...c);
    const relative = scale > 0 ? volume / scale : 0;
    minRelative = Math.min(minRelative, relative);
    if (Math.abs(relative) <= tolerance) radial++;
    else if (volume > 0) outward++;
    else inward++;
  }
  return {
    outwardFromBlack: outward,
    radial,
    inwardFromBlack: inward,
    minRelativeVolume: minRelative,
  };
}

/** Separating-axis test with in-plane edge normals; `true` when the triangles are disjoint. */
export function trianglesSeparated(a: readonly Vec3[], b: readonly Vec3[], tolerance = 1e-12) {
  const ea = [subtract(a[1]!, a[0]!), subtract(a[2]!, a[1]!), subtract(a[0]!, a[2]!)];
  const eb = [subtract(b[1]!, b[0]!), subtract(b[2]!, b[1]!), subtract(b[0]!, b[2]!)];
  const na = cross(ea[0]!, ea[1]!),
    nb = cross(eb[0]!, eb[1]!);
  const axes = [
    na,
    nb,
    ...ea.flatMap((x) => eb.map((y) => cross(x, y))),
    ...ea.map((x) => cross(na, x)),
    ...eb.map((x) => cross(nb, x)),
  ];
  return axes.some((axis) => {
    const length = Math.hypot(...axis);
    if (length === 0) return false;
    const x = a.map((p) => dot(p, axis) / length),
      y = b.map((p) => dot(p, axis) / length);
    return (
      Math.max(...x) < Math.min(...y) - tolerance || Math.max(...y) < Math.min(...x) - tolerance
    );
  });
}

/**
 * Pairwise embedding diagnostic for small meshes: counts intersecting triangle pairs that share no
 * vertex. Quadratic; refuse large meshes rather than silently sampling them.
 */
export function pairwiseIntersections(mesh: CandidateMesh, maxTriangles = 3000) {
  const count = mesh.triangles.length / 3;
  if (count > maxTriangles) throw new RangeError("mesh too large for the pairwise diagnostic");
  const items = Array.from({ length: count }, (_, t) => {
    const ids = [0, 1, 2].map((k) => mesh.triangles[3 * t + k]!);
    const points = ids.map((v) => point(mesh.positions, v));
    return {
      ids,
      points,
      min: [0, 1, 2].map((axis) => Math.min(...points.map((p) => p[axis]!))),
      max: [0, 1, 2].map((axis) => Math.max(...points.map((p) => p[axis]!))),
    };
  });
  let candidates = 0,
    intersections = 0;
  for (let i = 0; i < count; i++)
    for (let j = i + 1; j < count; j++) {
      const p = items[i]!,
        q = items[j]!;
      if (p.ids.some((id) => q.ids.includes(id))) continue;
      if (
        [0, 1, 2].some(
          (axis) => p.max[axis]! < q.min[axis]! - 1e-12 || q.max[axis]! < p.min[axis]! - 1e-12,
        )
      )
        continue;
      candidates++;
      if (!trianglesSeparated(p.points, q.points)) intersections++;
    }
  return { candidates, intersections };
}
