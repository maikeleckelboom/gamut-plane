<script setup lang="ts">
import {
  gpAttribute,
  gpAxis,
  gpGamut,
  gpMarker,
  gpPart,
  currentEditorCopy,
  authoredMarkerPoint,
  exactGamutUi,
  referenceWarningGlyphPath,
  mountPlaneGesture,
  type PlaneGestureBinding,
} from "@gamut-plane/ui";
import {
  definingEquals,
  type ColorValue,
  type PickerPlaneKeyboardAction,
  type PlanePoint,
  type PlaneEditReference,
} from "@gamut-plane/core";
import {
  authorEditorPoint,
  editorDefinitions,
  keyboardGeometryPoint,
} from "@gamut-plane/core/internal/capabilities";
import { useDevicePixelRatio, useEventListener, useResizeObserver } from "@vueuse/core";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { PICKER_ACTIVE_MARKER_RADIUS } from "@gamut-plane/render";

import {
  createFieldRenderer,
  pointStyle,
  VIEWBOX_SIZE,
  type FieldRenderer,
  type CanvasColorSpaceStatus,
  type RenderedFieldQuality,
} from "@gamut-plane/render";

import { planeWarningOffset } from "@gamut-plane/render/internal/current";
import type {
  CurrentField,
  GeneralizedGuideDisplay,
  ReferenceDisplay,
} from "@gamut-plane/render/internal/current";

const props = withDefaults(
  defineProps<{
    modelValue: ColorValue;
    semanticContextKey: string;
    field: CurrentField;
    guides: GeneralizedGuideDisplay;
    markerCss: string;
    reference?: ReferenceDisplay | null;
    warning?: string | null;
    editReference?: PlaneEditReference | undefined;
    plane: CurrentField["plane"];
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
const authoredPoint = computed(() => authoredMarkerPoint(props.field.geometry, activePoint.value));
const markerStyle = computed(() => pointStyle(authoredPoint.value));
const spatialReference = computed(() =>
  props.reference?.showExcursion && props.reference.spatial.kind === "available"
    ? props.reference.spatial
    : null,
);
const referenceLabel = computed(() =>
  props.reference
    ? `${props.reference.kind === "rgb" ? "Nearest slice" : "Sampled"} ${exactGamutUi[props.reference.gamutId].label} Reference boundary`
    : "",
);

const planeLabel = computed(() => {
  const { coordinates } = activeProjection.value;
  return `${props.plane.label} plane. Horizontal ${props.plane.xAxis.label} ${coordinates.x?.toFixed(3) ?? "missing"}. Vertical ${props.plane.yAxis.label} ${coordinates.y?.toFixed(3) ?? "missing"}.${"sampleKind" in props.plane ? ` Fixed ${props.plane.fixedAxis.label} ${props.field.samplingFixed}.` : ""} Arrow keys adjust the selected point.${props.field.geometry.fixed === "oklch.h" && coordinates.fixed === null ? ` ${currentEditorCopy.chromaMissingHue}` : ""}${"sampleKind" in props.plane && !props.field.markerInDomain ? ` ${currentEditorCopy.rgbOverflow}` : ""}${props.warning ? ` ${props.warning}.` : ""}`;
});
const instrumentStyle = {
  "--picker-active-marker-size": `${PICKER_ACTIVE_MARKER_RADIUS * 2}px`,
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
    fieldId: props.field.geometry.id,
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
  return props.field.geometry.constrain({
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
    surfaceLocalSize = { width: 0, height: 0 };
    return;
  }

  const hasLayoutMetrics = element.offsetWidth > 0 && element.offsetHeight > 0;
  const scaleX = hasLayoutMetrics ? bounds.width / element.offsetWidth : 1;
  const scaleY = hasLayoutMetrics ? bounds.height / element.offsetHeight : 1;
  const localWidth = element.clientWidth || bounds.width;
  const localHeight = element.clientHeight || bounds.height;
  surfaceLocalSize = { width: localWidth, height: localHeight };
  surfaceBounds = {
    left: bounds.left + element.clientLeft * scaleX,
    top: bounds.top + element.clientTop * scaleY,
    width: localWidth * scaleX,
    height: localHeight * scaleY,
  };
}

function positionActiveAnnotations(point: PlanePoint): void {
  const activeMarker = marker.value;
  if (activeMarker) {
    Object.assign(activeMarker.style, pointStyle(point));
    const offset = planeWarningOffset(point, surfaceLocalSize);
    activeMarker.style.setProperty("--gp-warning-offset-x", `${offset.x}px`);
    activeMarker.style.setProperty("--gp-warning-offset-y", `${offset.y}px`);
  }
}

function authorPoint(value: ColorValue, point: PlanePoint): ColorValue | null {
  const editor = editorDefinitions[props.field.editorId];
  const result = authorEditorPoint(value, editor, point, props.editReference);
  return result.ok ? result.value : null;
}

function restorePresentation(value: ColorValue): void {
  const projected = props.field.geometry.project(value);
  if (projected.ok)
    positionActiveAnnotations(authoredMarkerPoint(props.field.geometry, projected.value.point));
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
  const point = keyboardGeometryPoint(activeProjection.value, action, event.shiftKey);
  const result = authorPoint(props.modelValue, point);
  if (result === null) return;
  emit("update:modelValue", result);
  emit("commit", result);
}

function onBlur(): void {
  surface.value?.removeAttribute("data-pointer-focus");
  surface.value?.removeAttribute(gpAttribute.pointerFocus);
}

watch([() => props.plane, () => props.field.geometry.id, fixedAxis], () => scheduleFieldDraw());
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
watch(authoredPoint, (point) => positionActiveAnnotations(point));

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
    positionActiveAnnotations(authoredPoint.value);
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
    positionActiveAnnotations(authoredPoint.value);
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
    :data-geometry-id="field.geometry.id"
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
        v-if="field.geometry.domain.kind === 'disc'"
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
          v-if="field.geometry.domain.kind === 'disc'"
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
        <line
          v-if="spatialReference"
          :data-gp-part="gpPart.referenceConnector"
          :x1="authoredPoint.x * VIEWBOX_SIZE"
          :y1="authoredPoint.y * VIEWBOX_SIZE"
          :x2="spatialReference.point.x * VIEWBOX_SIZE"
          :y2="spatialReference.point.y * VIEWBOX_SIZE"
          vector-effect="non-scaling-stroke"
          aria-hidden="true"
        />
      </svg>
      <span
        v-if="spatialReference"
        :data-gp-part="gpPart.marker"
        :data-gp-marker="gpMarker.reference"
        :style="{
          ...pointStyle(spatialReference.point),
          '--marker-color': spatialReference.markerCss,
        }"
        :title="referenceLabel"
        :aria-label="referenceLabel"
        role="img"
      />
      <span
        ref="marker"
        class="color-plane__marker color-plane__marker--active"
        :data-gp-part="gpPart.marker"
        :data-gp-marker="gpMarker.active"
        :style="{ ...markerStyle, '--marker-color': markerCss }"
        data-active-marker
        data-marker-role="active-color"
        title="Selected color"
        aria-label="Selected color"
        role="img"
      >
        <svg
          v-if="warning"
          :data-gp-part="gpPart.referenceWarning"
          data-gamut-warning="planar"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
        >
          <path :d="referenceWarningGlyphPath" />
        </svg>
      </span>
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
