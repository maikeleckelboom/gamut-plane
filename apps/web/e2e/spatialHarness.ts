import {
  BufferAttribute,
  BufferGeometry,
  FloatType,
  Mesh,
  NoToneMapping,
  OrthographicCamera,
  Scene,
  WebGLRenderTarget,
  WebGLRenderer,
} from "three";
import { createColorMaterial } from "../src/spatial/colorMaterial";
import { createSpatialScene } from "../src/spatial/spatialScene";
import { createSectionStore } from "../src/spatial/sectionModel";
import {
  referenceBytes,
  referenceLab,
  referenceLinear,
  type Triple,
} from "../test/spatialReference";

/** A real section for a mounted scene: exactly what the host computes and hands over. */
export function sectionInput(lightness: number) {
  const store = createSectionStore();
  return { lightness, outcomes: store.outcomes(lightness) };
}

export function mountHarness() {
  const canvas = document.createElement("canvas");
  canvas.tabIndex = 0;
  canvas.style.cssText = "width:900px;height:700px;display:block";
  document.body.append(canvas);
  // The controller owns canvas/document listeners, including OrbitControls' document capture.
  // Window resize belongs to the Vue host (spatialHost.test.ts); Playwright installs its own
  // window instrumentation during native actions, outside this controller's ownership.
  const registrations: {
    target: EventTarget;
    type: string;
    listener: EventListenerOrEventListenerObject | null;
    capture: boolean;
  }[] = [];
  const add = EventTarget.prototype.addEventListener,
    remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    const capture = typeof options === "boolean" ? options : (options?.capture ?? false);
    if (
      [canvas, document].includes(this as typeof canvas) &&
      !registrations.some(
        (r) =>
          r.target === this && r.type === type && r.listener === listener && r.capture === capture,
      )
    )
      registrations.push({ target: this, type, listener, capture });
    return add.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    const capture = typeof options === "boolean" ? options : (options?.capture ?? false);
    const index = registrations.findIndex(
      (r) =>
        r.target === this && r.type === type && r.listener === listener && r.capture === capture,
    );
    if (index >= 0) registrations.splice(index, 1);
    return remove.call(this, type, listener, options);
  };
  const statuses: string[] = [];
  const controller = createSpatialScene(canvas, (status) => statuses.push(status));
  if (!controller) throw new Error("WebGL2 required for qualification");
  controller.resize(900, 700, 1);
  const gl = canvas.getContext("webgl2")!;
  const loss = gl.getExtension("WEBGL_lose_context")!;
  return {
    controller,
    canvas,
    statuses,
    listenerCount: () => registrations.length,
    listenerDetails: () =>
      registrations.map((item) => ({
        target:
          item.target === canvas ? "canvas" : item.target === document ? "document" : "window",
        type: item.type,
        name: typeof item.listener === "function" ? item.listener.name : "object",
        capture: item.capture,
      })),
    releaseAudit: () => {
      EventTarget.prototype.addEventListener = add;
      EventTarget.prototype.removeEventListener = remove;
    },
    lose: () => loss.loseContext(),
    restore: () => controller.restore(),
  };
}

export function colorProbes(output: "srgb" | "display-p3") {
  const canvas = document.createElement("canvas");
  const renderer = new WebGLRenderer({ canvas, antialias: false });
  const gl = renderer.getContext();
  renderer.setSize(65, 65, false);
  renderer.toneMapping = NoToneMapping;
  renderer.toneMappingExposure = 1;
  let granted: string = "unsupported";
  try {
    gl.drawingBufferColorSpace = output;
    granted = gl.drawingBufferColorSpace;
  } catch {
    /* Unsupported P3 remains unqualified. */
  }
  const scene = new Scene(),
    camera = new OrthographicCamera();
  const material = createColorMaterial(output);
  // Only replace clip positioning. Production coordinate varying and fragment conversion are retained.
  material.vertexShader = material.vertexShader
    .replace("in vec3 position;", "in vec3 position; in vec3 clipPosition;")
    .replace("projectionMatrix * modelViewMatrix * vec4(position, 1.0)", "vec4(clipPosition, 1.0)");
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(9), 3));
  // Fullscreen triangle has weights (0.5, 0.25, 0.25) at the center pixel.
  geometry.setAttribute(
    "clipPosition",
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  const object = new Mesh(geometry, material);
  object.frustumCulled = false;
  scene.add(object);
  const fixtures: { name: string; lab: Triple[] }[] = [];
  for (const space of ["srgb", "display-p3"] as const)
    for (const rgb of [
      [0, 0, 0],
      [1, 1, 1],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 1, 0],
      [1, 0, 1],
      [0, 1, 1],
      [1e-8, 0, 1e-5],
      [0.0031308, 0.0031308, 0.0031308],
      [0.18, 0.18, 0.18],
    ]) {
      const lab = referenceLab(rgb, space);
      fixtures.push({ name: `${space}:${rgb.join(",")}`, lab: [lab, lab, lab] });
    }
  fixtures.push({
    name: "interpolated-oklab-not-rgb",
    lab: [
      [0.45, 0.25, 0.12],
      [0.8, -0.2, 0.15],
      [0.3, 0.05, -0.3],
    ],
  });
  fixtures.push({
    name: "extended-negative-and-over-one",
    lab: [
      [1.1, 0.3, -0.2],
      [1.1, 0.3, -0.2],
      [1.1, 0.3, -0.2],
    ],
  });
  const floatSupported = !!gl.getExtension("EXT_color_buffer_float");
  const target = floatSupported
    ? new WebGLRenderTarget(65, 65, { type: FloatType, depthBuffer: false })
    : null;
  const linearMaterial = material.clone();
  linearMaterial.fragmentShader = material.fragmentShader.replace(
    "vec4(encode(linearRgb), 1.0)",
    "vec4(linearRgb, 1.0)",
  );
  const rows = fixtures.map((fixture) => {
    const position = geometry.getAttribute("position");
    fixture.lab.forEach(([l, a, b], i) => position.setXYZ(i, a, l, b));
    position.needsUpdate = true;
    const interpolated = [0, 1, 2].map((axis) =>
      fixture.lab.reduce((sum, lab, i) => sum + lab[axis]! * [0.5, 0.25, 0.25][i]!, 0),
    ) as Triple;
    const expected = referenceBytes(interpolated, output);
    object.material = material;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    const bytes = new Uint8Array(4);
    gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    let raw: number[] | null = null;
    if (target) {
      object.material = linearMaterial;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const values = new Float32Array(4);
      renderer.readRenderTargetPixels(target, 32, 32, 1, 1, values);
      raw = Array.from(values).slice(0, 3);
    }
    return {
      name: fixture.name,
      lab: interpolated,
      expected,
      bytes: Array.from(bytes).slice(0, 3),
      raw,
      expectedLinear: referenceLinear(interpolated, output),
    };
  });
  renderer.setRenderTarget(null);
  const debug = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : "unavailable";
  // Reverse the production front-face convention: a back-facing patch must be culled.
  renderer.setClearColor(0x000000, 1);
  object.material = material;
  geometry.setIndex([0, 2, 1]);
  renderer.render(scene, camera);
  const backface = new Uint8Array(4);
  gl.readPixels(32, 32, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, backface);
  const error = gl.getError();
  geometry.dispose();
  material.dispose();
  linearMaterial.dispose();
  target?.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return {
    output,
    granted,
    floatSupported,
    gpu,
    error,
    backface: Array.from(backface),
    wideGamutMedia: matchMedia("(color-gamut: p3)").matches,
    rows,
  };
}
