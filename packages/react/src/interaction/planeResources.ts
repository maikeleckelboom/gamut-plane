import {
  type ColorValue,
  type PickerPlaneFieldSampler,
  type PickerPlaneGeometry,
  type PlanePoint,
} from "@gamut-plane/core";
import {
  createFieldRenderer,
  pointStyle,
  type CanvasColorSpaceStatus,
  type RenderedFieldQuality,
} from "@gamut-plane/render";
import type { CurrentField } from "@gamut-plane/render/internal/current";

export interface PlaneResourceInput {
  value: ColorValue;
  plane: PickerPlaneGeometry & PickerPlaneFieldSampler;
  field: CurrentField;
  interactionPreview: boolean;
}

/** React's committed Canvas, environment, geometry, and marker binding. */
export function mountPlaneResources(
  surface: HTMLDivElement,
  canvas: HTMLCanvasElement,
  marker: HTMLSpanElement,
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
  function projection(value: ColorValue) {
    const observed = current().field.geometry.project(value);
    if (!observed.ok) throw new RangeError("Selected color cannot be projected into the plane");
    return observed.value;
  }
  function activePoint(value: ColorValue): PlanePoint {
    return current().field.geometry.constrain(projection(value).point);
  }
  function fixed(): number {
    return current().field.samplingFixed;
  }
  let fieldInput = `${current().field.geometry.id}:${fixed()}:${current().interactionPreview}`;

  function position(point: PlanePoint): void {
    Object.assign(marker.style, pointStyle(point));
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
  }
  function point(event: PointerEvent): PlanePoint | null {
    if (boundsDirty) measure();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return current().field.geometry.constrain({
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
        fieldId: current().field.geometry.id,
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
    position(current().field.geometry.constrain(current().field.projection.point));
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
      position(current().field.geometry.constrain(current().field.projection.point));
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
        position(current().field.geometry.constrain(current().field.projection.point));
      const nextInput = `${current().field.geometry.id}:${fixed()}:${current().interactionPreview}`;
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
