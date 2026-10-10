import {
  AmbientLight,
  Box3,
  BufferGeometry,
  DirectionalLight,
  Mesh,
  MeshLambertMaterial,
  NoToneMapping,
  OrthographicCamera,
  Plane,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { generateRadialBoundaryMesh } from "@gamut-plane/render/internal/spatial";
import { createBoundaryUpload } from "./uploadGeometry";
import { createColorMaterial } from "./colorMaterial";
import { createLineLayer, type LineLayer } from "./lineLayer";
import { createBodyProbe, isOccluded } from "./occlusion";
import { createSilhouetteTopology, extractSilhouette, type SilhouetteTopology } from "./silhouette";
import {
  backingSize,
  fitCamera,
  homeCamera,
  sectionCamera,
  setCameraAspect,
  SECTION_FOOTPRINT,
} from "./spatialCamera";
import {
  createMarkerLayer,
  createSectionCap,
  createSectionLayers,
  SECTION_CAPACITY,
  writeContour,
  writeFootprint,
  writeStem,
} from "./sectionLayers";
import {
  clipSegmentsToRemoved,
  cutSide,
  drawnSolid,
  isFaceOn,
  isHiddenByCap,
  isPointHidden,
  type CutSide,
} from "./sectionPolicy";
import type { SectionGamut, SectionOutcomes } from "./sectionModel";

export type SpatialGamut = "srgb" | "display-p3";
export type SpatialMode = "shape" | "color";
/** One opaque surface; the other gamut is an optional reference outline. */
export interface SpatialState {
  active: SpatialGamut;
  compare: boolean;
  mode: SpatialMode;
  /** Presentation only: remove the part of the focused body on the viewer's side of the section. */
  cut: boolean;
}
export type SpatialStateInput = Pick<SpatialState, "active" | "compare" | "mode"> &
  Partial<Pick<SpatialState, "cut">>;
/** The active section, as computed by the host. The scene draws it; it never computes or edits one. */
export interface SpatialSection {
  readonly lightness: number | null;
  readonly outcomes: SectionOutcomes | null;
}
/** Scene coordinates of the selected color: [a, L, b]. */
export type SpatialMarker = readonly [number, number, number] | null;
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
/** Per-frame facts the host cannot derive from state alone. */
export interface SpatialFrameInfo {
  /** The section plane's value tag, anchored at its rightmost footprint corner. Null without a section. */
  plane: { x: number; y: number } | null;
  /** The marker is behind the drawn body. Null without a marker. Presentation only, not membership. */
  markerHidden: boolean | null;
  /** The marker projects inside the viewport. Null without a marker. */
  markerInView: boolean | null;
  cutSide: CutSide;
  /** The view is within 20 degrees of the section normal: the section is shown on its own. */
  sectionOnly: boolean;
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
const noSection: SpatialSection = { lightness: null, outcomes: null };
const STAGE_COLOR = 0x191d22;

/** Explicit mounted ownership. Importing this module allocates no browser/GPU resources. */
export function createSpatialScene(
  canvas: HTMLCanvasElement,
  onStatus: (status: SpatialStatus) => void,
  onFrame: (
    labels: readonly SpatialLabel[],
    scale: number,
    frames: number,
    info: SpatialFrameInfo,
  ) => void = () => {},
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
    renderer.localClippingEnabled = true;
    renderer.setClearColor(STAGE_COLOR, 1);
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
    // One clipping plane is always present so the program never changes when the cut toggles.
    const cutPlane = new Plane(new Vector3(0, 1, 0), 10);
    shape.clippingPlanes = [cutPlane];
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
      const generated = generateRadialBoundaryMesh({
        space,
        subdivisions: SPATIAL_SUBDIVISIONS,
        upperKnots: "encoded",
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
        /** Unclipped silhouette of this mesh for the current view, used for the cut's ghost outline. */
        ghostRaw: null as Float32Array | null,
        ghostRawCount: 0,
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
    const sectionLines = createSectionLayers({ scene, add: addLayer });
    const cap = own(createSectionCap());
    scene.add(cap.mesh);
    const marker = own(createMarkerLayer());
    scene.add(...marker.objects);
    let state: SpatialState = { active: "srgb", compare: true, mode: "shape", cut: true };
    let section: SpatialSection = noSection;
    // Changes only when new geometry is written, so equal results are never uploaded twice.
    const written: Record<SectionGamut, object | null> = { srgb: null, "display-p3": null };
    const uploads = { contours: 0, footprint: 0, marker: 0 };
    let footprintLevel: number | null = null;
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
    // Cache keys for the removed part's outline: the raw silhouette depends on the focused gamut and
    // the view; its clipped copy additionally on the cut side and level.
    let ghostRawKey = "";
    let ghostClipKey = "";
    let ghostSegments = 0;
    let currentCut: CutSide = 0;
    let sectionOnly = false;
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
    const focusedResource = () => resources.find((item) => item.space === state.active)!;
    const focusedRegion = () => {
      const outcome = section.outcomes?.[state.active];
      return outcome?.status === "ready" && outcome.section.kind === "region";
    };
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
    /** Writes the lines and fill for the current section. Runs when the section result changes. */
    function applySection() {
      const level = section.lightness;
      const outcomeOf = (space: SectionGamut) => {
        const outcome = section.outcomes?.[space];
        return outcome?.status === "ready" ? outcome.section : null;
      };
      for (const space of gamuts) {
        const next = outcomeOf(space);
        if (written[space] === next) continue;
        written[space] = next;
        writeContour(sectionLines.contours[space], next);
        uploads.contours++;
      }
      const planeLevel = level !== null && section.outcomes !== null ? level : null;
      if (planeLevel !== footprintLevel) {
        footprintLevel = planeLevel;
        writeFootprint(sectionLines.footprint, planeLevel);
        uploads.footprint++;
      }
      if (level !== null) cap.setLevel(level);
      applyVisibility();
    }
    /** Enabled flags only: no geometry is written. */
    function applyVisibility() {
      for (const space of gamuts)
        sectionLines.contours[space].setEnabled(space === state.active || state.compare);
      sectionLines.footprint.setEnabled(section.lightness !== null && section.outcomes !== null);
      cap.setGamut(state.active);
      cap.setColor(state.mode === "color");
      cap.mesh.visible = focusedRegion();
      marker.set(markerPoint);
      applyStem();
    }
    let markerPoint: SpatialMarker = null;
    /** Drop line from the marker to the plane when the section is at another lightness. */
    function applyStem() {
      writeStem(
        sectionLines.stem,
        markerPoint,
        section.outcomes !== null ? section.lightness : null,
      );
      sectionLines.stem.setEnabled(true);
    }
    /** Cut uniforms and the ghost outline of the removed part. Depends on view, level and policy. */
    function refreshCut() {
      const level = section.lightness;
      const side: CutSide =
        level !== null && focusedRegion() ? cutSide(viewDirection.y, state.cut) : 0;
      currentCut = side;
      color.uniforms.clipSide!.value = side;
      color.uniforms.clipLevel!.value = level ?? 0.5;
      if (side === 0) cutPlane.set(new Vector3(0, 1, 0), 10);
      else if (side === 1) cutPlane.set(new Vector3(0, -1, 0), level!);
      else cutPlane.set(new Vector3(0, 1, 0), -level!);
      // Looking along the lightness axis the near body, the L axis and its labels all project onto
      // the section. Present the section on its own there: no body, no axes, the whole silhouette.
      sectionOnly = side !== 0 && isFaceOn(viewDirection.y);
      const item = focusedResource();
      item.surface.visible = !sectionOnly;
      axes.setEnabled(!sectionOnly);
      if (side === 0 || level === null) {
        if (ghostSegments !== 0) {
          sectionLines.ghost.commit(0);
          ghostSegments = 0;
        }
        sectionLines.ghost.setEnabled(false);
        ghostClipKey = "";
        return;
      }
      const viewKey = `${state.active}|${viewDirection.x}|${viewDirection.y}|${viewDirection.z}`;
      if (item.ghostRaw === null || ghostRawKey !== viewKey) {
        item.topology ??= createSilhouetteTopology(item.scientific);
        item.ghostRaw ??= new Float32Array(SILHOUETTE_CAPACITY * 6);
        item.ghostRawCount = extractSilhouette(
          item.topology,
          item.scientific.positions,
          [viewDirection.x, viewDirection.y, viewDirection.z],
          item.ghostRaw,
        ).segments;
        ghostRawKey = viewKey;
        ghostClipKey = "";
      }
      const clipKey = sectionOnly ? "whole" : `${side}|${level}`;
      if (ghostClipKey !== clipKey) {
        ghostClipKey = clipKey;
        if (sectionOnly) {
          // The body is not drawn, so its whole silhouette is the extent of the gamut seen end-on.
          sectionLines.ghost.buffer.set(item.ghostRaw.subarray(0, item.ghostRawCount * 6));
          ghostSegments = item.ghostRawCount;
        } else
          ghostSegments = clipSegmentsToRemoved(
            item.ghostRaw,
            item.ghostRawCount,
            side,
            level,
            sectionLines.ghost.buffer,
          );
        sectionLines.ghost.commit(ghostSegments);
      }
      sectionLines.ghost.setEnabled(true);
    }
    function render() {
      frame = null;
      if (disposed || lost || !visible || width <= 0 || height <= 0) return;
      const before = performance.now();
      try {
        refreshSilhouette();
        camera.getWorldDirection(viewDirection).negate();
        refreshCut();
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
      const toViewer = [viewDirection.x, viewDirection.y, viewDirection.z] as const;
      const level = section.lightness;
      const inside = focusedResource().probe;
      const solid = drawnSolid(inside, currentCut, level ?? 0);
      const endOn = isFaceOn(viewDirection.y);
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
        // End-on, the L labels sit on the section itself and are left out.
        const shown = axisEnd
          ? !isOccluded(solid, [point.x, point.y, point.z], toViewer)
          : !(endOn && currentCut !== 0);
        return { id, x, y, far: p.z > center.z, shown };
      });
      let plane: SpatialFrameInfo["plane"] = null;
      if (level !== null && section.outcomes !== null) {
        // Tag the plane at its footprint corner farthest to the right so the text extends outward.
        let best = -Infinity;
        for (const [cx, cz] of [
          [-SECTION_FOOTPRINT, -SECTION_FOOTPRINT],
          [SECTION_FOOTPRINT, -SECTION_FOOTPRINT],
          [SECTION_FOOTPRINT, SECTION_FOOTPRINT],
          [-SECTION_FOOTPRINT, SECTION_FOOTPRINT],
        ] as const) {
          const p = new Vector3(cx, level, cz).project(camera);
          if (p.x > best) {
            best = p.x;
            // Keep the tag inside the stage when the footprint is partly out of view.
            plane = {
              x: Math.min(Math.max(((p.x + 1) * width) / 2, 8), width - 76),
              y: Math.min(Math.max(((1 - p.y) * height) / 2, 14), height - 14),
            };
          }
        }
      }
      let markerHidden: boolean | null = null;
      let markerInView: boolean | null = null;
      if (markerPoint) {
        markerHidden = sectionOnly
          ? isHiddenByCap(inside, markerPoint, toViewer, currentCut, level ?? 0)
          : isPointHidden(solid, markerPoint, toViewer);
        const p = new Vector3(...markerPoint).project(camera);
        markerInView = Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
      }
      onFrame(labels, (0.1 * height * camera.zoom) / (camera.top - camera.bottom), frames, {
        plane,
        markerHidden,
        markerInView,
        cutSide: currentCut,
        sectionOnly,
      });
    }
    const update = (next: SpatialStateInput) => {
      if (disposed) return;
      state = {
        active: next.active,
        compare: next.compare,
        mode: next.mode,
        cut: next.cut ?? true,
      };
      resources.forEach((item) => {
        const active = state.active === item.space;
        item.surface.visible = active;
        item.surface.material = state.mode === "shape" ? shape : color;
        item.silhouette.setEnabled(state.compare && !active);
      });
      silhouetteDirty = true;
      ghostRawKey = "";
      ghostClipKey = "";
      applyVisibility();
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
      // Three rebuilds its background state when the context is restored, which drops the clear
      // color to black; the stage color is part of the scene and is set again.
      renderer.setClearColor(STAGE_COLOR, 1);
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
    /** Union of the in-plane extents of the visible sections and the marker, or null. */
    function sectionExtent() {
      let minA = Infinity,
        minB = Infinity,
        maxA = -Infinity,
        maxB = -Infinity;
      for (const space of gamuts) {
        if (space !== state.active && !state.compare) continue;
        const outcome = section.outcomes?.[space];
        if (outcome?.status !== "ready" || !outcome.section.bounds) continue;
        const { min, max } = outcome.section.bounds;
        minA = Math.min(minA, min[0]);
        minB = Math.min(minB, min[1]);
        maxA = Math.max(maxA, max[0]);
        maxB = Math.max(maxB, max[1]);
      }
      if (markerPoint) {
        minA = Math.min(minA, markerPoint[0]);
        maxA = Math.max(maxA, markerPoint[0]);
        minB = Math.min(minB, markerPoint[2]);
        maxB = Math.max(maxB, markerPoint[2]);
      }
      return Number.isFinite(minA) ? ({ min: [minA, minB], max: [maxA, maxB] } as const) : null;
    }
    update(state);
    const initializationMs = performance.now() - start;
    onStatus("ready");
    return {
      update,
      /** Draw this section. Only a changed result writes line geometry. */
      setSection(next: SpatialSection) {
        if (disposed) return;
        section = next;
        applySection();
        ghostClipKey = "";
        invalidate();
      },
      /** Move the marker to the color's scene coordinates [a, L, b]; null removes it. */
      setMarker(point: SpatialMarker) {
        if (disposed) return;
        markerPoint = point ? ([point[0], point[1], point[2]] as const) : null;
        marker.set(markerPoint);
        applyStem();
        uploads.marker++;
        invalidate();
      },
      home,
      /**
       * Align the camera with the section: a to the right, b up, as in the OKLab editor. The camera
       * looks along +L from below the plane (see `sectionCamera`). Presentation only.
       */
      viewSection() {
        if (disposed) return;
        sectionCamera(camera, controls.target, section.lightness ?? 0.5, sectionExtent());
        controls.update();
        invalidate();
      },
      fit() {
        if (disposed) return;
        const bounds = new Box3();
        resources
          .filter((item) => item.space === state.active || state.compare)
          .forEach((item) => bounds.union(item.upload.geometry.boundingBox!));
        if (markerPoint) bounds.expandByPoint(new Vector3(...markerPoint));
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
        marker.setViewport(backing.width, backing.height, backing.ratio);
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
          section: {
            lightness: section.lightness,
            capVisible: cap.mesh.visible,
            cutSide: currentCut,
            segments: {
              srgb: sectionLines.contours.srgb.segments,
              "display-p3": sectionLines.contours["display-p3"].segments,
            },
            ghostSegments,
            footprintSegments: sectionLines.footprint.segments,
            capacity: SECTION_CAPACITY,
            uploads: { ...uploads },
            marker: marker.position,
          },
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
