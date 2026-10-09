import { cpus } from "node:os";
import { Matrix4, OrthographicCamera, Triangle, Vector3 } from "three";
import { generateBoundaryMesh } from "@gamut-plane/render/internal/spatial";
import { homeCamera, setCameraAspect } from "../src/spatial/spatialCamera.ts";
import { referenceLab, type Triple } from "../test/spatialReference.ts";

// Offline sampled diagnostics. Never called by the application or used as an error certificate.
const probes: Triple[] = [
  [1 / 3, 1 / 3, 1 / 3],
  [0.6, 0.3, 0.1],
  [0.1, 0.6, 0.3],
  [0.3, 0.1, 0.6],
  [0.25, 0.75, 0],
  [0.5, 0.5, 0],
  [0.75, 0.25, 0],
  [0, 0.25, 0.75],
  [0, 0.5, 0.5],
  [0, 0.75, 0.25],
  [0.75, 0, 0.25],
  [0.5, 0, 0.5],
  [0.25, 0, 0.75],
];
const read = (buffer: ArrayLike<number>, i: number): Triple => [
  buffer[3 * i]!,
  buffer[3 * i + 1]!,
  buffer[3 * i + 2]!,
];
const scenePoint = (rgb: Triple, space: "srgb" | "display-p3"): Triple => {
  const [l, a, b] = referenceLab(rgb, space);
  return [a, l, b];
};
const views = [
  ["home", [1.35, 0.8, 1.65]],
  ["blue", [-0.4, 0.1, -2]],
  ["side", [2, 0.1, 0.1]],
] as const;
const width = 1440,
  height = 900;
const zooms = [1, 2, 4, 8, 12];
const triangle = new Triangle(),
  closest = new Vector3(),
  query = new Vector3();
function distance(p: Triple, a: Triple, b: Triple, c: Triple) {
  triangle.set(new Vector3(...a), new Vector3(...b), new Vector3(...c));
  query.fromArray(p);
  triangle.closestPointToPoint(query, closest);
  return closest.distanceTo(query);
}
function segmentDistance(p: Triple, a: Triple, b: Triple) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const d = dx * dx + dy * dy;
  const t = d ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / d)) : 0;
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dy * t);
}
function distance2d(p: Triple, a: Triple, b: Triple, c: Triple) {
  const cross = (u: Triple, v: Triple) =>
    (v[0] - u[0]) * (p[1] - u[1]) - (v[1] - u[1]) * (p[0] - u[0]);
  const s = [cross(a, b), cross(b, c), cross(c, a)];
  const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(area) > 1e-20 && (s.every((v) => v >= 0) || s.every((v) => v <= 0))) return 0;
  return Math.min(segmentDistance(p, a, b), segmentDistance(p, b, c), segmentDistance(p, c, a));
}
const cameras = views.map(([name, direction]) => {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 20),
    target = new Vector3();
  homeCamera(camera, target);
  setCameraAspect(camera, width / height);
  camera.position.copy(target).add(new Vector3(...direction).normalize().multiplyScalar(3));
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const exact = new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  // Float32 upload and matrix coefficients; CPU arithmetic projection (not GPU raster precision).
  const gpu = new Matrix4().multiplyMatrices(
    new Matrix4().fromArray(camera.projectionMatrix.toArray().map(Math.fround)),
    new Matrix4().fromArray(camera.matrixWorldInverse.toArray().map(Math.fround)),
  );
  const project = (point: Triple, upload: boolean): Triple => {
    const p = new Vector3(...point).applyMatrix4(upload ? gpu : exact);
    return [(p.x * width) / 2, (p.y * height) / 2, 0];
  };
  return {
    name,
    project,
    projection: camera.projectionMatrix.toArray(),
    view: camera.matrixWorldInverse.toArray(),
    direction: new Vector3(...direction).normalize(),
  };
});
const metric = () => ({ max: 0, sumSquares: 0, count: 0 });
type Metric = ReturnType<typeof metric>;
function add(m: Metric, value: number) {
  m.max = Math.max(m.max, value);
  m.sumSquares += value * value;
  m.count++;
}
const report = (m: Metric, factor = 1) => ({
  max: m.max * factor,
  rms: Math.sqrt(m.sumSquares / Math.max(1, m.count)) * factor,
  samples: m.count,
});
const rows = [];
for (const space of ["srgb", "display-p3"] as const)
  for (const subdivisions of [32, 64, 128]) {
    const result = generateBoundaryMesh({ space, subdivisions, distribution: "cubic" });
    if (!result.ok) throw new Error(result.error);
    const mesh = result.value,
      upload = new Float32Array(mesh.positions);
    const lab = metric(),
      blackLab = metric();
    const stats = cameras.map(() => ({
      screen: metric(),
      black: metric(),
      silhouette: metric(),
      silhouetteBlack: metric(),
    }));
    const positions = Array.from({ length: upload.length / 3 }, (_, id) => read(upload, id));
    const projected = cameras.map((camera) => positions.map((p) => camera.project(p, true)));
    const edges = new Map<string, { a: number; b: number; signs: number[][] }>();
    for (let t = 0; t < mesh.faces.length; t++) {
      const ids = read(mesh.triangles, t),
        rgb = ids.map((id) => read(mesh.linearRgb, id));
      const [a, b, c] = ids.map((id) => positions[id]!) as [Triple, Triple, Triple];
      const n = new Vector3().crossVectors(
        new Vector3(...b).sub(new Vector3(...a)),
        new Vector3(...c).sub(new Vector3(...a)),
      );
      const signs = cameras.map((camera) => Math.sign(n.dot(camera.direction)));
      for (const [u, v] of [
        [0, 1],
        [1, 2],
        [2, 0],
      ] as const) {
        const first = Math.min(ids[u], ids[v]),
          second = Math.max(ids[u], ids[v]),
          key = `${first}:${second}`;
        const edge = edges.get(key);
        if (edge) edge.signs.push(signs);
        else edges.set(key, { a: first, b: second, signs: [signs] });
      }
      for (const w of probes) {
        const source = [0, 1, 2].map((axis) =>
          rgb.reduce((s, q, i) => s + q[axis]! * w[i]!, 0),
        ) as Triple;
        const p = scenePoint(source, space),
          deviation = distance(p, a, b, c);
        add(lab, deviation);
        if (p[1] < 0.05) add(blackLab, deviation);
        cameras.forEach((camera, i) => {
          const screen = camera.project(p, false),
            vertices = ids.map((id) => projected[i]![id]!);
          const residual = distance2d(screen, vertices[0]!, vertices[1]!, vertices[2]!);
          add(stats[i]!.screen, residual);
          if (p[1] < 0.05) add(stats[i]!.black, residual);
        });
      }
    }
    for (const edge of edges.values()) {
      if (edge.signs.length !== 2) throw new Error("Nonmanifold reference");
      const rgbA = read(mesh.linearRgb, edge.a),
        rgbB = read(mesh.linearRgb, edge.b);
      cameras.forEach((camera, i) => {
        if (edge.signs[0]![i] === edge.signs[1]![i]) return;
        for (let step = 1; step < 8; step++) {
          const t = step / 8;
          const p = scenePoint(
            rgbA.map((v, axis) => v * (1 - t) + rgbB[axis]! * t) as Triple,
            space,
          );
          const residual = segmentDistance(
            camera.project(p, false),
            projected[i]![edge.a]!,
            projected[i]![edge.b]!,
          );
          add(stats[i]!.silhouette, residual);
          if (p[1] < 0.05) add(stats[i]!.silhouetteBlack, residual);
        }
      });
    }
    rows.push({
      space,
      subdivisions,
      scientificBytes: mesh.quality.bufferBytes,
      oklab: report(lab),
      nearBlackOklab: report(blackLab),
      views: cameras.map((camera, i) => ({
        name: camera.name,
        zooms: zooms.map((zoom) => ({
          zoom,
          cssPixels: report(stats[i]!.screen, zoom),
          nearBlackCssPixels: report(stats[i]!.black, zoom),
          silhouetteEdgeCssPixels: report(stats[i]!.silhouette, zoom),
          nearBlackSilhouetteCssPixels: report(stats[i]!.silhouetteBlack, zoom),
        })),
      })),
    });
  }
console.log(
  JSON.stringify(
    {
      schema: 1,
      metric: "independent-xyz-f32-projected-corresponding-triangle-v1",
      status: "sampled-experiment-not-a-certificate",
      environment: { node: process.version, platform: process.platform, cpu: cpus()[0]?.model },
      viewport: { width, height },
      nearBlack: "L < 0.05",
      zoomRule:
        "Orthographic distances scale linearly with zoom and CSS height. Matrices stored at zoom=1; no viewport crop excludes a probe.",
      cameras: cameras.map(({ name, projection, view }) => ({ name, projection, view })),
      rows,
    },
    null,
    2,
  ),
);
