import {
  AmbientLight,
  Box3,
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
  type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { generateBoundaryMesh } from "@gamut-plane/render/internal/spatial";
import { createBoundaryUpload } from "./uploadGeometry";
import { createColorMaterial } from "./colorMaterial";
import { createLineLayer, type LineLayer } from "./lineLayer";
import { createBodyProbe, isOccluded } from "./occlusion";
import { createSilhouetteTopology, extractSilhouette, type SilhouetteTopology } from "./silhouette";
import { backingSize, fitCamera, homeCamera, setCameraAspect } from "./spatialCamera";

export type SpatialGamut = "srgb" | "display-p3";
export type SpatialMode = "shape" | "color";
/** One opaque surface; the other gamut is an optional reference outline. */
export interface SpatialState {
  active: SpatialGamut;
  compare: boolean;
  mode: SpatialMode;
}
export type SpatialStatus = "ready" | "lost" | "unavailable" | "disposed";
export interface SpatialLabel {
  id: "L" | "+a" | "-a" | "+b" | "-b" | "black";
  x: number;
  y: number;
  /** Farther from the viewer than the scene center; presentation depth cue only. */
  far: boolean;
  /** False when the focused body hides the anchor from the viewer. */
  shown: boolean;
}
export const SPATIAL_SUBDIVISIONS = 64;
const gamuts = ["srgb", "display-p3"] as const;
const AXIS_REACH = 0.47;
const labelAnchors = [
  { id: "L", point: new Vector3(0, 1.04, 0) },
  { id: "+a", point: new Vector3(AXIS_REACH, 0, 0) },
  { id: "-a", point: new Vector3(-AXIS_REACH, 0, 0) },
  { id: "+b", point: new Vector3(0, 0, AXIS_REACH) },
  { id: "-b", point: new Vector3(0, 0, -AXIS_REACH) },
  { id: "black", point: new Vector3(0, 0, 0) },
] as const;
/** Silhouette capacity per reference mesh; excess edges are dropped and reported. */
const SILHOUETTE_CAPACITY = 16384;
// CSS-pixel widths and solid colors. Hierarchy: surface > outline > stippled outline behind it.
const outlineStyle = { color: 0xa9cadc, width: 1.75 };
const hiddenOutlineStyle = { color: 0x8aa4b5, width: 1.25, dash: { on: 5, off: 4 } };
const axisStyle = { color: 0x697582, width: 1.25 };

/** Explicit mounted ownership. Importing this module allocates no browser/GPU resources. */
export function createSpatialScene(
  canvas: HTMLCanvasElement,
  onStatus: (status: SpatialStatus) => void,
  onFrame: (labels: readonly SpatialLabel[], scale: number, frames: number) => void = () => {},
) {
  const cleanups: (() => void)[] = [];
  const own = <T extends { dispose(): void }>(resource: T): T => {
    cleanups.push(() => resource.dispose());
    return resource;
  };
  const release = () => {
    while (cleanups.length) cleanups.pop()!();
  };
  try {
    const start = performance.now();
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      powerPreference: "low-power",
    });
    if (!gl) {
      onStatus("unavailable");
      return null;
    }
    const contextLoss = gl.getExtension("WEBGL_lose_context");
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const gpuRenderer = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
      : "unavailable";
    const samples = Number(gl.getParameter(gl.SAMPLES));
    const gpuTimerAvailable = !!gl.getExtension("EXT_disjoint_timer_query_webgl2");
    cleanups.push(() => contextLoss?.loseContext());
    const renderer = own(new WebGLRenderer({ canvas, context: gl }));
    renderer.outputColorSpace = SRGBColorSpace;
    gl.drawingBufferColorSpace = "srgb";
    renderer.toneMapping = NoToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setClearColor(0x191d22, 1);
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 0.71, -0.71, 0.01, 20);
    const controls = own(new OrbitControls(camera, canvas));
    let connected = true;
    const enableControls = (enabled: boolean) => {
      controls.enabled = enabled;
      if (connected === enabled) return;
      if (enabled) controls.connect(canvas);
      else controls.disconnect();
      connected = enabled;
    };
    controls.enableDamping = false;
    controls.minZoom = 0.25;
    controls.maxZoom = 12;
    controls.screenSpacePanning = true;
    controls.zoomToCursor = true;
    homeCamera(camera, controls.target);
    controls.update();

    const shape = own(new MeshLambertMaterial({ color: 0xa8b0b8 }));
    const color = own(createColorMaterial());
    scene.add(new AmbientLight(0xffffff, 0.85));
    const key = new DirectionalLight(0xffffff, 1.65);
    key.position.set(-1, 2, 3);
    scene.add(key);

    const lineLayers: LineLayer[] = [];
    const addLayer = (layer: LineLayer) => {
      lineLayers.push(layer);
      own(layer);
      scene.add(...layer.objects);
      return layer;
    };
    const resources = gamuts.map((space) => {
      const before = performance.now();
      const generated = generateBoundaryMesh({
        space,
        subdivisions: SPATIAL_SUBDIVISIONS,
        distribution: "cubic",
      });
      if (!generated.ok) throw new Error(`Spatial geometry: ${generated.error}`);
      const scientific = generated.value;
      const generationMs = performance.now() - before;
      const uploadStart = performance.now();
      const upload = own(createBoundaryUpload(scientific));
      const surface = new Mesh<BufferGeometry, Material>(upload.geometry, shape);
      scene.add(surface);
      const silhouette = addLayer(
        createLineLayer({
          capacity: SILHOUETTE_CAPACITY,
          visible: outlineStyle,
          hidden: hiddenOutlineStyle,
          renderOrder: 3,
        }),
      );
      return {
        space,
        scientific,
        upload,
        surface,
        probe: createBodyProbe(space),
        silhouette,
        topology: null as SilhouetteTopology | null,
        silhouetteTruncated: false,
        generationMs,
        uploadMs: performance.now() - uploadStart,
      };
    });
    const axes = addLayer(
      createLineLayer({ capacity: 7, visible: axisStyle, hidden: null, renderOrder: 5 }),
    );
    axes.buffer.set([
      -0.45, 0, 0, 0.45, 0, 0, 0, 0, -0.45, 0, 0, 0.45, 0, 0, 0, 0, 1.04, 0, -0.01, 0.25, 0, 0.01,
      0.25, 0, -0.01, 0.5, 0, 0.01, 0.5, 0, -0.01, 0.75, 0, 0.01, 0.75, 0, -0.01, 1, 0, 0.01, 1, 0,
    ]);
    axes.commit(7);
    axes.setEnabled(true);
    let state: SpatialState = { active: "srgb", compare: true, mode: "shape" };
    let width = 0,
      height = 0,
      frame: number | null = null,
      frames = 0;
    let visible = true,
      lost = false,
      disposed = false;
    let renderCpuMs = 0;
    let backing = backingSize(0, 0, 1);
    let shaderFailed = false;
    const viewDirection = new Vector3();
    const silhouetteView = new Vector3(NaN, NaN, NaN);
    let silhouetteDirty = true;
    renderer.debug.onShaderError = () => {
      shaderFailed = true;
    };
    const cancel = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };
    const invalidate = () => {
      if (frame === null && !disposed && !lost && visible && width > 0 && height > 0)
        frame = requestAnimationFrame(render);
    };
    const referenceResource = () =>
      state.compare ? resources.find((item) => item.space !== state.active) : undefined;
    /** Outline of the reference mesh for the current view direction; orthographic, so one vector. */
    function refreshSilhouette() {
      const item = referenceResource();
      if (!item) return;
      camera.getWorldDirection(viewDirection).negate();
      if (!silhouetteDirty && viewDirection.equals(silhouetteView)) return;
      silhouetteView.copy(viewDirection);
      silhouetteDirty = false;
      item.topology ??= createSilhouetteTopology(item.scientific);
      const result = extractSilhouette(
        item.topology,
        item.scientific.positions,
        [viewDirection.x, viewDirection.y, viewDirection.z],
        item.silhouette.buffer,
      );
      item.silhouetteTruncated = result.truncated;
      item.silhouette.commit(result.segments);
    }
    function render() {
      frame = null;
      if (disposed || lost || !visible || width <= 0 || height <= 0) return;
      const before = performance.now();
      try {
        refreshSilhouette();
        renderer.render(scene, camera);
      } catch {
        shaderFailed = true;
      }
      if (shaderFailed) {
        dispose();
        onStatus("unavailable");
        return;
      }
      renderCpuMs = performance.now() - before;
      frames++;
      const origin = new Vector3().project(camera);
      const center = controls.target.clone().project(camera);
      camera.getWorldDirection(viewDirection).negate();
      const toViewer = [viewDirection.x, viewDirection.y, viewDirection.z] as const;
      const body = resources.find((item) => item.space === state.active)!.probe;
      const labels = labelAnchors.map(({ id, point }) => {
        const p = point.clone().project(camera);
        let x = ((p.x + 1) * width) / 2;
        let y = ((1 - p.y) * height) / 2;
        // Offset beyond the tip, away from the origin on screen. Black sits below its point.
        let dx = 0,
          dy = 0;
        if (id === "black") dy = 34;
        else {
          dx = ((p.x - origin.x) * width) / 2;
          dy = (-(p.y - origin.y) * height) / 2;
          const length = Math.hypot(dx, dy) || 1;
          dx = (dx / length) * 15;
          dy = (dy / length) * 15;
        }
        x += dx;
        y += dy;
        // Opponent-axis ends can sit behind the focused body; never label through the color field.
        const axisEnd = id !== "L" && id !== "black";
        const shown = !axisEnd || !isOccluded(body, [point.x, point.y, point.z], toViewer);
        return { id, x, y, far: p.z > center.z, shown };
      });
      onFrame(labels, (0.1 * height * camera.zoom) / (camera.top - camera.bottom), frames);
    }
    const update = (next: SpatialState) => {
      if (disposed) return;
      state = { active: next.active, compare: next.compare, mode: next.mode };
      resources.forEach((item) => {
        const active = state.active === item.space;
        item.surface.visible = active;
        item.surface.material = state.mode === "shape" ? shape : color;
        item.silhouette.setEnabled(state.compare && !active);
      });
      silhouetteDirty = true;
      invalidate();
    };
    controls.addEventListener("change", invalidate);
    const onLost = (event: Event) => {
      event.preventDefault();
      lost = true;
      cancel();
      enableControls(false);
      onStatus("lost");
    };
    const onRestored = () => {
      if (disposed) return;
      lost = false;
      gl.drawingBufferColorSpace = "srgb";
      enableControls(visible && width > 0 && height > 0);
      onStatus("ready");
      invalidate();
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    const keydown = (event: KeyboardEvent) => {
      if (!controls.enabled) return;
      if (event.key === "Home") {
        event.preventDefault();
        home();
      } else if (["+", "=", "-"].includes(event.key)) {
        event.preventDefault();
        camera.zoom = Math.min(12, Math.max(0.25, camera.zoom * (event.key === "-" ? 0.8 : 1.25)));
        camera.updateProjectionMatrix();
        invalidate();
      } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault();
        const dx = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
        const dy = event.key === "ArrowDown" ? -1 : event.key === "ArrowUp" ? 1 : 0;
        if (event.shiftKey) {
          const delta = new Vector3(dx, dy, 0)
            .applyQuaternion(camera.quaternion)
            .multiplyScalar(0.04 / camera.zoom);
          camera.position.add(delta);
          controls.target.add(delta);
        } else {
          const offset = camera.position.clone().sub(controls.target);
          offset.applyAxisAngle(new Vector3(0, 1, 0), -dx * 0.12);
          const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
          offset.applyAxisAngle(right, dy * 0.12);
          camera.position.copy(controls.target).add(offset);
        }
        controls.update();
        invalidate();
      }
    };
    canvas.addEventListener("keydown", keydown);
    function dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      controls.removeEventListener("change", invalidate);
      canvas.removeEventListener("keydown", keydown);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      scene.clear();
      release();
      onStatus("disposed");
    }
    function home() {
      if (disposed) return;
      homeCamera(camera, controls.target);
      controls.update();
      invalidate();
    }
    update(state);
    const initializationMs = performance.now() - start;
    onStatus("ready");
    return {
      update,
      home,
      fit() {
        if (disposed) return;
        const bounds = new Box3();
        resources
          .filter((item) => item.space === state.active || state.compare)
          .forEach((item) => bounds.union(item.upload.geometry.boundingBox!));
        fitCamera(camera, controls.target, bounds);
        controls.update();
        invalidate();
      },
      resize(nextWidth: number, nextHeight: number, dpr: number) {
        if (disposed) return;
        width = Math.max(0, nextWidth);
        height = Math.max(0, nextHeight);
        backing = backingSize(width, height, dpr);
        enableControls(!lost && visible && width > 0 && height > 0);
        if (!controls.enabled) cancel();
        if (width <= 0 || height <= 0) return;
        // Keep a common pixels-per-unit across axes, even after rounded backing dimensions.
        renderer.setPixelRatio(1);
        renderer.setSize(backing.width, backing.height, false);
        setCameraAspect(camera, width / height);
        // Line widths are CSS pixels; the drawing buffer may be denser.
        lineLayers.forEach((layer) =>
          layer.setViewport(backing.width, backing.height, backing.ratio),
        );
        invalidate();
      },
      setVisible(value: boolean) {
        visible = value;
        enableControls(!disposed && !lost && visible && width > 0 && height > 0);
        if (!value) cancel();
        else invalidate();
      },
      restore() {
        if (!disposed && lost) contextLoss?.restoreContext();
      },
      inspect() {
        const reference = referenceResource();
        return {
          frames,
          pendingFrame: frame !== null,
          disposed,
          lost,
          width,
          height,
          backing,
          state,
          camera: {
            position: camera.position.toArray(),
            target: controls.target.toArray(),
            zoom: camera.zoom,
            projection: camera.projectionMatrix.toArray(),
            view: camera.matrixWorldInverse.toArray(),
          },
          initializationMs,
          renderCpuMs,
          drawCalls: renderer.info.render.calls,
          triangles: renderer.info.render.triangles,
          geometries: renderer.info.memory.geometries,
          programs: renderer.info.programs?.length ?? 0,
          gpuRenderer,
          samples,
          gpuTimerAvailable,
          framebufferBytesEstimate:
            backing.width * backing.height * (8 * Math.max(samples, 1) + (samples > 1 ? 4 : 0)),
          drawingBufferColorSpace: "srgb",
          reference: reference
            ? {
                space: reference.space,
                silhouetteSegments: reference.silhouette.segments,
                silhouetteTruncated: reference.silhouetteTruncated,
              }
            : null,
          resources: resources.map((item) => ({
            space: item.space,
            generationMs: item.generationMs,
            uploadMs: item.uploadMs,
            scientificBytes: item.scientific.quality.bufferBytes,
            gpuBufferBytes: item.upload.bufferBytes,
            lineBufferBytes: SILHOUETTE_CAPACITY * 24,
            mappingBytes: item.upload.mappingBytes,
            logicalVertices: item.scientific.positions.length / 3,
            uploadVertices: item.upload.logicalVertices.length,
          })),
        };
      },
      dispose,
    };
  } catch {
    release();
    onStatus("unavailable");
    return null;
  }
}
export type SpatialScene = NonNullable<ReturnType<typeof createSpatialScene>>;
