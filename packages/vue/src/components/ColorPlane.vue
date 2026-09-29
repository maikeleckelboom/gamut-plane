<script setup lang="ts">
import {
  gpAttribute,
  gpAxis,
  gpGamut,
  gpMarker,
  gpPart,
  mountPlaneGesture,
  type PlaneGestureBinding,
} from "@gamut-plane/ui";
import {
  authorPlaneEdit,
  definingEquals,
  keyboardPlanePoint,
  projectColorToPlane,
  type ColorValue,
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
  VIEWBOX_SIZE,
  type FieldRenderer,
  type CanvasColorSpaceStatus,
  type RenderedFieldQuality,
} from "@gamut-plane/render";

import type { CurrentField, CurrentGuideDisplay } from "@gamut-plane/render/internal/current";

const props = withDefaults(
  defineProps<{
    modelValue: ColorValue;
    semanticContextKey: string;
    field: CurrentField;
    guides: CurrentGuideDisplay;
    markerCss: string;
    editReference?: PlaneEditReference | undefined;
    plane: PickerPlaneGeometry & PickerPlaneFieldSampler;
    targetGuidePoint: PlanePoint | null;
    targetGuideCss: string;
    targetGuideLabel: string;
    warningVisible: boolean;
    warningLabel: string;
    interactionPreview?: boolean;
  }>(),
  {
    interactionPreview: false,
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
let gesture: PlaneGestureBinding | null = null;
let boundsDirty = false;
let isUnmounted = false;
let isMounted = false;
let surfaceBounds = { left: 0, top: 0, width: 0, height: 0 };
let surfaceLocalSize = { width: 0, height: 0 };

const activeProjection = computed(() => props.field.projection);
const fixedAxis = computed(() => props.field.samplingFixed);
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
    ...(targetGuide
      ? {
          targetGuideMarker: {
            center: {
              x: targetGuide.x * surfaceLocalSize.width,
              y: targetGuide.y * surfaceLocalSize.height,
            },
            radius: PICKER_TARGET_GUIDE_MARKER_RADIUS,
          },
        }
      : {}),
  });
  warning.style.left = `${placement.left}px`;
  warning.style.top = `${placement.top}px`;
  warning.style.visibility = "visible";
}

function authorPoint(value: ColorValue, point: PlanePoint): ColorValue | null {
  const result =
    props.plane.id === "oklch"
      ? authorPlaneEdit(value, {
          plane: "oklch",
          kind: "point",
          point,
          ...(props.editReference ? { reference: props.editReference } : {}),
        })
      : authorPlaneEdit(value, { plane: "oklab", kind: "point", point });
  return result.ok ? result.value : null;
}

function restorePresentation(value: ColorValue): void {
  const projected = projectColorToPlane(value, props.plane.id);
  if (projected.ok) positionActiveAnnotations(props.plane.constrainPoint(projected.value.point));
}
function onKeydown(event: KeyboardEvent): void {
  surface.value?.removeAttribute("data-pointer-focus");
  surface.value?.removeAttribute(gpAttribute.pointerFocus);
  if (event.key === "Escape" && gesture?.active) {
    event.preventDefault();
    event.stopPropagation();
    gesture.rollback();
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
  gesture?.interrupt();
  const point = keyboardPlanePoint(activeProjection.value, action, event.shiftKey);
  const result = authorPoint(props.modelValue, point);
  if (result === null) return;
  emit("update:modelValue", result);
  emit("commit", result);
}

function onBlur(): void {
  surface.value?.removeAttribute("data-pointer-focus");
  surface.value?.removeAttribute(gpAttribute.pointerFocus);
}

watch([() => props.plane, fixedAxis], () => scheduleFieldDraw());
watch(
  () => props.semanticContextKey,
  () => gesture?.reconcile(),
  { flush: "sync" },
);
watch(
  () => props.modelValue,
  () => gesture?.reconcile(),
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
  if (surface.value) {
    const element = surface.value;
    gesture = mountPlaneGesture<ColorValue, PlanePoint>(element, () => ({
      value: props.modelValue,
      viewKey: props.semanticContextKey,
      pointFromPointer: (event) => {
        if (event.type === "pointerdown") measureSurface();
        return pointFromPointer(event);
      },
      authorPoint,
      definingEquals,
      onPointerStart: (event) => {
        element.dataset.pointerFocus = "";
        element.setAttribute(gpAttribute.pointerFocus, "");
        element.focus({ preventScroll: true });
        element.setPointerCapture?.(event.pointerId);
      },
      onPointerEnd: (id) => {
        if (element.hasPointerCapture?.(id)) element.releasePointerCapture(id);
      },
      onPreviewPoint: positionActiveAnnotations,
      onValueChange: (value) => emit("update:modelValue", value),
      onCommit: (value) => emit("commit", value),
      onCancel: () => emit("cancel"),
      onRestorePresentation: restorePresentation,
    }));
  }
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
  gesture?.dispose();
  gesture = null;
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
      :data-outside-instrument="field.markerInDomain ? 'false' : 'true'"
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
          v-if="guides.displayP3Path !== null"
          :d="guides.displayP3Path"
          class="color-plane__boundary color-plane__boundary--p3"
          :data-gp-part="gpPart.gamutBoundary"
          :data-gp-gamut="gpGamut.displayP3"
          data-gamut-boundary="display-p3"
          vector-effect="non-scaling-stroke"
          aria-hidden="true"
        />
        <path
          v-if="guides.displayP3Path !== null"
          :d="guides.displayP3Path"
          class="color-plane__boundary-hit"
          :data-gp-part="gpPart.boundaryHit"
          :data-gp-gamut="gpGamut.displayP3"
          data-gamut-boundary-hit="display-p3"
          vector-effect="non-scaling-stroke"
          aria-label="Display P3 gamut boundary"
          role="img"
        />
        <path
          v-if="guides.srgbPath !== null"
          :d="guides.srgbPath"
          class="color-plane__boundary color-plane__boundary--srgb"
          :data-gp-part="gpPart.gamutBoundary"
          :data-gp-gamut="gpGamut.srgb"
          data-gamut-boundary="srgb"
          vector-effect="non-scaling-stroke"
          aria-hidden="true"
        />
        <path
          v-if="guides.srgbPath !== null"
          :d="guides.srgbPath"
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
