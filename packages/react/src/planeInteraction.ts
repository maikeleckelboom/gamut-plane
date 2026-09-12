import {
  OKLCH_LIGHTNESS_CHROMA_PLANE as plane,
  type OklchColor,
  type PickerPlaneKeyboardAction,
  type PlanePoint,
} from "@gamut-plane/core";
import {
  createFieldRenderer,
  pointStyle,
  type CanvasColorSpaceStatus,
} from "@gamut-plane/rendering";
import type { GamutPlaneProps } from "./gamutPlane.js";

export interface PlaneBinding {
  reconcile(value: OklchColor): void;
  redraw(): void;
  dispose(): void;
}

function sameColor(first: OklchColor, second: OklchColor): boolean {
  return (
    first.l === second.l &&
    first.c === second.c &&
    first.h === second.h &&
    first.alpha === second.alpha
  );
}

/** One committed React mount, including its Strict Mode setup/cleanup lifetime. */
export function mountPlane(
  surface: HTMLDivElement,
  canvas: HTMLCanvasElement,
  marker: HTMLSpanElement,
  current: () => GamutPlaneProps,
  onCapability: (status: CanvasColorSpaceStatus) => void,
): PlaneBinding {
  const renderer = createFieldRenderer(canvas, onCapability);
  let disposed = false;
  let activePointer: number | null = null;
  let origin: OklchColor | null = null;
  let expected: OklchColor | null = null;
  let pending: PlanePoint | null = null;
  let latest: PlanePoint | null = null;
  let pointerFrame: number | null = null;
  let fieldFrame: number | null = null;
  let boundsDirty = true;
  let bounds = { left: 0, top: 0, width: 0, height: 0 };
  let pixelRatio = Math.max(1, window.devicePixelRatio || 1);
  let resolution: MediaQueryList | null = null;

  function position(point: PlanePoint) {
    Object.assign(marker.style, pointStyle(point));
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
    renderer.draw({
      plane,
      fixed: plane.project(current().value).fixed,
      pixelRatio,
      interactionPreview: false,
    });
  }
  function redraw() {
    if (!disposed && fieldFrame === null) fieldFrame = window.requestAnimationFrame(draw);
  }
  function publish(nextPoint: PlanePoint): OklchColor {
    pending = null;
    position(nextPoint);
    const value = current().value;
    const next = plane.unproject(nextPoint, plane.project(value).fixed, value);
    if (activePointer !== null) expected = next;
    current().onChange(next);
    return next;
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
    if (rollback && start) current().onChange(start);
    position(plane.positionActivePoint(rollback && start ? start : current().value));
    current().onCancel?.();
  }
  function down(event: PointerEvent) {
    if (activePointer !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
    measure();
    const next = point(event);
    if (!next) return;
    event.preventDefault();
    activePointer = event.pointerId;
    origin = { ...current().value };
    expected = null;
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
      current().onCommit?.(finalValue);
    }
  }
  function lost(event: PointerEvent) {
    if (activePointer === event.pointerId) cancel(true);
  }
  function key(event: KeyboardEvent) {
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
    const next = plane.editFromKeyboard(current().value, action, event.shiftKey);
    current().onChange(next);
    current().onCommit?.(next);
  }
  function resize() {
    measure();
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
  draw();
  trackResolution();
  return {
    redraw,
    reconcile(value) {
      if (activePointer !== null && !sameColor(value, expected ?? origin!)) cancel(false);
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
