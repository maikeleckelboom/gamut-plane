// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSpatialScene } from "../src/spatial/spatialScene";
import { Box3, OrthographicCamera, Vector3 } from "three";
import { generateBoundaryMesh, spatialColorDefinition } from "@gamut-plane/render/internal/spatial";
import { createBoundaryUpload } from "../src/spatial/uploadGeometry";
import {
  backingSize,
  fitCamera,
  homeCamera,
  setCameraAspect,
  screenRuler,
} from "../src/spatial/spatialCamera";
import { multiply, referenceLinear, referenceEncode } from "./spatialReference";

describe("spatial upload", () => {
  it("imports the renderer without browser globals or GPU allocation", () => {
    expect(typeof globalThis.document).toBe("undefined");
    expect(typeof createSpatialScene).toBe("function");
  });
  it.each(["srgb", "display-p3"] as const)(
    "preserves science, winding, provenance and creases for %s",
    (space) => {
      const result = generateBoundaryMesh({ space, subdivisions: 8, distribution: "cubic" });
      if (!result.ok) throw new Error(result.error);
      const mesh = result.value;
      const original = mesh.positions.slice(),
        originalIndices = mesh.triangles.slice();
      const upload = createBoundaryUpload(mesh);
      expect(upload.logicalVertices.length).toBe(6 * 9 * 9);
      const position = upload.geometry.getAttribute("position"),
        normal = upload.geometry.getAttribute("normal");
      const creaseNormals = new Map<number, Vector3[]>();
      upload.logicalVertices.forEach((id, i) => {
        for (let axis = 0; axis < 3; axis++)
          expect(position.array[i * 3 + axis]).toBe(Math.fround(mesh.positions[3 * id + axis]!));
        const n = new Vector3().fromBufferAttribute(normal, i);
        expect(n.length()).toBeCloseTo(1, 6);
        creaseNormals.set(id, [...(creaseNormals.get(id) ?? []), n]);
      });
      const cross = new Vector3(),
        ab = new Vector3(),
        ac = new Vector3();
      for (let t = 0; t < mesh.faces.length; t++) {
        const ids = [0, 1, 2].map((c) => upload.geometry.index!.array[3 * t + c]!);
        ids.forEach((id, c) => {
          expect(upload.logicalVertices[id]).toBe(mesh.triangles[3 * t + c]);
          expect(upload.vertexFaces[id]).toBe(mesh.faces[t]);
        });
        const [a, b, c] = ids.map((id) => new Vector3().fromBufferAttribute(position, id));
        cross.crossVectors(ab.subVectors(b!, a!), ac.subVectors(c!, a!));
        expect(cross.length()).toBeGreaterThan(0);
        for (const id of ids)
          expect(cross.dot(new Vector3().fromBufferAttribute(normal, id))).toBeGreaterThan(0);
      }
      expect(
        [...creaseNormals.values()].some(
          (normals) => normals.length === 3 && normals[0]!.dot(normals[1]!) < 0.9,
        ),
      ).toBe(true);
      expect(mesh.positions).toEqual(original);
      expect(mesh.triangles).toEqual(originalIndices);
      expect(mesh.quality.status).toBe("unqualified-reference");
      upload.dispose();
    },
  );
});

describe("spatial color definitions", () => {
  it("rejects an unsupported output instead of substituting another definition", () => {
    // @ts-expect-error runtime boundary for untyped callers
    expect(() => spatialColorDefinition("rec2020")).toThrow(RangeError);
  });
  it.each(["srgb", "display-p3"] as const)(
    "matches an independent XYZ inverse for %s, including extended colors",
    (space) => {
      const definition = spatialColorDefinition(space);
      for (let l = -0.1; l < 1.11; l += 0.1)
        for (let a = -0.4; a < 0.41; a += 0.1)
          for (let b = -0.4; b < 0.41; b += 0.1) {
            const lab = [l, a, b];
            const actual = multiply(
              definition.lmsToLinearRgb,
              multiply(definition.oklabToLmsPrime, lab).map((v) => v ** 3),
            );
            const expected = referenceLinear(lab, space);
            actual.forEach((v, i) => expect(Math.abs(v - expected[i]!)).toBeLessThan(2e-12));
          }
      for (const v of [-2, -0.0031308, 0, 0.0031308, 0.18, 1, 2]) {
        const t = definition.transfer;
        const actual =
          Math.sign(v) *
          (Math.abs(v) <= t.threshold
            ? t.slope * Math.abs(v)
            : t.scale * Math.abs(v) ** t.exponent - t.offset);
        expect(actual).toBe(referenceEncode(v));
      }
      definition.lmsToLinearRgb[0]![0] = 0;
      expect(spatialColorDefinition(space).lmsToLinearRgb[0]![0]).not.toBe(0);
    },
  );
});

it("frames bounds in any aspect without stretching and caps the backing allocation", () => {
  const camera = new OrthographicCamera(),
    target = new Vector3();
  const bounds = new Box3(new Vector3(-0.3, 0, -0.32), new Vector3(0.3, 1, 0.23));
  for (const aspect of [0.5, 1, 2]) {
    homeCamera(camera, target);
    setCameraAspect(camera, aspect);
    fitCamera(camera, target, bounds);
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [0, 1])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const p = new Vector3(x, y, z).project(camera);
          expect(Math.abs(p.x)).toBeLessThanOrEqual(1 / 1.12 + 1e-12);
          expect(Math.abs(p.y)).toBeLessThanOrEqual(1 / 1.12 + 1e-12);
        }
    expect(camera.projectionMatrix.elements[0]! * aspect).toBeCloseTo(
      camera.projectionMatrix.elements[5]!,
      12,
    );
  }
  const size = backingSize(3840, 2160, 3);
  expect(size.width * size.height).toBeLessThanOrEqual(3_000_000);
  expect(backingSize(0, 500, 2).ratio).toBe(0);
  for (const tenthUnitPixels of [5, 30, 60, 100, 400, 1200]) {
    const ruler = screenRuler(tenthUnitPixels);
    expect(ruler.pixels).toBeGreaterThanOrEqual(40);
    expect(ruler.pixels).toBeLessThanOrEqual(100);
    expect(ruler.pixels).toBeCloseTo(ruler.units * tenthUnitPixels * 10, 12);
  }
});
