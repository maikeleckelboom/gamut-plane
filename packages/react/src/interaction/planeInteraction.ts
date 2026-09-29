import {
  definingEquals,
  type ColorValue,
  type PlaneEditReference,
  type PickerPlaneKeyboardAction,
  type PlanePoint,
} from "@gamut-plane/core";
import {
  authorEditorPoint,
  editorDefinitions,
  keyboardGeometryPoint,
} from "@gamut-plane/core/internal/capabilities";
import { gpAttribute, mountPlaneGesture } from "@gamut-plane/ui";
import type { CanvasColorSpaceStatus, RenderedFieldQuality } from "@gamut-plane/render";
import { mountPlaneResources, type PlaneResourceInput } from "./planeResources.js";

export interface PlaneInput extends PlaneResourceInput {
  semanticContextKey: string;
  markerCss: string;
  getEditReference: () => PlaneEditReference | undefined;
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
  current: () => PlaneInput,
  onCapability: (status: CanvasColorSpaceStatus) => void,
  onQuality: (quality: RenderedFieldQuality) => void,
): PlaneBinding {
  const resources = mountPlaneResources(surface, canvas, marker, current, onCapability, onQuality);

  function authorPoint(value: ColorValue, point: PlanePoint): ColorValue | null {
    const reference = current().getEditReference();
    const editor = editorDefinitions[current().field.editorId];
    const result = authorEditorPoint(value, editor, point, reference);
    return result.ok ? result.value : null;
  }

  const gesture = mountPlaneGesture<ColorValue, PlanePoint>(surface, () => ({
    value: current().value,
    viewKey: current().semanticContextKey,
    pointFromPointer: (event) => {
      if (event.type === "pointerdown") resources.measure();
      return resources.point(event);
    },
    authorPoint,
    definingEquals,
    onPointerStart: (event) => {
      surface.dataset.pointerFocus = "";
      surface.setAttribute(gpAttribute.pointerFocus, "");
      surface.focus({ preventScroll: true });
      surface.setPointerCapture(event.pointerId);
    },
    onPointerEnd: (id) => {
      if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
    },
    onPreviewPoint: resources.position,
    onValueChange: (value) => current().onValueChange(value),
    onCommit: (value) => current().onValueCommit?.(value),
    onCancel: () => current().onCancel?.(),
    onRestorePresentation: (value) => resources.position(resources.activePoint(value)),
  }));

  function key(event: KeyboardEvent): void {
    surface.removeAttribute("data-pointer-focus");
    surface.removeAttribute(gpAttribute.pointerFocus);
    if (event.key === "Escape" && gesture.active) {
      event.preventDefault();
      event.stopPropagation();
      gesture.rollback();
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
    gesture.interrupt();
    const point = keyboardGeometryPoint(
      resources.projection(current().value),
      action,
      event.shiftKey,
    );
    const result = authorPoint(current().value, point);
    if (result === null) return;
    current().onValueChange(result);
    current().onValueCommit?.(result);
  }

  surface.addEventListener("keydown", key);
  resources.start();
  return {
    redraw: resources.redraw,
    reconcile() {
      resources.updatePlane();
      gesture.reconcile();
      resources.reconcile(!gesture.active || !gesture.hasPendingPoint);
    },
    dispose() {
      gesture.dispose();
      surface.removeEventListener("keydown", key);
      resources.dispose();
    },
  };
}
