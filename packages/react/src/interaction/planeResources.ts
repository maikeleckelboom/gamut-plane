import { type ColorValue, type PlanePoint } from "@gamut-plane/core";
import {
  createFieldRenderer,
  type CanvasColorSpaceStatus,
  type RenderedFieldQuality,
} from "@gamut-plane/render";
import {
  applyViewportPresentation,
  authoredMarkerPoint,
  viewportPresentation,
} from "@gamut-plane/ui";
import {
  planeWarningOffset,
  type CurrentField,
  type ReferenceDisplay,
} from "@gamut-plane/render/internal/current";
import {
  createViewportCamera,
  fieldToViewport,
  FIT_VIEWPORT,
  isFitViewport,
  MAX_VIEWPORT_ZOOM,
  MIN_VIEWPORT_ZOOM,
  sampleWindow,
  viewportDomainStyle,
  viewportPointStyle,
  viewportSvgViewBox,
  viewportToField,
  type FieldViewport,
  type ViewportCamera,
} from "@gamut-plane/render/internal/viewport";

export interface PlaneResourceInput {
  value: ColorValue;
  plane: CurrentField["plane"];
  field: CurrentField;
  interactionPreview: boolean;
  reference?: ReferenceDisplay | null | undefined;
}

/** The Reference marker's spatial facts, when it is shown on this plane. */
export function spatialReferenceOf(reference: ReferenceDisplay | null | undefined) {
  return reference?.showExcursion && reference.spatial.kind === "available"
    ? reference.spatial
    : null;
}

export interface PlaneResourceBinding {
  readonly plane: CurrentField["plane"];
  /** One camera per committed mount; `presented` is the pose all spatial layers currently show. */
  readonly camera: ViewportCamera;
  projection(value: ColorValue): CurrentField["projection"];
  activePoint(value: ColorValue): PlanePoint;
  position(point: PlanePoint): void;
  measure(): void;
  /** Re-measures and reports whether the surface can map input. */
  measured(): boolean;
  normalize(clientX: number, clientY: number): PlanePoint | null;
  extent(): Readonly<{ width: number; height: number }> | null;
  /** Reasserts the presented camera over declarative field-space values after a commit. */
  reapply(allowPosition: boolean): void;
  /** Ends camera interaction and resets to Fit when a different geometry was accepted. */
  geometryChanged(): boolean;
  point(event: PointerEvent): PlanePoint | null;
  redraw(): void;
  start(): void;
  updatePlane(): boolean;
  reconcile(allowPosition: boolean): void;
  dispose(): void;
}

/** React's committed Canvas, environment, geometry, camera, and marker binding. */
export function mountPlaneResources(
  surface: HTMLDivElement,
  canvas: HTMLCanvasElement,
  marker: HTMLSpanElement,
  current: () => PlaneResourceInput,
  onCapability: (status: CanvasColorSpaceStatus) => void,
  onQuality: (quality: RenderedFieldQuality) => void,
  onResize: () => void,
): PlaneResourceBinding {
  const renderer = createFieldRenderer(canvas, onCapability);
  let disposed = false;
  let fieldFrame: number | null = null;
  let boundsDirty = true;
  let bounds = { left: 0, top: 0, width: 0, height: 0 };
  let localSize = { width: 0, height: 0 };
  let pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  let resolution: MediaQueryList | null = null;
  let plane = current().plane;
  let geometryId = current().field.geometry.id;
  const camera = createViewportCamera({
    present: presentCamera,
    schedule: (callback) => window.requestAnimationFrame(callback),
    cancel: (handle) => window.cancelAnimationFrame(handle as number),
  });
  function projection(value: ColorValue) {
    const observed = current().field.geometry.project(value);
    if (!observed.ok) throw new RangeError("Selected color cannot be projected into the plane");
    return observed.value;
  }
  function activePoint(value: ColorValue): PlanePoint {
    return authoredMarkerPoint(current().field.geometry, projection(value).point);
  }
  function fixed(): number {
    return current().field.samplingFixed;
  }
  let fieldInput = `${current().field.geometry.id}:${fixed()}:${current().interactionPreview}`;

  function position(point: PlanePoint): void {
    const pose = camera.presented;
    Object.assign(marker.style, viewportPointStyle(pose, point));
    const offset = planeWarningOffset(fieldToViewport(pose, point), localSize);
    marker.style.setProperty("--gp-warning-offset-x", `${offset.x}px`);
    marker.style.setProperty("--gp-warning-offset-y", `${offset.y}px`);
  }

  function measure(): void {
    const box = surface.getBoundingClientRect();
    const scaleX = surface.offsetWidth ? box.width / surface.offsetWidth : 1;
    const scaleY = surface.offsetHeight ? box.height / surface.offsetHeight : 1;
    localSize = { width: surface.clientWidth, height: surface.clientHeight };
    bounds = {
      left: box.left + surface.clientLeft * scaleX,
      top: box.top + surface.clientTop * scaleY,
      width: surface.clientWidth * scaleX,
      height: surface.clientHeight * scaleY,
    };
    boundsDirty = false;
  }
  function normalize(clientX: number, clientY: number): PlanePoint | null {
    if (boundsDirty) measure();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return { x: (clientX - bounds.left) / bounds.width, y: (clientY - bounds.top) / bounds.height };
  }
  function point(event: PointerEvent): PlanePoint | null {
    const viewportPoint = normalize(event.clientX, event.clientY);
    if (viewportPoint === null) return null;
    // Inverse camera first, then the existing editor-domain constraint. Never clamp to the view.
    return current().field.geometry.constrain(viewportToField(camera.presented, viewportPoint));
  }
  function render(pose: FieldViewport): void {
    onQuality(
      renderer.draw({
        plane,
        fieldId: current().field.geometry.id,
        fixed: fixed(),
        pixelRatio,
        interactionPreview: current().interactionPreview,
        window: sampleWindow(pose),
      }),
    );
  }
  function draw(): void {
    fieldFrame = null;
    if (disposed) return;
    render(camera.presented);
  }
  function redraw(): void {
    if (!disposed && fieldFrame === null) fieldFrame = window.requestAnimationFrame(draw);
  }
  function applyOverlays(pose: FieldViewport): void {
    const root = surface.parentElement;
    if (!root) return;
    const field = current().field;
    const shown = fieldToViewport(
      pose,
      authoredMarkerPoint(field.geometry, field.projection.point),
    );
    const hidden =
      field.markerInDomain && (shown.x < 0 || shown.x > 1 || shown.y < 0 || shown.y > 1);
    const reference = spatialReferenceOf(current().reference);
    applyViewportPresentation(
      root,
      viewportPresentation({
        zoom: pose.zoom,
        minZoom: MIN_VIEWPORT_ZOOM,
        maxZoom: MAX_VIEWPORT_ZOOM,
        window: sampleWindow(pose),
        xAxis: plane.xAxis,
        yAxis: plane.yAxis,
        viewBox: viewportSvgViewBox(pose),
        reference: reference ? viewportPointStyle(pose, reference.point) : null,
        domain: viewportDomainStyle(pose),
        selectionHidden: hidden,
      }),
    );
  }
  /** The camera's only presentation route: raster and every spatial layer from one pose. */
  function presentCamera(pose: FieldViewport): void {
    if (disposed) return;
    render(pose);
    position(authoredMarkerPoint(current().field.geometry, current().field.projection.point));
    applyOverlays(pose);
  }
  function resize(): void {
    // A pan has no stable displacement across a measurement change; end it where it stands.
    onResize();
    measure();
    position(authoredMarkerPoint(current().field.geometry, current().field.projection.point));
    redraw();
  }
  function scroll(): void {
    boundsDirty = true;
  }
  function trackResolution(): void {
    resolution?.removeEventListener("change", trackResolution);
    pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    resolution = window.matchMedia(`(resolution: ${pixelRatio}dppx)`);
    resolution.addEventListener("change", trackResolution);
    redraw();
  }
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);

  return {
    get plane() {
      return plane;
    },
    camera,
    projection,
    activePoint,
    position,
    measure,
    measured() {
      measure();
      return bounds.width > 0 && bounds.height > 0;
    },
    normalize,
    extent: () =>
      bounds.width > 0 && bounds.height > 0 ? { width: bounds.width, height: bounds.height } : null,
    reapply(allowPosition) {
      if (disposed || isFitViewport(camera.presented)) return;
      if (allowPosition)
        position(authoredMarkerPoint(current().field.geometry, current().field.projection.point));
      applyOverlays(camera.presented);
    },
    geometryChanged() {
      const next = current().field.geometry.id;
      if (next === geometryId) return false;
      geometryId = next;
      if (isFitViewport(camera.presented)) camera.discardPending();
      else camera.fit();
      return true;
    },
    point,
    redraw,
    start() {
      observer?.observe(surface);
      window.addEventListener("scroll", scroll, { capture: true, passive: true });
      window.addEventListener("resize", resize);
      measure();
      // A re-mounted surface can still carry a previous camera's DOM; a new mount begins at Fit.
      applyOverlays(FIT_VIEWPORT);
      position(authoredMarkerPoint(current().field.geometry, current().field.projection.point));
      draw();
      trackResolution();
    },
    updatePlane(): boolean {
      if (plane === current().plane) return false;
      plane = current().plane;
      return true;
    },
    reconcile(allowPosition: boolean): void {
      if (allowPosition)
        position(authoredMarkerPoint(current().field.geometry, current().field.projection.point));
      const nextInput = `${current().field.geometry.id}:${fixed()}:${current().interactionPreview}`;
      if (nextInput !== fieldInput) {
        fieldInput = nextInput;
        redraw();
      }
    },
    dispose(): void {
      disposed = true;
      camera.dispose();
      if (fieldFrame !== null) window.cancelAnimationFrame(fieldFrame);
      observer?.disconnect();
      resolution?.removeEventListener("change", trackResolution);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
      renderer.dispose();
    },
  };
}
