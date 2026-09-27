import {
  authorPlaneEdit,
  definingEquals,
  keyboardPlanePoint,
  type ColorValue,
  type PickerPlaneFieldSampler,
  type PickerPlaneGeometry,
  type PlaneEditReference,
  type PickerPlaneKeyboardAction,
  type PlanePoint,
} from "@gamut-plane/core";
import { gpAttribute } from "@gamut-plane/ui";
import type { CanvasColorSpaceStatus, RenderedFieldQuality } from "@gamut-plane/render";
import { mountPlaneResources } from "./planeResources.js";

export interface PlaneInput {
  value: ColorValue;
  plane: PickerPlaneGeometry & PickerPlaneFieldSampler;
  fieldHue: number;
  markerCss: string;
  getEditReference: () => PlaneEditReference | undefined;
  targetGuidePoint: PlanePoint | null;
  targetGuideCss: string;
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
  const resources = mountPlaneResources(
    surface,
    canvas,
    marker,
    warning,
    current,
    onCapability,
    onQuality,
  );
  let disposed = false;
  let activePointer: number | null = null;
  let origin: ColorValue | null = null;
  let expected: ColorValue | null = null;
  let pending: PlanePoint | null = null;
  let latest: PlanePoint | null = null;
  let pointerFrame: number | null = null;

  function publish(nextPoint: PlanePoint): ColorValue | null {
    pending = null;
    resources.position(nextPoint);
    const value = current().value;
    const reference = current().getEditReference();
    const result =
      resources.plane.id === "oklch"
        ? authorPlaneEdit(value, {
            plane: "oklch",
            kind: "point",
            point: nextPoint,
            ...(reference ? { reference } : {}),
          })
        : authorPlaneEdit(value, { plane: "oklab", kind: "point", point: nextPoint });
    if (!result.ok) {
      resources.position(resources.activePoint(value));
      return null;
    }
    if (activePointer !== null) expected = result.value;
    current().onValueChange(result.value);
    return result.value;
  }
  function schedule(nextPoint: PlanePoint): void {
    pending = latest = nextPoint;
    resources.position(nextPoint);
    if (pointerFrame !== null) return;
    pointerFrame = window.requestAnimationFrame(() => {
      pointerFrame = null;
      if (!disposed && activePointer !== null && pending) publish(pending);
    });
  }
  function end(): void {
    if (pointerFrame !== null) window.cancelAnimationFrame(pointerFrame);
    pointerFrame = null;
    pending = latest = null;
    const pointer = activePointer;
    activePointer = null;
    origin = expected = null;
    if (pointer !== null && surface.hasPointerCapture(pointer))
      surface.releasePointerCapture(pointer);
  }
  function cancel(rollback: boolean): void {
    if (activePointer === null) return;
    const start = origin;
    end();
    if (rollback && start) current().onValueChange(start);
    resources.position(resources.activePoint(rollback && start ? start : current().value));
    current().onCancel?.();
  }
  function down(event: PointerEvent): void {
    if (activePointer !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
    resources.measure();
    const next = resources.point(event);
    if (!next) return;
    event.preventDefault();
    activePointer = event.pointerId;
    origin = current().value;
    expected = null;
    surface.dataset.pointerFocus = "";
    surface.setAttribute(gpAttribute.pointerFocus, "");
    surface.focus({ preventScroll: true });
    surface.setPointerCapture(event.pointerId);
    schedule(next);
  }
  function move(event: PointerEvent): void {
    if (activePointer !== event.pointerId) return;
    const next = resources.point(event);
    if (!next) return;
    event.preventDefault();
    schedule(next);
  }
  function up(event: PointerEvent): void {
    if (activePointer !== event.pointerId) return;
    const next = resources.point(event) ?? pending ?? latest;
    end();
    if (next) {
      const finalValue = publish(next);
      if (finalValue) current().onValueCommit?.(finalValue);
    }
  }
  function lost(event: PointerEvent): void {
    if (activePointer === event.pointerId) cancel(true);
  }
  function key(event: KeyboardEvent): void {
    surface.removeAttribute("data-pointer-focus");
    surface.removeAttribute(gpAttribute.pointerFocus);
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
    const point = keyboardPlanePoint(resources.projection(current().value), action, event.shiftKey);
    const reference = current().getEditReference();
    const result =
      resources.plane.id === "oklch"
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

  surface.addEventListener("pointerdown", down);
  surface.addEventListener("pointermove", move);
  surface.addEventListener("pointerup", up);
  surface.addEventListener("pointercancel", lost);
  surface.addEventListener("lostpointercapture", lost);
  surface.addEventListener("keydown", key);
  resources.start();
  return {
    redraw: resources.redraw,
    reconcile() {
      const value = current().value;
      if (resources.updatePlane()) cancel(false);
      if (activePointer !== null && !definingEquals(value, expected ?? origin!)) cancel(false);
      resources.reconcile(activePointer === null || pending === null);
    },
    dispose() {
      disposed = true;
      end();
      surface.removeEventListener("pointerdown", down);
      surface.removeEventListener("pointermove", move);
      surface.removeEventListener("pointerup", up);
      surface.removeEventListener("pointercancel", lost);
      surface.removeEventListener("lostpointercapture", lost);
      surface.removeEventListener("keydown", key);
      resources.dispose();
    },
  };
}
