<script setup lang="ts">
import {
  OKLCH_PICKER_MAX_CHROMA,
  buildLightnessChromaBoundaryPath,
  clampPlanePointToInstrumentBounds,
  oklchToPlanePoint,
  planePointToOklch,
  serializeColor,
  type ChromavertColor,
  type GamutBoundaryTable,
  type PlanePoint,
} from "@chromavert/color";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{
  modelValue: ChromavertColor;
  srgbTable: GamutBoundaryTable;
  displayP3Table: GamutBoundaryTable;
  srgbFallbackGuideChroma: number | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [color: ChromavertColor];
}>();

const VIEWBOX_SIZE = 1000;
const FIELD_ROW_STEP = 10;
const KEYBOARD_FINE_STEP = 0.005;
const KEYBOARD_COARSE_STEP = 0.02;

const surface = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const marker = ref<HTMLSpanElement | null>(null);
const canvasColorSpace = ref<"pending" | "display-p3" | "srgb" | "unavailable">("pending");

let context: CanvasRenderingContext2D | null = null;
let resizeObserver: ResizeObserver | null = null;
let fieldRaf: number | null = null;
let pointerRaf: number | null = null;
let pendingPoint: PlanePoint | null = null;
let activePointerId: number | null = null;
let lastFieldKey = "";

const activePoint = computed(() => oklchToPlanePoint(props.modelValue));
const boundedActivePoint = computed(() => clampPlanePointToInstrumentBounds(activePoint.value));
const fallbackPoint = computed<PlanePoint | null>(() => {
  if (props.srgbFallbackGuideChroma === null) return null;
  return clampPlanePointToInstrumentBounds({
    x: props.srgbFallbackGuideChroma / OKLCH_PICKER_MAX_CHROMA,
    y: 1 - props.modelValue.l,
  });
});

const markerStyle = computed(() => pointStyle(boundedActivePoint.value));
const fallbackMarkerStyle = computed(() =>
  fallbackPoint.value ? pointStyle(fallbackPoint.value) : undefined,
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
  geometryToSvgPath(buildLightnessChromaBoundaryPath(props.srgbTable, props.modelValue.h)),
);
const displayP3Path = computed(() =>
  geometryToSvgPath(buildLightnessChromaBoundaryPath(props.displayP3Table, props.modelValue.h)),
);
const activeCss = computed(() => serializeColor(props.modelValue));
const planeLabel = computed(
  () =>
    `OKLCH plane. Horizontal chroma ${props.modelValue.c.toFixed(3)}. Vertical lightness ${props.modelValue.l.toFixed(3)}. Arrow keys adjust the selected point.`,
);

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
  const hue = props.modelValue.h;
  const fieldKey = `${width}:${height}:${pixelRatio}:${hue.toFixed(3)}:${canvasColorSpace.value}`;
  if (fieldKey === lastFieldKey) return;

  const rowCount = Math.ceil(height / FIELD_ROW_STEP) + 1;
  const color: ChromavertColor = { l: 0, c: 0, h: hue, alpha: 1 };
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, backingWidth, backingHeight);

  for (let column = 0; column < width; column += 1) {
    const gradient = context.createLinearGradient(0, 0, 0, backingHeight);
    color.c = (column / Math.max(1, width - 1)) * OKLCH_PICKER_MAX_CHROMA;

    for (let index = 0; index < rowCount; index += 1) {
      const row = Math.min(index * FIELD_ROW_STEP, height);
      color.l = 1 - row / height;
      gradient.addColorStop(index / Math.max(1, rowCount - 1), serializeColor(color));
    }

    context.fillStyle = gradient;
    const start = Math.round(column * pixelRatio);
    const end = Math.round((column + 1) * pixelRatio);
    context.fillRect(start, 0, Math.max(1, end - start), backingHeight);
  }

  lastFieldKey = fieldKey;
}

function scheduleFieldDraw(): void {
  if (fieldRaf !== null) return;
  fieldRaf = window.requestAnimationFrame(drawField);
}

function pointFromPointer(event: PointerEvent): PlanePoint | null {
  const element = surface.value;
  if (!element) return null;
  const bounds = element.getBoundingClientRect();
  return clampPlanePointToInstrumentBounds({
    x: (event.clientX - bounds.left) / Math.max(1, bounds.width),
    y: (event.clientY - bounds.top) / Math.max(1, bounds.height),
  });
}

function positionMarker(point: PlanePoint): void {
  const element = marker.value;
  if (!element) return;
  element.style.left = `${point.x * 100}%`;
  element.style.top = `${point.y * 100}%`;
}

function commitPoint(point: PlanePoint): void {
  pendingPoint = null;
  positionMarker(point);
  emit("update:modelValue", planePointToOklch(point, props.modelValue));
}

function schedulePoint(point: PlanePoint): void {
  pendingPoint = point;
  positionMarker(point);
  if (pointerRaf !== null) return;
  pointerRaf = window.requestAnimationFrame(() => {
    pointerRaf = null;
    if (pendingPoint) commitPoint(pendingPoint);
  });
}

function cancelPendingPoint(): void {
  if (pointerRaf !== null) window.cancelAnimationFrame(pointerRaf);
  pointerRaf = null;
  pendingPoint = null;
}

function onPointerDown(event: PointerEvent): void {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const point = pointFromPointer(event);
  if (!point || !surface.value) return;
  event.preventDefault();
  activePointerId = event.pointerId;
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
  const point = pointFromPointer(event) ?? pendingPoint;
  cancelPendingPoint();
  if (point) commitPoint(point);
  const element = surface.value;
  if (element?.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
  activePointerId = null;
}

function onPointerCancel(event: PointerEvent): void {
  if (event.pointerId !== activePointerId) return;
  cancelPendingPoint();
  activePointerId = null;
  positionMarker(boundedActivePoint.value);
}

function onLostPointerCapture(event: PointerEvent): void {
  if (event.pointerId !== activePointerId) return;
  if (pendingPoint) commitPoint(pendingPoint);
  cancelPendingPoint();
  activePointerId = null;
}

function onKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? KEYBOARD_COARSE_STEP : KEYBOARD_FINE_STEP;
  const next: ChromavertColor = {
    l: props.modelValue.l,
    c: props.modelValue.c,
    h: props.modelValue.h,
    alpha: props.modelValue.alpha,
  };

  if (event.key === "ArrowLeft") next.c -= step;
  else if (event.key === "ArrowRight") next.c += step;
  else if (event.key === "ArrowUp") next.l += step;
  else if (event.key === "ArrowDown") next.l -= step;
  else if (event.key === "Home") next.c = 0;
  else if (event.key === "End") next.c = OKLCH_PICKER_MAX_CHROMA;
  else return;

  event.preventDefault();
  next.l = Math.min(1, Math.max(0, next.l));
  next.c = Math.min(OKLCH_PICKER_MAX_CHROMA, Math.max(0, next.c));
  emit("update:modelValue", next);
}

watch(
  () => props.modelValue.h,
  () => scheduleFieldDraw(),
);
watch(boundedActivePoint, (point) => positionMarker(point));

onMounted(() => {
  resizeObserver =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => scheduleFieldDraw());
  if (canvas.value) resizeObserver?.observe(canvas.value);
  void nextTick(drawField);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (fieldRaf !== null) window.cancelAnimationFrame(fieldRaf);
  cancelPendingPoint();
});
</script>

<template>
  <div class="oklch-planar-picker" data-picker-plane>
    <div
      ref="surface"
      class="oklch-planar-picker__surface"
      role="application"
      tabindex="0"
      :aria-label="planeLabel"
      :data-render-color-space="canvasColorSpace"
      :data-outside-instrument="activePoint.x > 1 ? 'true' : 'false'"
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
        aria-hidden="true"
      />
      <span
        v-if="fallbackPoint"
        class="oklch-planar-picker__marker oklch-planar-picker__marker--fallback"
        :style="fallbackMarkerStyle"
        data-fallback-marker
        aria-hidden="true"
      />
      <span
        ref="marker"
        class="oklch-planar-picker__marker oklch-planar-picker__marker--active"
        :style="{ ...markerStyle, '--marker-color': activeCss }"
        data-active-marker
        aria-hidden="true"
      />
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
    </div>
    <span class="oklch-planar-picker__axis oklch-planar-picker__axis--lightness">
      L · lightness
    </span>
    <span class="oklch-planar-picker__axis oklch-planar-picker__axis--chroma">C · chroma</span>
  </div>
</template>
