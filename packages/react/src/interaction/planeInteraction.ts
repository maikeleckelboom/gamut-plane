import {
  authorPlaneEdit,
  definingEquals,
  keyboardPlanePoint,
  projectColorToPlane,
  type ColorPlaneProjection,
  type ColorValue,
  type PickerPlaneFieldSampler,
  type PickerPlaneGeometry,
  type PlaneEditReference,
  type PickerPlaneKeyboardAction,
  type PlanePoint,
} from "@gamut-plane/core";
import {
  createFieldRenderer,
  pointStyle,
  placePlanarWarning,
  PICKER_ACTIVE_MARKER_RADIUS,
  PICKER_PROJECTION_MARKER_RADIUS,
  PICKER_WARNING_GLYPH_SIZE,
  PICKER_WARNING_MARKER_CLEARANCE,
  PICKER_WARNING_PREFERRED_OFFSET,
  PICKER_WARNING_SURFACE_INSET,
  type CanvasColorSpaceStatus,
  type RenderedFieldQuality,
} from "@gamut-plane/render";

export interface PlaneInput {
  value: ColorValue;
  plane: PickerPlaneGeometry & PickerPlaneFieldSampler;
  fieldHue: number;
  markerCss: string;
  getEditReference: () => PlaneEditReference | undefined;
  projectionPoint: PlanePoint | null;
  projectionCss: string;
  interactionPreview: boolean;
  onValueChange: (value: ColorValue) => void;
  onValueCommit: ((value: ColorValue) => void) | undefined;
  onCancel: (() => void) | undefined;
}

export interface PlaneBinding {
  reconcile(): void;
  redraw(): void;
  dispose(): void;
}

/** One committed React mount, including its Strict Mode setup/cleanup lifetime. */
export function mountPlane(
  surface: HTMLDivElement,
  canvas: HTMLCanvasElement,
  marker: HTMLSpanElement,
  warning: HTMLSpanElement,
  current: () => PlaneInput,
  onCapability: (status: CanvasColorSpaceStatus) => void,
  onQuality: (quality: RenderedFieldQuality) => void,
): PlaneBinding {
  const renderer = createFieldRenderer(canvas, onCapability);
  let disposed = false;
  let activePointer: number | null = null;
  let origin: ColorValue | null = null;
  let expected: ColorValue | null = null;
  let pending: PlanePoint | null = null;
  let latest: PlanePoint | null = null;
  let pointerFrame: number | null = null;
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

  function position(point: PlanePoint) {
    Object.assign(marker.style, pointStyle(point));
    if (localSize.width < PICKER_WARNING_GLYPH_SIZE || localSize.height < PICKER_WARNING_GLYPH_SIZE)
      return;
    const guide = current().projectionPoint;
    const placement = placePlanarWarning({
      activeCenter: { x: point.x * localSize.width, y: point.y * localSize.height },
      surfaceSize: localSize,
      activeRadius: PICKER_ACTIVE_MARKER_RADIUS,
      warningSize: { width: PICKER_WARNING_GLYPH_SIZE, height: PICKER_WARNING_GLYPH_SIZE },
      preferredOffset: PICKER_WARNING_PREFERRED_OFFSET,
      surfaceInset: PICKER_WARNING_SURFACE_INSET,
      markerClearance: PICKER_WARNING_MARKER_CLEARANCE,
      projectionMarker: guide
        ? {
            center: { x: guide.x * localSize.width, y: guide.y * localSize.height },
            radius: PICKER_PROJECTION_MARKER_RADIUS,
          }
        : null,
    });
    Object.assign(warning.style, {
      left: `${placement.left}px`,
      top: `${placement.top}px`,
      visibility: "visible",
    });
  }
  function measure() {
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
  function draw() {
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
  function redraw() {
    if (!disposed && fieldFrame === null) fieldFrame = window.requestAnimationFrame(draw);
  }
  function publish(nextPoint: PlanePoint): ColorValue | null {
    pending = null;
    position(nextPoint);
    const value = current().value;
    const reference = current().getEditReference();
    const result =
      plane.id === "oklch"
        ? authorPlaneEdit(value, {
            plane: "oklch",
            kind: "point",
            point: nextPoint,
            ...(reference ? { reference } : {}),
          })
        : authorPlaneEdit(value, { plane: "oklab", kind: "point", point: nextPoint });
    if (!result.ok) {
      position(activePoint(value));
      return null;
    }
    if (activePointer !== null) expected = result.value;
    current().onValueChange(result.value);
    return result.value;
  }
  function schedule(nextPoint: PlanePoint) {
    pending = latest = nextPoint;
    position(nextPoint);
    if (pointerFrame !== null) return;
    pointerFrame = window.requestAnimationFrame(() => {
      pointerFrame = null;
      if (!disposed && activePointer !== null && pending) publish(pending);
    });
  }
  function end() {
    if (pointerFrame !== null) window.cancelAnimationFrame(pointerFrame);
    pointerFrame = null;
    pending = latest = null;
    const pointer = activePointer;
    activePointer = null;
    origin = expected = null;
    if (pointer !== null && surface.hasPointerCapture(pointer))
      surface.releasePointerCapture(pointer);
  }
  function cancel(rollback: boolean) {
    if (activePointer === null) return;
    const start = origin;
    end();
    if (rollback && start) current().onValueChange(start);
    position(activePoint(rollback && start ? start : current().value));
    current().onCancel?.();
  }
  function down(event: PointerEvent) {
    if (activePointer !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
    measure();
    const next = point(event);
    if (!next) return;
    event.preventDefault();
    activePointer = event.pointerId;
    origin = current().value;
    expected = null;
    surface.dataset.pointerFocus = "";
    surface.focus({ preventScroll: true });
    surface.setPointerCapture(event.pointerId);
    schedule(next);
  }
  function move(event: PointerEvent) {
    if (activePointer !== event.pointerId) return;
    const next = point(event);
    if (!next) return;
    event.preventDefault();
    schedule(next);
  }
  function up(event: PointerEvent) {
    if (activePointer !== event.pointerId) return;
    const next = point(event) ?? pending ?? latest;
    end();
    if (next) {
      const finalValue = publish(next);
      if (finalValue) current().onValueCommit?.(finalValue);
    }
  }
  function lost(event: PointerEvent) {
    if (activePointer === event.pointerId) cancel(true);
  }
  function key(event: KeyboardEvent) {
    surface.removeAttribute("data-pointer-focus");
    if (event.key === "Escape" && activePointer !== null) {
      event.preventDefault();
      event.stopPropagation();
      cancel(true);
      return;
    }
    const actions: Record<string, PickerPlaneKeyboardAction> = {
      ArrowLeft: "decrease-x",
      ArrowRight: "increase-x",
      ArrowUp: "increase-y",
      ArrowDown: "decrease-y",
      Home: "minimum-x",
      End: "maximum-x",
    };
    const action = actions[event.key];
    if (!action) return;
    event.preventDefault();
    cancel(false);
    const point = keyboardPlanePoint(projection(current().value), action, event.shiftKey);
    const reference = current().getEditReference();
    const result =
      plane.id === "oklch"
        ? authorPlaneEdit(current().value, {
            plane: "oklch",
            kind: "point",
            point,
            ...(reference ? { reference } : {}),
          })
        : authorPlaneEdit(current().value, { plane: "oklab", kind: "point", point });
    if (!result.ok) return;
    current().onValueChange(result.value);
    current().onValueCommit?.(result.value);
  }
  function resize() {
    measure();
    position(activePoint(current().value));
    redraw();
  }
  function scroll() {
    boundsDirty = true;
  }
  function trackResolution() {
    resolution?.removeEventListener("change", trackResolution);
    pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    resolution = window.matchMedia(`(resolution: ${pixelRatio}dppx)`);
    resolution.addEventListener("change", trackResolution);
    redraw();
  }
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
  observer?.observe(surface);
  surface.addEventListener("pointerdown", down);
  surface.addEventListener("pointermove", move);
  surface.addEventListener("pointerup", up);
  surface.addEventListener("pointercancel", lost);
  surface.addEventListener("lostpointercapture", lost);
  surface.addEventListener("keydown", key);
  window.addEventListener("scroll", scroll, { capture: true, passive: true });
  window.addEventListener("resize", resize);
  measure();
  position(activePoint(current().value));
  draw();
  trackResolution();
  return {
    redraw,
    reconcile() {
      const value = current().value;
      if (plane !== current().plane) {
        plane = current().plane;
        cancel(false);
      }
      if (activePointer !== null && !definingEquals(value, expected ?? origin!)) cancel(false);
      if (activePointer === null || pending === null) position(activePoint(value));
      const nextInput = `${plane.id}:${fixed()}:${current().interactionPreview}`;
      if (nextInput !== fieldInput) {
        fieldInput = nextInput;
        redraw();
      }
    },
    dispose() {
      disposed = true;
      end();
      if (fieldFrame !== null) window.cancelAnimationFrame(fieldFrame);
      observer?.disconnect();
      resolution?.removeEventListener("change", trackResolution);
      surface.removeEventListener("pointerdown", down);
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerup", up);
      surface.removeEventListener("pointercancel", lost);
      surface.removeEventListener("lostpointercapture", lost);
      surface.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
      renderer.dispose();
    },
  };
}
