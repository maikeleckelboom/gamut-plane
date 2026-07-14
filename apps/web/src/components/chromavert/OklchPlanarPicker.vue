<script setup lang="ts">
import {
  serializeColor,
  type ChromavertColor,
  type GamutBoundaryTable,
  type PickerPlaneContract,
  type PickerPlaneKeyboardAction,
  type PickerPlaneSampleScratch,
  type PlanePoint,
} from "@chromavert/color";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import GamutWarningGlyph from "@/components/chromavert/GamutWarningGlyph.vue";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  srgbFallbackGuideColor: ChromavertColor | null;
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
const showDisplayP3Boundary = ref(true);
const showSrgbBoundary = ref(true);
const showInstrumentDomain = ref(true);
const showNeutralOrigin = ref(false);

let context: CanvasRenderingContext2D | null = null;
let discFieldBuffer: HTMLCanvasElement | null = null;
let discFieldContext: CanvasRenderingContext2D | null = null;
let resizeObserver: ResizeObserver | null = null;
let resolutionQuery: MediaQueryList | null = null;
let fieldRaf: number | null = null;
let pointerRaf: number | null = null;
let pendingPoint: PlanePoint | null = null;
let activePointerId: number | null = null;
let latestInteractionPoint: PlanePoint | null = null;
let latestInteractionColor: ChromavertColor | null = null;
let lastFieldKey = "";
let surfaceBounds = { left: 0, top: 0, width: 0, height: 0 };
let surfaceLocalSize = { width: 0, height: 0 };
const fieldScratch: PickerPlaneSampleScratch = { input: [0, 0, 0], converted: [0, 0, 0] };

const activeProjection = computed(() => props.plane.project(props.modelValue));
const activePoint = computed(() => activeProjection.value.point);
const boundedActivePoint = computed(() => props.plane.positionActivePoint(props.modelValue));
const fallbackGuidePoint = computed<PlanePoint | null>(() => {
  if (!props.srgbFallbackGuideColor) return null;
  return props.plane.positionActivePoint(props.srgbFallbackGuideColor);
});

const markerStyle = computed(() => pointStyle(boundedActivePoint.value));
const fallbackGuideMarkerStyle = computed(() =>
  fallbackGuidePoint.value ? pointStyle(fallbackGuidePoint.value) : undefined,
);
const fallbackGuideCss = computed(() =>
  props.srgbFallbackGuideColor ? serializeColor(props.srgbFallbackGuideColor) : "",
);
const fallbackGuideConnectorStyle = computed(() => {
  const guide = fallbackGuidePoint.value;
  if (!guide) return undefined;
  const active = boundedActivePoint.value;
  if (props.plane.id === "oklab") {
    const deltaX = guide.x - active.x;
    const deltaY = guide.y - active.y;
    return {
      left: `${active.x * 100}%`,
      top: `${active.y * 100}%`,
      width: `${Math.hypot(deltaX, deltaY) * 100}%`,
      transform: `translateY(-50%) rotate(${Math.atan2(deltaY, deltaX)}rad)`,
      transformOrigin: "left center",
    };
  }
  const left = Math.min(active.x, guide.x);
  return {
    left: `${left * 100}%`,
    top: `${active.y * 100}%`,
    width: `${Math.abs(active.x - guide.x) * 100}%`,
  };
});

const srgbPath = computed(() =>
  geometryToSvgPath(
    props.plane.buildGamutContour(props.srgbTable, activeProjection.value.fixed),
    props.plane.gamutContourClosed,
  ),
);
const displayP3Path = computed(() =>
  geometryToSvgPath(
    props.plane.buildGamutContour(props.displayP3Table, activeProjection.value.fixed),
    props.plane.gamutContourClosed,
  ),
);
const activeCss = computed(() => serializeColor(props.modelValue));
const planeLabel = computed(() => {
  const projection = activeProjection.value;
  const label = `${props.plane.label} plane. Horizontal ${props.plane.xAxis.label} ${projection.x.toFixed(3)}. Vertical ${props.plane.yAxis.label} ${projection.y.toFixed(3)}. Arrow keys adjust the selected point. Right-click for boundary visibility.`;
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

function geometryToSvgPath(geometry: Float32Array, closed: boolean): string {
  let path = "";
  for (let index = 0; index < geometry.length; index += 2) {
    const x = (geometry[index] ?? 0) * VIEWBOX_SIZE;
    const y = (geometry[index + 1] ?? 0) * VIEWBOX_SIZE;
    path += `${index === 0 ? "M" : " L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return closed ? `${path} Z` : path;
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

function getDiscFieldContext(size: number): CanvasRenderingContext2D | null {
  discFieldBuffer ??= document.createElement("canvas");
  if (discFieldBuffer.width !== size || discFieldBuffer.height !== size) {
    discFieldBuffer.width = size;
    discFieldBuffer.height = size;
  }
  discFieldContext ??= getCanvasContext(discFieldBuffer);
  return discFieldContext;
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
  const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
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
        props.plane.sampleField({ x, y: row / height }, fixed, color, fieldScratch);
        gradient.addColorStop(index / Math.max(1, rowCount - 1), serializeColor(color));
      }

      context.fillStyle = gradient;
      const start = Math.round(column * pixelRatio);
      const end = Math.round((column + 1) * pixelRatio);
      context.fillRect(start, 0, Math.max(1, end - start), backingHeight);
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
}

function scheduleFieldDraw(): void {
  if (fieldRaf !== null) return;
  fieldRaf = window.requestAnimationFrame(drawField);
}

function handleResolutionChange(): void {
  lastFieldKey = "";
  scheduleFieldDraw();
  observeResolution();
}

function observeResolution(): void {
  resolutionQuery?.removeEventListener("change", handleResolutionChange);
  if (typeof window.matchMedia !== "function") {
    resolutionQuery = null;
    return;
  }
  resolutionQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  resolutionQuery.addEventListener("change", handleResolutionChange);
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

  const fallbackGuide = fallbackGuidePoint.value;
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
    fallbackMarker: fallbackGuide
      ? {
          center: {
            x: fallbackGuide.x * surfaceLocalSize.width,
            y: fallbackGuide.y * surfaceLocalSize.height,
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
watch(fallbackGuidePoint, () => positionActiveAnnotations(boundedActivePoint.value));

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
  observeResolution();
  void nextTick(() => {
    measureSurface();
    positionActiveAnnotations(boundedActivePoint.value);
    drawField();
  });
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resolutionQuery?.removeEventListener("change", handleResolutionChange);
  if (fieldRaf !== null) window.cancelAnimationFrame(fieldRaf);
  cancelPendingPoint();
});
</script>

<template>
  <div
    class="oklch-planar-picker"
    data-picker-plane
    :data-plane-id="plane.id"
    :data-field-resolution="
      plane.fieldSampling.kind === 'disc-gradient'
        ? `${plane.fieldSampling.rowCount}x${plane.fieldSampling.columnSamples}`
        : undefined
    "
    :style="instrumentStyle"
  >
    <TooltipProvider>
      <ContextMenu>
        <ContextMenuTrigger as-child>
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
            <span
              v-if="plane.id === 'oklab' && showInstrumentDomain"
              class="oklch-planar-picker__domain-boundary"
              data-instrument-domain="disc"
              aria-hidden="true"
            />
            <svg
              class="oklch-planar-picker__gamut"
              :viewBox="`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`"
              preserveAspectRatio="none"
              role="group"
              aria-label="Gamut and instrument boundary guides"
            >
              <path
                v-if="showDisplayP3Boundary"
                :d="displayP3Path"
                class="oklch-planar-picker__boundary oklch-planar-picker__boundary--p3"
                data-gamut-boundary="display-p3"
                vector-effect="non-scaling-stroke"
                aria-hidden="true"
              />
              <Tooltip v-if="showDisplayP3Boundary">
                <TooltipTrigger as-child>
                  <path
                    :d="displayP3Path"
                    class="oklch-planar-picker__boundary-hit"
                    data-gamut-boundary-hit="display-p3"
                    vector-effect="non-scaling-stroke"
                    aria-label="Display P3 gamut boundary"
                  />
                </TooltipTrigger>
                <TooltipContent side="top">Display P3 gamut boundary</TooltipContent>
              </Tooltip>
              <path
                v-if="showSrgbBoundary"
                :d="srgbPath"
                class="oklch-planar-picker__boundary oklch-planar-picker__boundary--srgb"
                data-gamut-boundary="srgb"
                vector-effect="non-scaling-stroke"
                aria-hidden="true"
              />
              <Tooltip v-if="showSrgbBoundary">
                <TooltipTrigger as-child>
                  <path
                    :d="srgbPath"
                    class="oklch-planar-picker__boundary-hit"
                    data-gamut-boundary-hit="srgb"
                    vector-effect="non-scaling-stroke"
                    aria-label="sRGB gamut boundary"
                  />
                </TooltipTrigger>
                <TooltipContent side="top">sRGB gamut boundary</TooltipContent>
              </Tooltip>
              <Tooltip v-if="plane.id === 'oklab' && showInstrumentDomain">
                <TooltipTrigger as-child>
                  <circle
                    class="oklch-planar-picker__boundary-hit"
                    data-gamut-boundary-hit="instrument-domain"
                    cx="500"
                    cy="500"
                    r="499"
                    vector-effect="non-scaling-stroke"
                    aria-label="OKLab editable domain, not a gamut boundary"
                  />
                </TooltipTrigger>
                <TooltipContent side="top">
                  OKLab editable domain · not a gamut boundary
                </TooltipContent>
              </Tooltip>
            </svg>
            <Tooltip v-if="plane.id === 'oklab' && showNeutralOrigin">
              <TooltipTrigger as-child>
                <span
                  class="oklch-planar-picker__neutral-center"
                  data-neutral-center
                  data-marker-role="neutral-origin"
                  aria-label="Neutral origin, a 0, b 0"
                />
              </TooltipTrigger>
              <TooltipContent side="top">Neutral origin · a 0 · b 0</TooltipContent>
            </Tooltip>
            <span
              v-if="fallbackGuidePoint"
              class="oklch-planar-picker__fallback-connector"
              :style="fallbackGuideConnectorStyle"
              data-table-fallback-guide-connector
              aria-hidden="true"
            />
            <Tooltip v-if="fallbackGuidePoint">
              <TooltipTrigger as-child>
                <span
                  class="oklch-planar-picker__marker oklch-planar-picker__marker--fallback"
                  :style="{
                    ...fallbackGuideMarkerStyle,
                    '--fallback-marker-color': fallbackGuideCss,
                  }"
                  data-table-fallback-guide-marker
                  data-marker-role="srgb-table-fallback-guide"
                  aria-label="sRGB table fallback guide"
                />
              </TooltipTrigger>
              <TooltipContent side="top">sRGB table fallback guide</TooltipContent>
            </Tooltip>
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
            <Tooltip>
              <TooltipTrigger as-child>
                <span
                  ref="marker"
                  class="oklch-planar-picker__marker oklch-planar-picker__marker--active"
                  :style="{ ...markerStyle, '--marker-color': activeCss }"
                  :data-outside-display-p3="warningVisible ? 'true' : 'false'"
                  data-active-marker
                  data-marker-role="active-color"
                  aria-label="Active canonical color"
                />
              </TooltipTrigger>
              <TooltipContent side="top">Active canonical color</TooltipContent>
            </Tooltip>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent class="picker-boundary-menu">
          <ContextMenuLabel>Boundary visibility</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuCheckboxItem
            v-model="showDisplayP3Boundary"
            data-boundary-toggle="display-p3"
          >
            <i class="picker-key picker-key--p3" aria-hidden="true" />
            Display P3 gamut
          </ContextMenuCheckboxItem>
          <ContextMenuCheckboxItem v-model="showSrgbBoundary" data-boundary-toggle="srgb">
            <i class="picker-key picker-key--srgb" aria-hidden="true" />
            sRGB gamut
          </ContextMenuCheckboxItem>
          <ContextMenuCheckboxItem
            v-if="plane.id === 'oklab'"
            v-model="showInstrumentDomain"
            data-boundary-toggle="instrument-domain"
          >
            <i class="picker-key picker-key--domain" aria-hidden="true" />
            OKLab editable domain
          </ContextMenuCheckboxItem>
          <ContextMenuCheckboxItem
            v-if="plane.id === 'oklab'"
            v-model="showNeutralOrigin"
            data-boundary-toggle="neutral-origin"
          >
            <i class="picker-key picker-key--neutral" aria-hidden="true" />
            Neutral origin
          </ContextMenuCheckboxItem>
          <ContextMenuSeparator />
          <p class="picker-boundary-menu__note">
            View state only · color and export stay unchanged.
          </p>
        </ContextMenuContent>
      </ContextMenu>
    </TooltipProvider>
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
