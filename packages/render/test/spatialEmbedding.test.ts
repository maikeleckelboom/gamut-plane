import { expect, it } from "vitest";
import { generateBoundaryMesh } from "../src/spatial/boundaryMesh.js";
import { readPoint } from "../src/spatial/quality.js";

type Vector = readonly number[];
const sub = (a: Vector, b: Vector) => a.map((v, i) => v - b[i]!);
const cross = (a: Vector, b: Vector) => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];
const dot = (a: Vector, b: Vector) => a.reduce((sum, v, i) => sum + v * b[i]!, 0);

// Separating-axis diagnostic; includes in-plane edge normals for coplanar triangles.
// A fixed numerical tolerance and omission of incident pairs make this an embedding CHECK,
// not a robust-arithmetic certificate of absence of all self intersections.
function separated(a: Vector[], b: Vector[]): boolean {
  const ea = [sub(a[1]!, a[0]!), sub(a[2]!, a[1]!), sub(a[0]!, a[2]!)];
  const eb = [sub(b[1]!, b[0]!), sub(b[2]!, b[1]!), sub(b[0]!, b[2]!)];
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
    const norm = Math.hypot(...axis);
    if (norm === 0) return false;
    const x = a.map((p) => dot(p, axis) / norm),
      y = b.map((p) => dot(p, axis) / norm);
    return Math.max(...x) < Math.min(...y) - 1e-12 || Math.max(...y) < Math.min(...x) - 1e-12;
  });
}

it("checks the intersection diagnostic on crossing, coplanar and separated fixtures", () => {
  const a = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
  ];
  expect(
    separated(a, [
      [0.2, 0.2, -1],
      [0.2, 0.2, 1],
      [0.8, 0.2, 0],
    ]),
  ).toBe(false);
  expect(
    separated(a, [
      [0.2, 0.2, 0],
      [0.7, 0.2, 0],
      [0.2, 0.7, 0],
    ]),
  ).toBe(false);
  expect(
    separated(a, [
      [2, 2, 0],
      [3, 2, 0],
      [2, 3, 0],
    ]),
  ).toBe(true);
  expect(
    separated(
      a,
      a.map((p) => [p[0]!, p[1]!, 0.001]),
    ),
  ).toBe(true);
});

for (const space of ["srgb", "display-p3"] as const)
  for (const distribution of ["linear", "encoded", "cubic"] as const)
    it(`finds no nonincident triangle intersections in the n=8 ${space} ${distribution} fixture`, () => {
      const result = generateBoundaryMesh({ space, distribution, subdivisions: 8 });
      if (!result.ok) throw new Error(result.error);
      const mesh = result.value;
      const triangles = Array.from({ length: mesh.faces.length }, (_, index) => {
        const ids = readPoint(mesh.triangles, index);
        const points = ids.map((id) => readPoint(mesh.positions, id));
        return {
          ids,
          points,
          min: [0, 1, 2].map((axis) => Math.min(...points.map((p) => p[axis]!))),
          max: [0, 1, 2].map((axis) => Math.max(...points.map((p) => p[axis]!))),
        };
      });
      let candidates = 0,
        intersections = 0;
      for (let i = 0; i < triangles.length; i++)
        for (let j = i + 1; j < triangles.length; j++) {
          const a = triangles[i]!,
            b = triangles[j]!;
          if (a.ids.some((id) => b.ids.includes(id))) continue;
          if (
            [0, 1, 2].some(
              (axis) => a.max[axis]! < b.min[axis]! - 1e-12 || b.max[axis]! < a.min[axis]! - 1e-12,
            )
          )
            continue;
          candidates++;
          if (!separated(a.points, b.points)) intersections++;
        }
      expect(candidates).toBeGreaterThan(0);
      expect(intersections).toBe(0);
    });
