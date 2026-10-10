import {
  decodeRgbCoordinate,
  linearRgbToOklabBatch,
  representationDefinitions,
  RGB_NUMERIC_REVISION,
  type RgbRepresentationId,
} from "@gamut-plane/core/internal/capabilities";

export type KnotDistribution = "linear" | "encoded" | "cubic";
export const SPATIAL_GENERATOR_REVISION = "rgb-cube-grid-v1";
export const MAX_SPATIAL_SUBDIVISIONS = 128;

/** Internal scientific data. Consumers own buffers and must treat them as immutable. */
export interface BoundaryMesh {
  readonly space: RgbRepresentationId;
  readonly gamut: "srgb-gamut" | "display-p3-gamut";
  readonly coordinates: "oklab-a-l-b";
  /**
   * Which construction produced the mesh. `cube-grid-v1`: six n x n grids. `radial-hybrid-v1`: three
   * upper-face grids plus three fans from black (see radialBoundaryMesh.ts). Consumers that shade
   * the surface must honor it: a fan's apex needs a per-triangle normal.
   */
  readonly topology: "cube-grid-v1" | "radial-hybrid-v1";
  readonly definitionRevision: string;
  readonly generatorRevision: string;
  readonly subdivisions: number;
  readonly distribution: KnotDistribution;
  readonly knots: Float64Array;
  /** Shared logical vertices, [a,L,b]; no axis scaling or centering. */
  readonly positions: Float64Array;
  readonly linearRgb: Float64Array;
  readonly triangles: Uint32Array;
  /** Per triangle: 2 * fixed RGB channel index + fixed value (0 or 1). */
  readonly faces: Uint8Array;
  readonly bounds: Readonly<{ min: readonly number[]; max: readonly number[] }>;
  readonly quality: Readonly<{
    status: "unqualified-reference";
    vertexConversions: number;
    bufferBytes: number;
  }>;
}
export type BoundaryMeshResult =
  | Readonly<{ ok: true; value: BoundaryMesh }>
  | Readonly<{
      ok: false;
      error: "invalid-options" | "resource-budget" | "numerical-failure";
    }>;

/** Integer lattice identity: two caps and the perimeter rings between them. No float welding. */
function vertexIndex(x: number, y: number, z: number, n: number): number {
  const cap = (n + 1) ** 2;
  if (z === 0 || z === n) return (z === 0 ? 0 : cap) + y * (n + 1) + x;
  const ring = y === 0 ? x : x === n ? n + y : y === n ? 3 * n - x : 4 * n - y;
  return 2 * cap + (z - 1) * 4 * n + ring;
}

/** No default resolution: Phase 3B must choose and qualify a presentation policy. */
export function generateBoundaryMesh(
  options: Readonly<{
    space: RgbRepresentationId;
    subdivisions: number;
    distribution: KnotDistribution;
  }>,
): BoundaryMeshResult {
  if (typeof options !== "object" || options === null)
    return { ok: false, error: "invalid-options" };
  const { space, subdivisions: n, distribution } = options;
  if (
    (space !== "srgb" && space !== "display-p3") ||
    !Number.isSafeInteger(n) ||
    n < 1 ||
    !["linear", "encoded", "cubic"].includes(distribution)
  )
    return { ok: false, error: "invalid-options" };
  if (n > MAX_SPATIAL_SUBDIVISIONS) return { ok: false, error: "resource-budget" };
  const knots = Float64Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    // Both admitted core definitions declare the same extended sRGB transfer function.
    return i === 0 || i === n
      ? t
      : distribution === "encoded"
        ? decodeRgbCoordinate(t)
        : distribution === "cubic"
          ? t ** 3
          : t;
  });
  const vertexCount = 6 * n * n + 2;
  const linearRgb = new Float64Array(vertexCount * 3);
  const writeVertex = (x: number, y: number, z: number) => {
    const offset = 3 * vertexIndex(x, y, z, n);
    linearRgb[offset] = knots[x]!;
    linearRgb[offset + 1] = knots[y]!;
    linearRgb[offset + 2] = knots[z]!;
  };
  for (const z of [0, n])
    for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) writeVertex(x, y, z);
  for (let z = 1; z < n; z++) {
    for (let x = 0; x <= n; x++) {
      writeVertex(x, 0, z);
      writeVertex(x, n, z);
    }
    for (let y = 1; y < n; y++) {
      writeVertex(0, y, z);
      writeVertex(n, y, z);
    }
  }
  const converted = linearRgbToOklabBatch(linearRgb, space);
  if (!converted.ok) return { ok: false, error: "numerical-failure" };
  // Reuse the conversion allocation; only permute axes, never change scientific scale.
  const positions = converted.value;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    const l = positions[i]!;
    positions[i] = positions[i + 1]!;
    positions[i + 1] = l;
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis]!, positions[i + axis]!);
      max[axis] = Math.max(max[axis]!, positions[i + axis]!);
    }
  }
  const triangles = new Uint32Array(36 * n * n);
  const faces = new Uint8Array(12 * n * n);
  const lattice = [0, 0, 0];
  let triangle = 0;
  for (let axis = 0; axis < 3; axis++) {
    const u = axis === 0 ? 1 : 0;
    const v = axis === 2 ? 1 : 2;
    for (const side of [0, 1]) {
      lattice[axis] = side * n;
      const at = (i: number, j: number) => {
        lattice[u] = i;
        lattice[v] = j;
        return vertexIndex(lattice[0]!, lattice[1]!, lattice[2]!, n);
      };
      // RGB -> [L,a,b] preserves orientation; [L,a,b] -> [a,L,b] reverses it.
      const flip = (axis === 1) !== (side === 1);
      const emit = (a: number, b: number, c: number) => {
        triangles[3 * triangle] = a;
        triangles[3 * triangle + 1] = flip ? c : b;
        triangles[3 * triangle + 2] = flip ? b : c;
        faces[triangle++] = 2 * axis + side;
      };
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const a = at(i, j),
            b = at(i + 1, j),
            c = at(i + 1, j + 1),
            d = at(i, j + 1);
          emit(a, b, c);
          emit(a, c, d);
        }
    }
  }
  // Fail closed on numerical collapse. No epsilon weld or triangle removal may change topology.
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = triangles[offset]! * 3,
      b = triangles[offset + 1]! * 3,
      c = triangles[offset + 2]! * 3;
    const ux = positions[b]! - positions[a]!,
      uy = positions[b + 1]! - positions[a + 1]!,
      uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!,
      vy = positions[c + 1]! - positions[a + 1]!,
      vz = positions[c + 2]! - positions[a + 2]!;
    const area2 = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    if (!(area2 > 0) || !Number.isFinite(area2)) return { ok: false, error: "numerical-failure" };
  }
  const gamut = representationDefinitions[space].associatedGamutId;
  if (gamut !== "srgb-gamut" && gamut !== "display-p3-gamut")
    return { ok: false, error: "numerical-failure" };
  return {
    ok: true,
    value: {
      space,
      gamut,
      coordinates: "oklab-a-l-b",
      topology: "cube-grid-v1",
      definitionRevision: RGB_NUMERIC_REVISION,
      generatorRevision: SPATIAL_GENERATOR_REVISION,
      subdivisions: n,
      distribution,
      knots,
      positions,
      linearRgb,
      triangles,
      faces,
      bounds: { min, max },
      quality: {
        status: "unqualified-reference",
        vertexConversions: vertexCount,
        bufferBytes:
          knots.byteLength +
          positions.byteLength +
          linearRgb.byteLength +
          triangles.byteLength +
          faces.byteLength,
      },
    },
  };
}

/** A separate upload representation; scientific coordinates remain Float64. */
export function quantizeBoundaryPositions(mesh: BoundaryMesh): Readonly<{
  positions: Float32Array;
  maxVertexDeviation: number;
  rmsVertexDeviation: number;
}> {
  const positions = new Float32Array(mesh.positions);
  let max = 0,
    sum = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const distance = Math.hypot(
      positions[i]! - mesh.positions[i]!,
      positions[i + 1]! - mesh.positions[i + 1]!,
      positions[i + 2]! - mesh.positions[i + 2]!,
    );
    max = Math.max(max, distance);
    sum += distance ** 2;
  }
  return {
    positions,
    maxVertexDeviation: max,
    rmsVertexDeviation: Math.sqrt(sum / (positions.length / 3)),
  };
}
