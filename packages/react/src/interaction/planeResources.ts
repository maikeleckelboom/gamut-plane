import {
  projectColorToPlane,
  type ColorPlaneProjection,
  type ColorValue,
  type PickerPlaneFieldSampler,
  type PickerPlaneGeometry,
  type PlanePoint,
} from "@gamut-plane/core";
import {
  createFieldRenderer,
  pointStyle,
  placePlanarWarning,
  PICKER_ACTIVE_MARKER_RADIUS,
  PICKER_TARGET_GUIDE_MARKER_RADIUS,
  PICKER_WARNING_GLYPH_SIZE,
  PICKER_WARNING_MARKER_CLEARANCE,
  PICKER_WARNING_PREFERRED_OFFSET,
  PICKER_WARNING_SURFACE_INSET,
  type CanvasColorSpaceStatus,
  type RenderedFieldQuality,
} from "@gamut-plane/render";

export interface PlaneResourceInput {
  value: ColorValue;
  plane: PickerPlaneGeometry & PickerPlaneFieldSampler;
  fieldHue: number;
  targetGuidePoint: PlanePoint | null;
  interactionPreview: boolean;
}

/** React's committed Canvas, environment, geometry, and marker binding. */
export function mountPlaneResources(
  surface: HTMLDivElement,
  canvas: HTMLCanvasElement,
  marker: HTMLSpanElement,
  warning: HTMLSpanElement,
  current: () => PlaneResourceInput,
  onCapability: (status: CanvasColorSpaceStatus) => void,
  onQuality: (quality: RenderedFieldQuality) => void,
) {
  const renderer = createFieldRenderer(canvas, onCapability);
  let disposed = false;
  let fieldFrame: number | null = null;
  let boundsDirty = true;
  let bounds = { left: 0, top: 0, width: 0, height: 0 };
  let pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  let resolution: MediaQueryList | null = null;
  let plane = current().plane;
  let localSize = { width: 0, height: 0 };

  function projection(value: ColorValue): ColorPlaneProjection {
    const observed = projectColorToPlane(value, plane.id);
    if (!observed.ok) throw new RangeError("Selected color cannot be projected into the plane");
    return observed.value;
  }
  function activePoint(value: ColorValue): PlanePoint {
    return plane.constrainPoint(projection(value).point);
  }
  function fixed(): number {
    return plane.id === "oklch"
      ? current().fieldHue
      : projection(current().value).representation.channels[0];
  }
  let fieldInput = `${plane.id}:${fixed()}:${current().interactionPreview}`;

  function position(point: PlanePoint): void {
    Object.assign(marker.style, pointStyle(point));
    if (localSize.width < PICKER_WARNING_GLYPH_SIZE || localSize.height < PICKER_WARNING_GLYPH_SIZE)
      return;
    const guide = current().targetGuidePoint;
    const placement = placePlanarWarning({
      activeCenter: { x: point.x * localSize.width, y: point.y * localSize.height },
      surfaceSize: localSize,
      activeRadius: PICKER_ACTIVE_MARKER_RADIUS,
      warningSize: { width: PICKER_WARNING_GLYPH_SIZE, height: PICKER_WARNING_GLYPH_SIZE },
      preferredOffset: PICKER_WARNING_PREFERRED_OFFSET,
      surfaceInset: PICKER_WARNING_SURFACE_INSET,
      markerClearance: PICKER_WARNING_MARKER_CLEARANCE,
      targetGuideMarker: guide
        ? {
            center: { x: guide.x * localSize.width, y: guide.y * localSize.height },
            radius: PICKER_TARGET_GUIDE_MARKER_RADIUS,
          }
        : null,
    });
    Object.assign(warning.style, {
      left: `${placement.left}px`,
      top: `${placement.top}px`,
      visibility: "visible",
    });
  }

  function measure(): void {
    const box = surface.getBoundingClientRect();
    const scaleX = surface.offsetWidth ? box.width / surface.offsetWidth : 1;
    const scaleY = surface.offsetHeight ? box.height / surface.offsetHeight : 1;
    bounds = {
      left: box.left + surface.clientLeft * scaleX,
      top: box.top + surface.clientTop * scaleY,
      width: surface.clientWidth * scaleX,
      height: surface.clientHeight * scaleY,
    };
    boundsDirty = false;
    localSize = { width: surface.clientWidth, height: surface.clientHeight };
  }
  function point(event: PointerEvent): PlanePoint | null {
    if (boundsDirty) measure();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return plane.constrainPoint({
      x: (event.clientX - bounds.left) / bounds.width,
      y: (event.clientY - bounds.top) / bounds.height,
    });
  }
  function draw(): void {
    fieldFrame = null;
    if (disposed) return;
    onQuality(
      renderer.draw({
        plane,
        fixed: fixed(),
        pixelRatio,
        interactionPreview: current().interactionPreview,
      }),
    );
  }
  function redraw(): void {
    if (!disposed && fieldFrame === null) fieldFrame = window.requestAnimationFrame(draw);
  }
  function resize(): void {
    measure();
    position(activePoint(current().value));
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
    projection,
    activePoint,
    position,
    measure,
    point,
    redraw,
    start() {
      observer?.observe(surface);
      window.addEventListener("scroll", scroll, { capture: true, passive: true });
      window.addEventListener("resize", resize);
      measure();
      position(activePoint(current().value));
      draw();
      trackResolution();
    },
    updatePlane(): boolean {
      if (plane === current().plane) return false;
      plane = current().plane;
      return true;
    },
    reconcile(allowPosition: boolean): void {
      if (allowPosition) position(activePoint(current().value));
      const nextInput = `${plane.id}:${fixed()}:${current().interactionPreview}`;
      if (nextInput !== fieldInput) {
        fieldInput = nextInput;
        redraw();
      }
    },
    dispose(): void {
      disposed = true;
      if (fieldFrame !== null) window.cancelAnimationFrame(fieldFrame);
      observer?.disconnect();
      resolution?.removeEventListener("change", trackResolution);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
      renderer.dispose();
    },
  };
}
