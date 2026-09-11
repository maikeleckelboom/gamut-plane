<script setup lang="ts">
import {
  serializeColor,
  type OklchColor,
  type GamutBoundaryTable,
  type PickerPlaneContract,
  type PickerPlaneKeyboardAction,
  type PickerPlaneSampleScratch,
  type PlanePoint,
} from "@gamut-plane/core";
import { useDevicePixelRatio, useEventListener, useResizeObserver } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import GamutWarningGlyph from "./GamutWarningGlyph.vue";
import {
  PICKER_ACTIVE_MARKER_RADIUS,
  PICKER_PROJECTION_MARKER_RADIUS,
  PICKER_WARNING_GLYPH_SIZE,
  PICKER_WARNING_MARKER_CLEARANCE,
  PICKER_WARNING_PREFERRED_OFFSET,
  PICKER_WARNING_SURFACE_INSET,
} from "./planeInstrumentStyle";
import { placePlanarWarning } from "./pickerWarningPlacement";

import type { CanvasColorSpaceStatus } from "../types";
type RenderedFieldQuality = "full" | "preview";

const props = withDefaults(
  defineProps<{
    modelValue: OklchColor;
    plane: PickerPlaneContract;
    srgbTable: GamutBoundaryTable;
    displayP3Table: GamutBoundaryTable;
    srgbBoundaryGuideColor: OklchColor | null;
    warningVisible: boolean;
    warningLabel: string;
    interactionPreview?: boolean;
    showSrgbBoundary?: boolean;
    showDisplayP3Boundary?: boolean;
  }>(),
  {
    interactionPreview: false,
    showSrgbBoundary: true,
    showDisplayP3Boundary: true,
  },
);

const emit = defineEmits<{
  "update:modelValue": [color: OklchColor];
  commit: [color: OklchColor];
  cancel: [];
  capability: [status: CanvasColorSpaceStatus];
}>();

const VIEWBOX_SIZE = 1000;
const INTERACTION_PREVIEW_COLUMN_SAMPLES = 192;

const surface = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const marker = ref<HTMLSpanElement | null>(null);
const warningMarker = ref<HTMLSpanElement | null>(null);
const canvasColorSpace = ref<CanvasColorSpaceStatus>("pending");
const renderedFieldQuality = ref<RenderedFieldQuality>("full");
const pixelRatio = ref(1);

let context: CanvasRenderingContext2D | null = null;
let discFieldBuffer: HTMLCanvasElement | null = null;
let discFieldContext: CanvasRenderingContext2D | null = null;
let columnPreviewBuffer: HTMLCanvasElement | null = null;
let columnPreviewContext: CanvasRenderingContext2D | null = null;
let fieldRaf: number | null = null;
let pointerRaf: number | null = null;
let pendingPoint: PlanePoint | null = null;
let activePointerId: number | null = null;
let latestInteractionPoint: PlanePoint | null = null;
let latestInteractionColor: OklchColor | null = null;
let interactionOrigin: OklchColor | null = null;
let boundsDirty = false;
let isUnmounted = false;
let isMounted = false;
let lastFieldKey = "";
let surfaceBounds = { left: 0, top: 0, width: 0, height: 0 };
let surfaceLocalSize = { width: 0, height: 0 };
const fieldScratch: PickerPlaneSampleScratch = { input: [0, 0, 0], converted: [0, 0, 0] };

const activeProjection = computed(() => props.plane.project(props.modelValue));
const fixedAxis = computed(() => activeProjection.value.fixed);
const activePoint = computed(() => activeProjection.value.point);
const boundedActivePoint = computed(() => props.plane.positionActivePoint(props.modelValue));
const boundaryProjectionPoint = computed<PlanePoint | null>(() => {
  if (!props.srgbBoundaryGuideColor) return null;
  return props.plane.positionActivePoint(props.srgbBoundaryGuideColor);
});

const markerStyle = computed(() => pointStyle(boundedActivePoint.value));
const boundaryProjectionMarkerStyle = computed(() =>
  boundaryProjectionPoint.value ? pointStyle(boundaryProjectionPoint.value) : undefined,
);
const boundaryProjectionCss = computed(() =>
  props.srgbBoundaryGuideColor ? serializeColor(props.srgbBoundaryGuideColor) : "",
);
const boundaryProjectionConnectorStyle = computed(() => {
  const guide = boundaryProjectionPoint.value;
  if (!guide) return undefined;
  const active = boundedActivePoint.value;
  if (props.plane.id === "oklab") {
    const deltaX = guide.x - active.x;
    const deltaY = guide.y - active.y;
    return {
      ...pointStyle(active),
      width: `${(Math.hypot(deltaX, deltaY) * 100).toFixed(8)}%`,
      transform: `translateY(-50%) rotate(${Math.atan2(deltaY, deltaX).toFixed(10)}rad)`,
      transformOrigin: "left center",
    };
  }
  const left = Math.min(active.x, guide.x);
  return {
    ...pointStyle({ x: left, y: active.y }),
    width: `${(Math.abs(active.x - guide.x) * 100).toFixed(8)}%`,
  };
});

const srgbPath = computed(() =>
  geometryToSvgPath(
    props.plane.buildGamutContour(props.srgbTable, fixedAxis.value),
    props.plane.gamutContourClosed,
  ),
);
const displayP3Path = computed(() =>
  geometryToSvgPath(
    props.plane.buildGamutContour(props.displayP3Table, fixedAxis.value),
    props.plane.gamutContourClosed,
  ),
);
const activeCss = computed(() => serializeColor(props.modelValue));
const planeLabel = computed(() => {
  const projection = activeProjection.value;
  const label = `${props.plane.label} plane. Horizontal ${props.plane.xAxis.label} ${projection.x.toFixed(3)}. Vertical ${props.plane.yAxis.label} ${projection.y.toFixed(3)}. Arrow keys adjust the selected point.`;
  return props.warningVisible && props.warningLabel ? `${label} ${props.warningLabel}` : label;
});
const instrumentStyle = {
  "--picker-warning-size": `${PICKER_WARNING_GLYPH_SIZE}px`,
  "--picker-active-marker-size": `${PICKER_ACTIVE_MARKER_RADIUS * 2}px`,
  "--picker-projection-marker-size": `${PICKER_PROJECTION_MARKER_RADIUS * 2}px`,
};

function pointStyle(point: PlanePoint): Record<string, string> {
  // Transcendental math can differ in the last bit between Node and browsers.
  // Stabilize presentation only; never quantize the authored color or projection math.
  return { left: `${(point.x * 100).toFixed(8)}%`, top: `${(point.y * 100).toFixed(8)}%` };
}

function geometryToSvgPath(geometry: Float32Array, closed: boolean): string {
  let path = "";
  for (let index = 0; index < geometry.length; index += 2) {
    const x = (geometry[index] ?? 0) * VIEWBOX_SIZE;
    const y = (geometry[index + 1] ?? 0) * VIEWBOX_SIZE;
    path += `${index === 0 ? "M" : " L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return closed ? `${path} Z` : path;
}

function publishCanvasColorSpace(status: CanvasColorSpaceStatus): void {
  if (canvasColorSpace.value === status) return;
  canvasColorSpace.value = status;
  emit("capability", status);
}

function getCanvasContext(element: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    const requested = element.getContext("2d", {
      alpha: false,
      colorSpace: "display-p3",
    });
    if (requested) {
      const granted = requested.getContextAttributes?.().colorSpace;
      publishCanvasColorSpace(granted === "display-p3" ? "display-p3" : "srgb");
      return requested;
    }
  } catch {
    // The default context below provides deterministic sRGB rendering.
  }

  try {
    const defaultContext = element.getContext("2d", { alpha: false });
    publishCanvasColorSpace(defaultContext ? "srgb" : "unavailable");
    return defaultContext;
  } catch {
    publishCanvasColorSpace("unavailable");
    return null;
  }
}

function getDiscFieldContext(size: number): CanvasRenderingContext2D | null {
  discFieldBuffer ??= document.createElement("canvas");
  if (discFieldBuffer.width !== size || discFieldBuffer.height !== size) {
    discFieldBuffer.width = size;
    discFieldBuffer.height = size;
  }
  discFieldContext ??= getCanvasContext(discFieldBuffer);
  return discFieldContext;
}

function getColumnPreviewContext(width: number, height: number): CanvasRenderingContext2D | null {
  columnPreviewBuffer ??= document.createElement("canvas");
  if (columnPreviewBuffer.width !== width || columnPreviewBuffer.height !== height) {
    columnPreviewBuffer.width = width;
    columnPreviewBuffer.height = height;
  }
  columnPreviewContext ??= getCanvasContext(columnPreviewBuffer);
  return columnPreviewContext;
}

function drawColumnGradientField(
  target: CanvasRenderingContext2D,
  targetHeight: number,
  sampleCount: number,
  sampleScale: number,
  logicalHeight: number,
  fixed: number,
  color: OklchColor,
): void {
  const sampling = props.plane.fieldSampling;
  if (sampling.kind !== "column-gradient") return;
  const rowCount = Math.ceil(logicalHeight / sampling.rowStep) + 1;

  for (let column = 0; column < sampleCount; column += 1) {
    const gradient = target.createLinearGradient(0, 0, 0, targetHeight);
    const x = column / Math.max(1, sampleCount - 1);

    for (let index = 0; index < rowCount; index += 1) {
      const row = Math.min(index * sampling.rowStep, logicalHeight);
      props.plane.sampleField({ x, y: row / logicalHeight }, fixed, color, fieldScratch);
      gradient.addColorStop(index / Math.max(1, rowCount - 1), serializeColor(color));
    }

    target.fillStyle = gradient;
    const start = Math.round(column * sampleScale);
    const end = Math.round((column + 1) * sampleScale);
    target.fillRect(start, 0, Math.max(1, end - start), targetHeight);
  }
}

function resizeCanvas(element: HTMLCanvasElement): {
  width: number;
  height: number;
  backingWidth: number;
  backingHeight: number;
  pixelRatio: number;
} {
  const bounds = element.getBoundingClientRect();
  const width = Math.max(1, Math.round(bounds.width));
  const height = Math.max(1, Math.round(bounds.height));
  const activePixelRatio = Math.max(1, pixelRatio.value || 1);
  const backingWidth = Math.round(width * activePixelRatio);
  const backingHeight = Math.round(height * activePixelRatio);

  if (element.width !== backingWidth || element.height !== backingHeight) {
    element.width = backingWidth;
    element.height = backingHeight;
  }
  return { width, height, backingWidth, backingHeight, pixelRatio: activePixelRatio };
}

function drawField(): void {
  fieldRaf = null;
  if (isUnmounted) return;
  const element = canvas.value;
  if (!element) return;
  context ??= getCanvasContext(element);
  if (!context) return;

  const { width, height, backingWidth, backingHeight, pixelRatio } = resizeCanvas(element);
  const fixed = fixedAxis.value;
  const sampling = props.plane.fieldSampling;
  const usePreview =
    sampling.kind === "column-gradient" &&
    props.interactionPreview &&
    width > INTERACTION_PREVIEW_COLUMN_SAMPLES;
  const fieldQuality: RenderedFieldQuality = usePreview ? "preview" : "full";
  const fieldKey = `${props.plane.id}:${width}:${height}:${pixelRatio}:${fixed}:${canvasColorSpace.value}:${fieldQuality}`;
  if (fieldKey === lastFieldKey) return;

  const color: OklchColor = { l: 0, c: 0, h: 0, alpha: 1 };
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, backingWidth, backingHeight);

  if (sampling.kind === "column-gradient") {
    if (usePreview) {
      const previewContext = getColumnPreviewContext(
        INTERACTION_PREVIEW_COLUMN_SAMPLES,
        backingHeight,
      );
      if (!previewContext || !columnPreviewBuffer) return;
      previewContext.setTransform(1, 0, 0, 1, 0, 0);
      previewContext.clearRect(0, 0, INTERACTION_PREVIEW_COLUMN_SAMPLES, backingHeight);
      drawColumnGradientField(
        previewContext,
        backingHeight,
        INTERACTION_PREVIEW_COLUMN_SAMPLES,
        1,
        height,
        fixed,
        color,
      );
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(columnPreviewBuffer, 0, 0, backingWidth, backingHeight);
    } else {
      drawColumnGradientField(context, backingHeight, width, pixelRatio, height, fixed, color);
    }
  } else {
    const { rowCount, columnSamples } = sampling;
    const bufferContext = getDiscFieldContext(rowCount);
    if (!bufferContext || !discFieldBuffer) return;
    bufferContext.setTransform(1, 0, 0, 1, 0, 0);
    bufferContext.clearRect(0, 0, rowCount, rowCount);

    for (let row = 0; row < rowCount; row += 1) {
      const y = (row + 0.5) / rowCount;
      const gradient = bufferContext.createLinearGradient(0, 0, rowCount, 0);

      for (let column = 0; column < columnSamples; column += 1) {
        const position = column / (columnSamples - 1);
        props.plane.sampleField({ x: position, y }, fixed, color, fieldScratch);
        gradient.addColorStop(position, serializeColor(color));
      }

      bufferContext.fillStyle = gradient;
      bufferContext.fillRect(0, row, rowCount, 1);
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(discFieldBuffer, 0, 0, backingWidth, backingHeight);
  }

  lastFieldKey = fieldKey;
  renderedFieldQuality.value = fieldQuality;
}

function scheduleFieldDraw(): void {
  if (!isMounted || isUnmounted || fieldRaf !== null) return;
  fieldRaf = window.requestAnimationFrame(drawField);
}

function pointFromPointer(event: PointerEvent): PlanePoint | null {
  if (boundsDirty) measureSurface();
  if (surfaceBounds.width <= 0 || surfaceBounds.height <= 0) return null;
  return props.plane.constrainPoint({
    x: (event.clientX - surfaceBounds.left) / surfaceBounds.width,
    y: (event.clientY - surfaceBounds.top) / surfaceBounds.height,
  });
}

function measureSurface(): void {
  const element = surface.value;
  if (!element) return;
  const bounds = element.getBoundingClientRect();
  boundsDirty = false;
  if (bounds.width <= 0 || bounds.height <= 0) {
    surfaceBounds = { left: 0, top: 0, width: 0, height: 0 };
    return;
  }

  const hasLayoutMetrics = element.offsetWidth > 0 && element.offsetHeight > 0;
  const scaleX = hasLayoutMetrics ? bounds.width / element.offsetWidth : 1;
  const scaleY = hasLayoutMetrics ? bounds.height / element.offsetHeight : 1;
  const localWidth = element.clientWidth || bounds.width;
  const localHeight = element.clientHeight || bounds.height;
  surfaceBounds = {
    left: bounds.left + element.clientLeft * scaleX,
    top: bounds.top + element.clientTop * scaleY,
    width: localWidth * scaleX,
    height: localHeight * scaleY,
  };
  surfaceLocalSize = {
    width: localWidth,
    height: localHeight,
  };
}

function positionActiveAnnotations(point: PlanePoint): void {
  const activeMarker = marker.value;
  if (activeMarker) {
    activeMarker.style.left = `${point.x * 100}%`;
    activeMarker.style.top = `${point.y * 100}%`;
  }

  const warning = warningMarker.value;
  if (
    !warning ||
    surfaceLocalSize.width < PICKER_WARNING_GLYPH_SIZE ||
    surfaceLocalSize.height < PICKER_WARNING_GLYPH_SIZE
  ) {
    return;
  }

  const boundaryProjection = boundaryProjectionPoint.value;
  const placement = placePlanarWarning({
    activeCenter: {
      x: point.x * surfaceLocalSize.width,
      y: point.y * surfaceLocalSize.height,
    },
    surfaceSize: surfaceLocalSize,
    activeRadius: PICKER_ACTIVE_MARKER_RADIUS,
    warningSize: {
      width: PICKER_WARNING_GLYPH_SIZE,
      height: PICKER_WARNING_GLYPH_SIZE,
    },
    preferredOffset: PICKER_WARNING_PREFERRED_OFFSET,
    surfaceInset: PICKER_WARNING_SURFACE_INSET,
    markerClearance: PICKER_WARNING_MARKER_CLEARANCE,
    projectionMarker: boundaryProjection
      ? {
          center: {
            x: boundaryProjection.x * surfaceLocalSize.width,
            y: boundaryProjection.y * surfaceLocalSize.height,
          },
          radius: PICKER_PROJECTION_MARKER_RADIUS,
        }
      : undefined,
  });
  warning.style.left = `${placement.left}px`;
  warning.style.top = `${placement.top}px`;
  warning.style.visibility = "visible";
}

function emitLivePoint(point: PlanePoint): OklchColor {
  pendingPoint = null;
  positionActiveAnnotations(point);
  const color = props.plane.unproject(point, activeProjection.value.fixed, props.modelValue);
  if (activePointerId !== null) {
    latestInteractionPoint = point;
    latestInteractionColor = color;
  }
  emit("update:modelValue", color);
  return color;
}

function schedulePoint(point: PlanePoint): void {
  pendingPoint = point;
  latestInteractionPoint = point;
  positionActiveAnnotations(point);
  if (pointerRaf !== null) return;
  pointerRaf = window.requestAnimationFrame(() => {
    pointerRaf = null;
    if (!isUnmounted && activePointerId !== null && pendingPoint) emitLivePoint(pendingPoint);
  });
}

function cancelPendingPoint(): void {
  if (pointerRaf !== null) window.cancelAnimationFrame(pointerRaf);
  pointerRaf = null;
  pendingPoint = null;
}

function onPointerDown(event: PointerEvent): void {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (activePointerId !== null) return;
  measureSurface();
  const point = pointFromPointer(event);
  if (!point || !surface.value) return;
  event.preventDefault();
  activePointerId = event.pointerId;
  interactionOrigin = { ...props.modelValue };
  latestInteractionPoint = null;
  latestInteractionColor = null;
  surface.value.focus({ preventScroll: true });
  surface.value.setPointerCapture?.(event.pointerId);
  schedulePoint(point);
}

function onPointerMove(event: PointerEvent): void {
  if (event.pointerId !== activePointerId) return;
  const point = pointFromPointer(event);
  if (!point) return;
  event.preventDefault();
  schedulePoint(point);
}

function finishPointer(event: PointerEvent): void {
  if (event.pointerId !== activePointerId) return;
  const point = pointFromPointer(event) ?? pendingPoint ?? latestInteractionPoint;
  endPointer();
  if (point) {
    const color = emitLivePoint(point);
    emit("commit", color);
  }
}

function endPointer(): void {
  const pointerId = activePointerId;
  cancelPendingPoint();
  activePointerId = null;
  latestInteractionPoint = null;
  latestInteractionColor = null;
  interactionOrigin = null;
  if (pointerId !== null && surface.value?.hasPointerCapture?.(pointerId)) {
    surface.value.releasePointerCapture(pointerId);
  }
}

function cancelInteraction(rollback: boolean): void {
  if (activePointerId === null) return;
  const origin = interactionOrigin;
  endPointer();
  if (rollback && origin) emit("update:modelValue", origin);
  positionActiveAnnotations(
    props.plane.positionActivePoint(rollback && origin ? origin : props.modelValue),
  );
  emit("cancel");
}

function onPointerCancel(event: PointerEvent): void {
  if (event.pointerId !== activePointerId) return;
  cancelInteraction(true);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && activePointerId !== null) {
    event.preventDefault();
    event.stopPropagation();
    cancelInteraction(true);
    return;
  }
  let action: PickerPlaneKeyboardAction;
  if (event.key === "ArrowLeft") action = "decrease-x";
  else if (event.key === "ArrowRight") action = "increase-x";
  else if (event.key === "ArrowUp") action = "increase-y";
  else if (event.key === "ArrowDown") action = "decrease-y";
  else if (event.key === "Home") action = "minimum-x";
  else if (event.key === "End") action = "maximum-x";
  else return;

  event.preventDefault();
  cancelInteraction(false);
  const next = props.plane.editFromKeyboard(props.modelValue, action, event.shiftKey);
  emit("update:modelValue", next);
  emit("commit", next);
}

watch([() => props.plane, fixedAxis], () => scheduleFieldDraw());
watch(
  () => props.plane,
  () => cancelInteraction(false),
  { flush: "sync" },
);
watch(
  () => [props.modelValue.l, props.modelValue.c, props.modelValue.h, props.modelValue.alpha],
  () => {
    const expected = latestInteractionColor ?? interactionOrigin;
    if (!expected || activePointerId === null) return;
    // Cloned v-model feedback is still ours; a different parent value supersedes the gesture.
    if (
      (["l", "c", "h", "alpha"] as const).some((key) => props.modelValue[key] !== expected[key])
    ) {
      cancelInteraction(false);
    }
  },
  { flush: "sync" },
);
watch(
  () => props.interactionPreview,
  () => scheduleFieldDraw(),
);
watch(pixelRatio, () => {
  lastFieldKey = "";
  scheduleFieldDraw();
});
watch(boundedActivePoint, (point) => positionActiveAnnotations(point));
watch(boundaryProjectionPoint, () => positionActiveAnnotations(boundedActivePoint.value));

onMounted(() => {
  isMounted = true;
  const device = useDevicePixelRatio();
  watch(device.pixelRatio, (value) => (pixelRatio.value = value), { immediate: true });
  useResizeObserver(surface, () => {
    measureSurface();
    positionActiveAnnotations(boundedActivePoint.value);
    scheduleFieldDraw();
  });
  useEventListener(
    "scroll",
    () => {
      boundsDirty = true;
    },
    { capture: true, passive: true },
  );
  void nextTick(() => {
    if (isUnmounted) return;
    measureSurface();
    positionActiveAnnotations(boundedActivePoint.value);
    drawField();
  });
});

onBeforeUnmount(() => {
  isUnmounted = true;
  if (fieldRaf !== null) window.cancelAnimationFrame(fieldRaf);
  fieldRaf = null;
  endPointer();
});
</script>

<template>
  <div
    class="color-plane"
    data-picker-plane
    :data-plane-id="plane.id"
    :data-field-quality="renderedFieldQuality"
    :data-field-resolution="
      plane.fieldSampling.kind === 'disc-gradient'
        ? `${plane.fieldSampling.rowCount}x${plane.fieldSampling.columnSamples}`
        : undefined
    "
    :style="instrumentStyle"
  >
    <div
      ref="surface"
      class="color-plane__surface"
      role="application"
      tabindex="0"
      :aria-label="planeLabel"
      :data-render-color-space="canvasColorSpace"
      :data-outside-instrument="
        props.plane.isPointInInstrumentDomain(activePoint) ? 'false' : 'true'
      "
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="finishPointer"
      @pointercancel="onPointerCancel"
      @lostpointercapture="onPointerCancel"
      @keydown="onKeydown"
    >
      <canvas ref="canvas" aria-hidden="true" />
      <span
        v-if="plane.id === 'oklab'"
        class="color-plane__domain-boundary"
        data-instrument-domain="disc"
        aria-hidden="true"
      />
      <svg
        class="color-plane__gamut"
        :viewBox="`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`"
        preserveAspectRatio="none"
        role="group"
        aria-label="Gamut and instrument boundary guides"
      >
        <path
          v-if="showDisplayP3Boundary"
          :d="displayP3Path"
          class="color-plane__boundary color-plane__boundary--p3"
          data-gamut-boundary="display-p3"
          vector-effect="non-scaling-stroke"
          aria-hidden="true"
        />
        <path
          v-if="showDisplayP3Boundary"
          :d="displayP3Path"
          class="color-plane__boundary-hit"
          data-gamut-boundary-hit="display-p3"
          vector-effect="non-scaling-stroke"
          aria-label="Display P3 gamut boundary"
          role="img"
        />
        <path
          v-if="showSrgbBoundary"
          :d="srgbPath"
          class="color-plane__boundary color-plane__boundary--srgb"
          data-gamut-boundary="srgb"
          vector-effect="non-scaling-stroke"
          aria-hidden="true"
        />
        <path
          v-if="showSrgbBoundary"
          :d="srgbPath"
          class="color-plane__boundary-hit"
          data-gamut-boundary-hit="srgb"
          vector-effect="non-scaling-stroke"
          aria-label="sRGB gamut boundary"
          role="img"
        />
        <circle
          v-if="plane.id === 'oklab'"
          class="color-plane__boundary-hit"
          data-gamut-boundary-hit="instrument-domain"
          cx="500"
          cy="500"
          r="499"
          vector-effect="non-scaling-stroke"
          aria-label="OKLab editable domain, not a gamut boundary"
          role="img"
        />
      </svg>
      <span
        v-if="boundaryProjectionPoint"
        class="color-plane__projection-connector"
        :style="boundaryProjectionConnectorStyle"
        data-table-boundary-guide-connector
        aria-hidden="true"
      />
      <span
        v-if="boundaryProjectionPoint"
        class="color-plane__marker color-plane__marker--projection"
        :style="{
          ...boundaryProjectionMarkerStyle,
          '--projection-marker-color': boundaryProjectionCss,
        }"
        data-table-boundary-guide-marker
        data-marker-role="srgb-boundary-projection"
        title="sRGB boundary projection"
        aria-label="sRGB boundary projection"
        role="img"
      />
      <span
        ref="warningMarker"
        v-show="warningVisible"
        class="color-plane__warning"
        data-gamut-warning="planar"
        :data-visible="warningVisible ? 'true' : 'false'"
        style="visibility: hidden"
        aria-hidden="true"
      >
        <GamutWarningGlyph />
      </span>
      <span
        ref="marker"
        class="color-plane__marker color-plane__marker--active"
        :style="{ ...markerStyle, '--marker-color': activeCss }"
        :data-outside-display-p3="warningVisible ? 'true' : 'false'"
        data-active-marker
        data-marker-role="active-color"
        title="Selected color"
        aria-label="Selected color"
        role="img"
      />
    </div>
    <span class="color-plane__render-mode">
      {{
        canvasColorSpace === "display-p3"
          ? "P3 canvas"
          : canvasColorSpace === "srgb"
            ? "sRGB canvas"
            : canvasColorSpace === "unavailable"
              ? "canvas unavailable"
              : "canvas pending"
      }}
    </span>
    <span class="color-plane__axis color-plane__axis--lightness">
      {{ plane.yAxis.symbol }} · {{ plane.yAxis.label }}
    </span>
    <span class="color-plane__axis color-plane__axis--chroma">
      {{ plane.xAxis.symbol }} · {{ plane.xAxis.label }}
    </span>
  </div>
</template>
