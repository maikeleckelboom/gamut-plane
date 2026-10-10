// Evidence-only harness: renders candidate boundary geometry through the application's own Shape
// and Color materials and light rig, at declared camera poses, and measures pixel differences
// against a reference render. It is imported dynamically by scripts/captureSpatialCandidates.ts
// and is never part of the application bundle.
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  DirectionalLight,
  Mesh,
  MeshLambertMaterial,
  NoToneMapping,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { createColorMaterial } from "../src/spatial/colorMaterial";
import { setCameraAspect } from "../src/spatial/spatialCamera";

export interface CandidateView {
  name: string;
  toViewer: [number, number, number];
  target: [number, number, number];
  zoom: number;
}
const BACKGROUND = [0x19, 0x1d, 0x22] as const;

export function mountCandidateHarness(width = 1000, height = 700) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: true,
    powerPreference: "low-power",
  })!;
  const renderer = new WebGLRenderer({ canvas, context: gl });
  renderer.outputColorSpace = SRGBColorSpace;
  gl.drawingBufferColorSpace = "srgb";
  renderer.toneMapping = NoToneMapping;
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x191d22, 1);
  const camera = new OrthographicCamera(-1, 1, 0.71, -0.71, 0.01, 20);
  setCameraAspect(camera, width / height);
  const shape = new MeshLambertMaterial({ color: 0xa8b0b8 });
  const color = createColorMaterial();
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 0.85));
  const key = new DirectionalLight(0xffffff, 1.65);
  key.position.set(-1, 2, 3);
  scene.add(key);
  const geometries = new Map<string, BufferGeometry>();
  const copy = document.createElement("canvas");
  copy.width = width;
  copy.height = height;
  const context2d = copy.getContext("2d")!;
  const samples = Number(gl.getParameter(gl.SAMPLES));

  function add(id: string, base64: string) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const vertices = view.getUint32(0, true),
      indexCount = view.getUint32(4, true);
    const geometry = new BufferGeometry();
    // Copy into aligned arrays: the payload offset need not be a multiple of four for views.
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(bytes.slice(8, 8 + vertices * 12).buffer), 3),
    );
    geometry.setAttribute(
      "normal",
      new BufferAttribute(
        new Float32Array(bytes.slice(8 + vertices * 12, 8 + vertices * 24).buffer),
        3,
      ),
    );
    geometry.setIndex(
      new BufferAttribute(
        new Uint32Array(bytes.slice(8 + vertices * 24, 8 + vertices * 24 + indexCount * 4).buffer),
        1,
      ),
    );
    geometries.set(id, geometry);
  }

  function render(id: string, view: CandidateView, mode: "shape" | "color") {
    const geometry = geometries.get(id)!;
    const mesh = new Mesh(geometry, mode === "shape" ? shape : color);
    scene.add(mesh);
    const target = new Vector3(...view.target);
    camera.position.copy(target).add(new Vector3(...view.toViewer).normalize().multiplyScalar(3));
    camera.up.set(0, 1, 0);
    camera.zoom = view.zoom;
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    renderer.render(scene, camera);
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    context2d.drawImage(canvas, 0, 0);
    const png = copy.toDataURL("image/png");
    scene.remove(mesh);
    return { pixels, png };
  }

  /** Per-pixel difference on the union of surface pixels, as maximum channel difference in 8-bit levels. */
  function compare(a: Uint8Array, b: Uint8Array) {
    const histogram = new Uint32Array(256);
    let surface = 0,
      coverageMismatch = 0,
      sum = 0;
    const diff = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const isSurface = (p: Uint8Array) =>
        p[4 * i] !== BACKGROUND[0] ||
        p[4 * i + 1] !== BACKGROUND[1] ||
        p[4 * i + 2] !== BACKGROUND[2];
      const sa = isSurface(a),
        sb = isSurface(b);
      if (!sa && !sb) {
        diff[4 * i + 3] = 255;
        continue;
      }
      surface++;
      if (sa !== sb) coverageMismatch++;
      const delta = Math.max(
        Math.abs(a[4 * i]! - b[4 * i]!),
        Math.abs(a[4 * i + 1]! - b[4 * i + 1]!),
        Math.abs(a[4 * i + 2]! - b[4 * i + 2]!),
      );
      histogram[delta]!++;
      sum += delta;
      // Amplified difference image (x8) for inspection.
      const v = Math.min(255, delta * 8);
      diff[4 * i] = v;
      diff[4 * i + 1] = v;
      diff[4 * i + 2] = v;
      diff[4 * i + 3] = 255;
    }
    const above = (limit: number) => {
      let n = 0;
      for (let d = limit + 1; d < 256; d++) n += histogram[d]!;
      return n / Math.max(1, surface);
    };
    let acc = 0,
      p99 = 0,
      max = 0;
    for (let d = 0; d < 256; d++) {
      if (histogram[d]) max = d;
      acc += histogram[d]!;
      if (!p99 && acc >= 0.99 * surface) p99 = d;
    }
    const image = new ImageData(diff, width, height);
    context2d.putImageData(image, 0, 0);
    const diffPng = copy.toDataURL("image/png");
    return {
      surfacePixels: surface,
      coverageMismatchPixels: coverageMismatch,
      meanLevels: sum / Math.max(1, surface),
      p99Levels: p99,
      maxLevels: max,
      fractionAbove2: above(2),
      fractionAbove8: above(8),
      fractionAbove16: above(16),
      diffPng,
    };
  }

  return {
    add,
    render,
    compare,
    info: { width, height, samples },
    dispose() {
      geometries.forEach((g) => g.dispose());
      shape.dispose();
      color.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
