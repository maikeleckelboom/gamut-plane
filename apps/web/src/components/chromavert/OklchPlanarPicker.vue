<script setup lang="ts">
import {
  serializeColor,
  type ChromavertColor,
  type GamutBoundaryTable,
  type PickerPlaneContract,
  type PickerPlaneKeyboardAction,
  type PlanePoint,
} from "@chromavert/color";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import GamutWarningGlyph from "@/components/chromavert/GamutWarningGlyph.vue";
import {
  PICKER_ACTIVE_MARKER_RADIUS,
  PICKER_FALLBACK_MARKER_RADIUS,
  PICKER_WARNING_GLYPH_SIZE,
  PICKER_WARNING_MARKER_CLEARANCE,
  PICKER_WARNING_PREFERRED_OFFSET,
  PICKER_WARNING_SURFACE_INSET,
} from "@/components/chromavert/pickerInstrumentStyle";
import { placePlanarWarning } from "@/components/chromavert/pickerWarningPlacement";

const props = defineProps<{
  modelValue: ChromavertColor;
  plane: PickerPlaneContract;
  srgbTable: GamutBoundaryTable;
  displayP3Table: GamutBoundaryTable;
  srgbFallbackColor: ChromavertColor | null;
  warningVisible: boolean;
  warningLabel: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [color: ChromavertColor];
  commit: [color: ChromavertColor];
}>();

const VIEWBOX_SIZE = 1000;

const surface = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const marker = ref<HTMLSpanElement | null>(null);
const warningMarker = ref<HTMLSpanElement | null>(null);
const canvasColorSpace = ref<"pending" | "display-p3" | "srgb" | "unavailable">("pending");

let context: CanvasRenderingContext2D | null = null;
let resizeObserver: ResizeObserver | null = null;
let fieldRaf: number | null = null;
let pointerRaf: number | null = null;
let pendingPoint: PlanePoint | null = null;
let activePointerId: number | null = null;
let latestInteractionPoint: PlanePoint | null = null;
let latestInteractionColor: ChromavertColor | null = null;
let lastFieldKey = "";
let surfaceBounds = { left: 0, top: 0, width: 0, height: 0 };
let surfaceLocalSize = { width: 0, height: 0 };

const activeProjection = computed(() => props.plane.project(props.modelValue));
const activePoint = computed(() => activeProjection.value.point);
const boundedActivePoint = computed(() => props.plane.positionActivePoint(props.modelValue));
const fallbackPoint = computed<PlanePoint | null>(() => {
  if (!props.srgbFallbackColor) return null;
  return props.plane.positionActivePoint(props.srgbFallbackColor);
});

const markerStyle = computed(() => pointStyle(boundedActivePoint.value));
const fallbackMarkerStyle = computed(() =>
  fallbackPoint.value ? pointStyle(fallbackPoint.value) : undefined,
);
const fallbackCss = computed(() =>
  props.srgbFallbackColor ? serializeColor(props.srgbFallbackColor) : "",
);
const fallbackConnectorStyle = computed(() => {
  const fallback = fallbackPoint.value;
  if (!fallback) return undefined;
  const active = boundedActivePoint.value;
  const left = Math.min(active.x, fallback.x);
  return {
    left: `${left * 100}%`,
    top: `${active.y * 100}%`,
    width: `${Math.abs(active.x - fallback.x) * 100}%`,
  };
});

const srgbPath = computed(() =>
  geometryToSvgPath(props.plane.buildGamutContour(props.srgbTable, activeProjection.value.fixed)),
);
const displayP3Path = computed(() =>
  geometryToSvgPath(
    props.plane.buildGamutContour(props.displayP3Table, activeProjection.value.fixed),
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
  "--picker-fallback-marker-size": `${PICKER_FALLBACK_MARKER_RADIUS * 2}px`,
};

function pointStyle(point: PlanePoint): Record<string, string> {
  return { left: `${point.x * 100}%`, top: `${point.y * 100}%` };
}

function geometryToSvgPath(geometry: Float32Array): string {
  let path = "";
  for (let index = 0; index < geometry.length; index += 2) {
    const x = (geometry[index] ?? 0) * VIEWBOX_SIZE;
    const y = (geometry[index + 1] ?? 0) * VIEWBOX_SIZE;
    path += `${index === 0 ? "M" : " L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return path;
}

function getCanvasContext(element: HTMLCanvasElement): CanvasRenderingContext2D | null {
  try {
    const requested = element.getContext("2d", {
      alpha: false,
      colorSpace: "display-p3",
      desynchronized: true,
    });
    if (requested) {
      const granted = requested.getContextAttributes?.().colorSpace;
      canvasColorSpace.value = granted === "display-p3" ? "display-p3" : "srgb";
      return requested;
    }
  } catch {
    // The default context below is the deterministic rendering fallback.
  }

  try {
    const fallback = element.getContext("2d", { alpha: false });
    canvasColorSpace.value = fallback ? "srgb" : "unavailable";
    return fallback;
  } catch {
    canvasColorSpace.value = "unavailable";
    return null;
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
  const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  const backingWidth = Math.round(width * pixelRatio);
  const backingHeight = Math.round(height * pixelRatio);

  if (element.width !== backingWidth || element.height !== backingHeight) {
    element.width = backingWidth;
    element.height = backingHeight;
  }
  return { width, height, backingWidth, backingHeight, pixelRatio };
}

function drawField(): void {
  fieldRaf = null;
  const element = canvas.value;
  if (!element) return;
  context ??= getCanvasContext(element);
  if (!context) return;

  const { width, height, backingWidth, backingHeight, pixelRatio } = resizeCanvas(element);
  const fixed = activeProjection.value.fixed;
  const fieldKey = `${props.plane.id}:${width}:${height}:${pixelRatio}:${fixed.toFixed(3)}:${canvasColorSpace.value}`;
  if (fieldKey === lastFieldKey) return;

  const color: ChromavertColor = { l: 0, c: 0, h: 0, alpha: 1 };
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, backingWidth, backingHeight);

  const sampling = props.plane.fieldSampling;
  if (sampling.kind === "column-gradient") {
    const rowCount = Math.ceil(height / sampling.rowStep) + 1;
    for (let column = 0; column < width; column += 1) {
      const gradient = context.createLinearGradient(0, 0, 0, backingHeight);
      const x = column / Math.max(1, width - 1);

      for (let index = 0; index < rowCount; index += 1) {
        const row = Math.min(index * sampling.rowStep, height);
        props.plane.sampleField({ x, y: row / height }, fixed, color);
        gradient.addColorStop(index / Math.max(1, rowCount - 1), serializeColor(color));
      }

      context.fillStyle = gradient;
      const start = Math.round(column * pixelRatio);
      const end = Math.round((column + 1) * pixelRatio);
      context.fillRect(start, 0, Math.max(1, end - start), backingHeight);
    }
  } else {
    const resolution = sampling.resolution;
    context.fillStyle = "oklch(0.12 0 0)";
    context.fillRect(0, 0, backingWidth, backingHeight);
    for (let row = 0; row < resolution; row += 1) {
      for (let column = 0; column < resolution; column += 1) {
        const point = { x: (column + 0.5) / resolution, y: (row + 0.5) / resolution };
        if (!props.plane.isPointInInstrumentDomain(point)) continue;
        props.plane.sampleField(point, fixed, color);
        context.fillStyle = serializeColor(color);
        const left = Math.floor((column / resolution) * backingWidth);
        const top = Math.floor((row / resolution) * backingHeight);
        const right = Math.ceil(((column + 1) / resolution) * backingWidth);
        const bottom = Math.ceil(((row + 1) / resolution) * backingHeight);
        context.fillRect(left, top, right - left, bottom - top);
      }
    }
  }

  lastFieldKey = fieldKey;
}

function scheduleFieldDraw(): void {
  if (fieldRaf !== null) return;
  fieldRaf = window.requestAnimationFrame(drawField);
}

function pointFromPointer(event: PointerEvent): PlanePoint | null {
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
  if (bounds.width <= 0 || bounds.height <= 0) return;
  surfaceBounds = {
    left: bounds.left,
    top: bounds.top,
    width: bounds.width,
    height: bounds.height,
  };
  surfaceLocalSize = {
    width: element.clientWidth || bounds.width,
    height: element.clientHeight || bounds.height,
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

  const fallback = fallbackPoint.value;
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
    fallbackMarker: fallback
      ? {
          center: {
            x: fallback.x * surfaceLocalSize.width,
            y: fallback.y * surfaceLocalSize.height,
          },
          radius: PICKER_FALLBACK_MARKER_RADIUS,
        }
      : undefined,
  });
  warning.style.left = `${placement.left}px`;
  warning.style.top = `${placement.top}px`;
  warning.style.visibility = "visible";
}

function emitLivePoint(point: PlanePoint): ChromavertColor {
  pendingPoint = null;
  latestInteractionPoint = point;
  positionActiveAnnotations(point);
  const color = props.plane.unproject(point, activeProjection.value.fixed, props.modelValue);
  latestInteractionColor = color;
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
    if (pendingPoint) emitLivePoint(pendingPoint);
  });
}

function cancelPendingPoint(): void {
  if (pointerRaf !== null) window.cancelAnimationFrame(pointerRaf);
  pointerRaf = null;
  pendingPoint = null;
}

function onPointerDown(event: PointerEvent): void {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  measureSurface();
  const point = pointFromPointer(event);
  if (!point || !surface.value) return;
  event.preventDefault();
  activePointerId = event.pointerId;
  latestInteractionPoint = null;
  latestInteractionColor = null;
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
  cancelPendingPoint();
  if (point) {
    const color = emitLivePoint(point);
    emit("commit", color);
  }
  const element = surface.value;
  activePointerId = null;
  latestInteractionPoint = null;
  latestInteractionColor = null;
  if (element?.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
}

function onPointerCancel(event: PointerEvent): void {
  if (event.pointerId !== activePointerId) return;
  cancelPendingPoint();
  activePointerId = null;
  latestInteractionPoint = null;
  latestInteractionColor = null;
  positionActiveAnnotations(boundedActivePoint.value);
}

function onLostPointerCapture(event: PointerEvent): void {
  if (event.pointerId !== activePointerId) return;
  const pending = pendingPoint;
  const point = pending ?? latestInteractionPoint;
  const color = pending && point ? emitLivePoint(point) : latestInteractionColor;
  cancelPendingPoint();
  activePointerId = null;
  latestInteractionPoint = null;
  latestInteractionColor = null;
  if (color) emit("commit", color);
}

function onKeydown(event: KeyboardEvent): void {
  let action: PickerPlaneKeyboardAction;
  if (event.key === "ArrowLeft") action = "decrease-x";
  else if (event.key === "ArrowRight") action = "increase-x";
  else if (event.key === "ArrowUp") action = "increase-y";
  else if (event.key === "ArrowDown") action = "decrease-y";
  else if (event.key === "Home") action = "minimum-x";
  else if (event.key === "End") action = "maximum-x";
  else return;

  event.preventDefault();
  const next = props.plane.editFromKeyboard(props.modelValue, action, event.shiftKey);
  emit("update:modelValue", next);
  emit("commit", next);
}

watch(
  () => activeProjection.value.fixed,
  () => scheduleFieldDraw(),
);
watch(boundedActivePoint, (point) => positionActiveAnnotations(point));
watch(fallbackPoint, () => positionActiveAnnotations(boundedActivePoint.value));

onMounted(() => {
  resizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(() => {
          measureSurface();
          positionActiveAnnotations(boundedActivePoint.value);
          scheduleFieldDraw();
        });
  if (surface.value) resizeObserver?.observe(surface.value);
  void nextTick(() => {
    measureSurface();
    positionActiveAnnotations(boundedActivePoint.value);
    drawField();
  });
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (fieldRaf !== null) window.cancelAnimationFrame(fieldRaf);
  cancelPendingPoint();
});
</script>

<template>
  <div class="oklch-planar-picker" data-picker-plane :style="instrumentStyle">
    <div
      ref="surface"
      class="oklch-planar-picker__surface"
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
      @lostpointercapture="onLostPointerCapture"
      @keydown="onKeydown"
    >
      <canvas ref="canvas" aria-hidden="true" />
      <svg
        class="oklch-planar-picker__gamut"
        :viewBox="`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          :d="displayP3Path"
          class="oklch-planar-picker__boundary oklch-planar-picker__boundary--p3"
          data-gamut-boundary="display-p3"
          vector-effect="non-scaling-stroke"
        />
        <path
          :d="srgbPath"
          class="oklch-planar-picker__boundary oklch-planar-picker__boundary--srgb"
          data-gamut-boundary="srgb"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <span
        v-if="fallbackPoint"
        class="oklch-planar-picker__fallback-connector"
        :style="fallbackConnectorStyle"
        data-fallback-connector
        aria-hidden="true"
      />
      <span
        v-if="fallbackPoint"
        class="oklch-planar-picker__marker oklch-planar-picker__marker--fallback"
        :style="{ ...fallbackMarkerStyle, '--fallback-marker-color': fallbackCss }"
        data-fallback-marker
        aria-hidden="true"
      />
      <span
        ref="warningMarker"
        v-show="warningVisible"
        class="oklch-planar-picker__warning"
        data-gamut-warning="planar"
        :data-visible="warningVisible ? 'true' : 'false'"
        style="visibility: hidden"
        aria-hidden="true"
      >
        <GamutWarningGlyph />
      </span>
      <span
        ref="marker"
        class="oklch-planar-picker__marker oklch-planar-picker__marker--active"
        :style="{ ...markerStyle, '--marker-color': activeCss }"
        :data-outside-display-p3="warningVisible ? 'true' : 'false'"
        data-active-marker
        aria-hidden="true"
      />
    </div>
    <span class="oklch-planar-picker__render-mode">
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
    <span class="oklch-planar-picker__axis oklch-planar-picker__axis--lightness">
      {{ plane.yAxis.symbol }} · {{ plane.yAxis.label }}
    </span>
    <span class="oklch-planar-picker__axis oklch-planar-picker__axis--chroma">
      {{ plane.xAxis.symbol }} · {{ plane.xAxis.label }}
    </span>
  </div>
</template>
