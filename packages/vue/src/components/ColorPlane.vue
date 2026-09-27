<script setup lang="ts">
import { gpAttribute, gpAxis, gpGamut, gpMarker, gpPart } from "@gamut-plane/ui";
import {
  authorPlaneEdit,
  definingEquals,
  keyboardPlanePoint,
  projectColorToPlane,
  type ColorValue,
  type GamutBoundaryTable,
  type PickerPlaneFieldSampler,
  type PickerPlaneGeometry,
  type PickerPlaneKeyboardAction,
  type PlanePoint,
  type PlaneEditReference,
} from "@gamut-plane/core";
import { useDevicePixelRatio, useEventListener, useResizeObserver } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import GamutWarningGlyph from "./GamutWarningGlyph.vue";
import {
  PICKER_ACTIVE_MARKER_RADIUS,
  PICKER_TARGET_GUIDE_MARKER_RADIUS,
  PICKER_WARNING_GLYPH_SIZE,
  PICKER_WARNING_MARKER_CLEARANCE,
  PICKER_WARNING_PREFERRED_OFFSET,
  PICKER_WARNING_SURFACE_INSET,
} from "@gamut-plane/render";
import { placePlanarWarning } from "@gamut-plane/render";

import {
  guideConnectorStyle,
  createFieldRenderer,
  pointStyle,
  geometryToSvgPath,
  VIEWBOX_SIZE,
  type FieldRenderer,
  type CanvasColorSpaceStatus,
  type RenderedFieldQuality,
} from "@gamut-plane/render";

const props = withDefaults(
  defineProps<{
    modelValue: ColorValue;
    fieldHue: number;
    markerCss: string;
    editReference?: PlaneEditReference;
    plane: PickerPlaneGeometry & PickerPlaneFieldSampler;
    srgbTable: GamutBoundaryTable;
    displayP3Table: GamutBoundaryTable;
    targetGuidePoint: PlanePoint | null;
    targetGuideCss: string;
    targetGuideLabel: string;
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
  "update:modelValue": [color: ColorValue];
  commit: [color: ColorValue];
  cancel: [];
  capability: [status: CanvasColorSpaceStatus];
}>();

const surface = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const marker = ref<HTMLSpanElement | null>(null);
const warningMarker = ref<HTMLSpanElement | null>(null);
const canvasColorSpace = ref<CanvasColorSpaceStatus>("pending");
const renderedFieldQuality = ref<RenderedFieldQuality>("full");
const pixelRatio = ref(1);

let renderer: FieldRenderer | null = null;
let fieldRaf: number | null = null;
let pointerRaf: number | null = null;
let pendingPoint: PlanePoint | null = null;
let activePointerId: number | null = null;
let latestInteractionPoint: PlanePoint | null = null;
let latestInteractionColor: ColorValue | null = null;
let interactionOrigin: ColorValue | null = null;
let boundsDirty = false;
let isUnmounted = false;
let isMounted = false;
let surfaceBounds = { left: 0, top: 0, width: 0, height: 0 };
let surfaceLocalSize = { width: 0, height: 0 };

const activeProjection = computed(() => {
  const projected = projectColorToPlane(props.modelValue, props.plane.id);
  if (!projected.ok) throw new RangeError("Selected color cannot be projected into the plane");
  return projected.value;
});
const fixedAxis = computed(() =>
  props.plane.id === "oklch" ? props.fieldHue : activeProjection.value.representation.channels[0],
);
const activePoint = computed(() => activeProjection.value.point);
const boundedActivePoint = computed(() => props.plane.constrainPoint(activePoint.value));
const markerStyle = computed(() => pointStyle(boundedActivePoint.value));
const targetGuideMarkerStyle = computed(() =>
  props.targetGuidePoint ? pointStyle(props.targetGuidePoint) : undefined,
);
// Plane markers must occlude guides even when the authored color has transparency.
const targetGuideConnectorStyle = computed(() => {
  const guide = props.targetGuidePoint;
  if (!guide) return undefined;
  const active = boundedActivePoint.value;
  return guideConnectorStyle(active, guide, props.plane.id === "oklab");
});

const srgbPath = computed(() =>
  props.showSrgbBoundary
    ? geometryToSvgPath(
        props.plane.buildGamutContour(props.srgbTable, fixedAxis.value),
        props.plane.gamutContourClosed,
      )
    : "",
);
const displayP3Path = computed(() =>
  props.showDisplayP3Boundary
    ? geometryToSvgPath(
        props.plane.buildGamutContour(props.displayP3Table, fixedAxis.value),
        props.plane.gamutContourClosed,
      )
    : "",
);
const planeLabel = computed(() => {
  const channels = activeProjection.value.representation.channels;
  const label = `${props.plane.label} plane. Horizontal ${props.plane.xAxis.label} ${channels[1].toFixed(3)}. Vertical ${props.plane.yAxis.label} ${props.plane.id === "oklch" ? channels[0].toFixed(3) : (channels[2] as number).toFixed(3)}. Arrow keys adjust the selected point.${props.plane.id === "oklch" && channels[2] === null ? " Set Hue before increasing chroma." : ""}`;
  return props.warningVisible && props.warningLabel ? `${label} ${props.warningLabel}` : label;
});
const instrumentStyle = {
  "--picker-warning-size": `${PICKER_WARNING_GLYPH_SIZE}px`,
  "--picker-active-marker-size": `${PICKER_ACTIVE_MARKER_RADIUS * 2}px`,
  "--picker-target-guide-marker-size": `${PICKER_TARGET_GUIDE_MARKER_RADIUS * 2}px`,
};

function publishCanvasColorSpace(status: CanvasColorSpaceStatus): void {
  if (canvasColorSpace.value === status) return;
  canvasColorSpace.value = status;
  emit("capability", status);
}

function drawField(): void {
  fieldRaf = null;
  if (isUnmounted || !renderer) return;
  renderedFieldQuality.value = renderer.draw({
    plane: props.plane,
    fixed: fixedAxis.value,
    pixelRatio: pixelRatio.value,
    interactionPreview: props.interactionPreview,
  });
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

  const targetGuide = props.targetGuidePoint;
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
    targetGuideMarker: targetGuide
      ? {
          center: {
            x: targetGuide.x * surfaceLocalSize.width,
            y: targetGuide.y * surfaceLocalSize.height,
          },
          radius: PICKER_TARGET_GUIDE_MARKER_RADIUS,
        }
      : undefined,
  });
  warning.style.left = `${placement.left}px`;
  warning.style.top = `${placement.top}px`;
  warning.style.visibility = "visible";
}

function emitLivePoint(point: PlanePoint): ColorValue | null {
  pendingPoint = null;
  positionActiveAnnotations(point);
  const result =
    props.plane.id === "oklch"
      ? authorPlaneEdit(props.modelValue, {
          plane: "oklch",
          kind: "point",
          point,
          ...(props.editReference ? { reference: props.editReference } : {}),
        })
      : authorPlaneEdit(props.modelValue, { plane: "oklab", kind: "point", point });
  if (!result.ok) {
    positionActiveAnnotations(boundedActivePoint.value);
    return null;
  }
  const color = result.value;
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
  interactionOrigin = props.modelValue;
  latestInteractionPoint = null;
  latestInteractionColor = null;
  surface.value.dataset.pointerFocus = "";
  surface.value.setAttribute(gpAttribute.pointerFocus, "");
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
    if (color) emit("commit", color);
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
  const selected = rollback && origin ? origin : props.modelValue;
  const projected = projectColorToPlane(selected, props.plane.id);
  if (projected.ok) positionActiveAnnotations(props.plane.constrainPoint(projected.value.point));
  emit("cancel");
}

function onPointerCancel(event: PointerEvent): void {
  if (event.pointerId !== activePointerId) return;
  cancelInteraction(true);
}

function onKeydown(event: KeyboardEvent): void {
  surface.value?.removeAttribute("data-pointer-focus");
  surface.value?.removeAttribute(gpAttribute.pointerFocus);
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
  const point = keyboardPlanePoint(activeProjection.value, action, event.shiftKey);
  const result =
    props.plane.id === "oklch"
      ? authorPlaneEdit(props.modelValue, {
          plane: "oklch",
          kind: "point",
          point,
          ...(props.editReference ? { reference: props.editReference } : {}),
        })
      : authorPlaneEdit(props.modelValue, { plane: "oklab", kind: "point", point });
  if (!result.ok) return;
  emit("update:modelValue", result.value);
  emit("commit", result.value);
}

function onBlur(): void {
  surface.value?.removeAttribute("data-pointer-focus");
  surface.value?.removeAttribute(gpAttribute.pointerFocus);
}

watch([() => props.plane, fixedAxis], () => scheduleFieldDraw());
watch(
  () => props.plane,
  () => cancelInteraction(false),
  { flush: "sync" },
);
watch(
  () => props.modelValue,
  () => {
    const expected = latestInteractionColor ?? interactionOrigin;
    if (!expected || activePointerId === null) return;
    if (!definingEquals(props.modelValue, expected)) cancelInteraction(false);
  },
  { flush: "sync" },
);
watch(
  () => props.interactionPreview,
  () => scheduleFieldDraw(),
);
watch(pixelRatio, () => {
  scheduleFieldDraw();
});
watch(boundedActivePoint, (point) => positionActiveAnnotations(point));
watch(
  () => props.targetGuidePoint,
  () => positionActiveAnnotations(boundedActivePoint.value),
);

onMounted(() => {
  isMounted = true;
  if (canvas.value) renderer = createFieldRenderer(canvas.value, publishCanvasColorSpace);
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
  renderer?.dispose();
  renderer = null;
});
</script>

<template>
  <div
    class="color-plane"
    :data-gp-part="gpPart.plane"
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
      :data-gp-part="gpPart.surface"
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
      @blur="onBlur"
    >
      <canvas ref="canvas" :data-gp-part="gpPart.canvas" aria-hidden="true" />
      <span
        v-if="plane.id === 'oklab'"
        class="color-plane__domain-boundary"
        :data-gp-part="gpPart.domainBoundary"
        data-instrument-domain="disc"
        aria-hidden="true"
      />
      <svg
        class="color-plane__gamut"
        :data-gp-part="gpPart.gamutGuides"
        :viewBox="`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`"
        preserveAspectRatio="none"
        role="group"
        aria-label="Gamut and instrument boundary guides"
      >
        <path
          v-if="showDisplayP3Boundary"
          :d="displayP3Path"
          class="color-plane__boundary color-plane__boundary--p3"
          :data-gp-part="gpPart.gamutBoundary"
          :data-gp-gamut="gpGamut.displayP3"
          data-gamut-boundary="display-p3"
          vector-effect="non-scaling-stroke"
          aria-hidden="true"
        />
        <path
          v-if="showDisplayP3Boundary"
          :d="displayP3Path"
          class="color-plane__boundary-hit"
          :data-gp-part="gpPart.boundaryHit"
          :data-gp-gamut="gpGamut.displayP3"
          data-gamut-boundary-hit="display-p3"
          vector-effect="non-scaling-stroke"
          aria-label="Display P3 gamut boundary"
          role="img"
        />
        <path
          v-if="showSrgbBoundary"
          :d="srgbPath"
          class="color-plane__boundary color-plane__boundary--srgb"
          :data-gp-part="gpPart.gamutBoundary"
          :data-gp-gamut="gpGamut.srgb"
          data-gamut-boundary="srgb"
          vector-effect="non-scaling-stroke"
          aria-hidden="true"
        />
        <path
          v-if="showSrgbBoundary"
          :d="srgbPath"
          class="color-plane__boundary-hit"
          :data-gp-part="gpPart.boundaryHit"
          :data-gp-gamut="gpGamut.srgb"
          data-gamut-boundary-hit="srgb"
          vector-effect="non-scaling-stroke"
          aria-label="sRGB gamut boundary"
          role="img"
        />
        <circle
          v-if="plane.id === 'oklab'"
          class="color-plane__boundary-hit"
          :data-gp-part="gpPart.boundaryHit"
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
        v-if="targetGuidePoint"
        class="color-plane__target-guide-connector"
        :data-gp-part="gpPart.guideConnector"
        :style="targetGuideConnectorStyle"
        data-table-boundary-guide-connector
        aria-hidden="true"
      />
      <span
        v-if="targetGuidePoint"
        class="color-plane__marker color-plane__marker--target-guide"
        :data-gp-part="gpPart.marker"
        :data-gp-marker="gpMarker.targetGuide"
        :style="{
          ...targetGuideMarkerStyle,
          '--target-guide-marker-color': targetGuideCss,
        }"
        data-table-boundary-guide-marker
        data-marker-role="target-guide"
        :title="targetGuideLabel"
        :aria-label="targetGuideLabel"
        role="img"
      />
      <span
        ref="warningMarker"
        v-show="warningVisible"
        class="color-plane__warning"
        :data-gp-part="gpPart.warning"
        :data-gp-warning="String(warningVisible)"
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
        :data-gp-part="gpPart.marker"
        :data-gp-marker="gpMarker.active"
        :style="{ ...markerStyle, '--marker-color': markerCss }"
        :data-outside-display-p3="warningVisible ? 'true' : 'false'"
        data-active-marker
        data-marker-role="active-color"
        title="Selected color"
        aria-label="Selected color"
        role="img"
      />
    </div>
    <span
      v-if="canvasColorSpace === 'srgb'"
      class="color-plane__render-mode"
      :data-gp-part="gpPart.renderStatus"
    >
      sRGB canvas
    </span>
    <span
      v-else-if="canvasColorSpace === 'unavailable'"
      class="color-plane__render-mode"
      :data-gp-part="gpPart.renderStatus"
    >
      canvas unavailable
    </span>
    <span
      class="color-plane__axis color-plane__axis--lightness"
      :data-gp-part="gpPart.axis"
      :data-gp-axis="gpAxis.y"
    >
      {{ plane.yAxis.symbol }} · {{ plane.yAxis.label }}
    </span>
    <span
      class="color-plane__axis color-plane__axis--chroma"
      :data-gp-part="gpPart.axis"
      :data-gp-axis="gpAxis.x"
    >
      {{ plane.xAxis.symbol }} · {{ plane.xAxis.label }}
    </span>
  </div>
</template>
