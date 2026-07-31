<script setup lang="ts">
import { useResizeObserver } from "@vueuse/core";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import GamutWarningGlyph from "@/components/GamutWarningGlyph.vue";
import {
  PICKER_SLIDER_ANNOTATION_CLEARANCE,
  PICKER_SLIDER_DEFAULT_TRACK_WIDTH,
  PICKER_SLIDER_EDGE_CLEARANCE,
  PICKER_SLIDER_PROJECTION_COLLISION_WIDTH,
  PICKER_SLIDER_FIELD_INSET,
  PICKER_SLIDER_TICK_COLLISION_WIDTH,
  PICKER_SLIDER_TRACK_HEIGHT,
  PICKER_SLIDER_THUMB_TOP,
  PICKER_SLIDER_THUMB_WIDTH,
  PICKER_SLIDER_WARNING_SIDE_GAP,
  PICKER_SLIDER_WARNING_TOP,
  PICKER_WARNING_GLYPH_SIZE,
} from "@/components/planeInstrumentStyle";
import {
  getSliderWarningPosition,
  type SliderWarningObstacle,
} from "@/components/pickerWarningPlacement";

export interface LinearControlMarker {
  id: string;
  label: string;
  position: number;
  tone: "srgb" | "display-p3" | "projection";
  cssColor?: string;
}

export interface LinearControlInterval {
  start: number;
  end: number;
  tone: "srgb" | "display-p3";
}

type GamutTone = LinearControlInterval["tone"];

interface GamutSection {
  start: number;
  end: number;
  tone: GamutTone;
}

interface GamutThreshold {
  position: number;
  tone: GamutTone;
  insideSide: "left" | "right";
  label: string;
}

const GAMUT_TONES = ["display-p3", "srgb"] as const satisfies readonly GamutTone[];

const props = withDefaults(
  defineProps<{
    id: string;
    label: string;
    channel: "L" | "C" | "H";
    modelValue: number;
    min: number;
    max: number;
    step: number;
    gradient: string;
    precision?: number;
    markers?: LinearControlMarker[];
    intervals?: LinearControlInterval[];
    overflowMax?: boolean;
    help?: string;
    warningVisible?: boolean;
    warningLabel?: string;
    warningPosition?: number;
  }>(),
  {
    precision: 3,
    markers: () => [],
    intervals: () => [],
    overflowMax: false,
    help: "",
    warningVisible: false,
    warningLabel: "",
    warningPosition: 0,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: number];
  commit: [value: number];
  "range-interaction": [active: boolean];
}>();

const helpId = computed(() => (props.help ? `${props.id}-help` : undefined));
const warningDescriptionId = computed(() =>
  props.warningVisible && props.warningLabel ? `${props.id}-gamut-warning` : undefined,
);
const describedBy = computed(
  () => [helpId.value, warningDescriptionId.value].filter(Boolean).join(" ") || undefined,
);
const boundedModelValue = computed(() => clamp(props.modelValue));
const isOutsideInstrument = computed(
  () => props.modelValue < props.min || props.modelValue > props.max,
);
const numericMax = computed<number | undefined>(() => (props.overflowMax ? undefined : props.max));
const trackElement = ref<HTMLElement>();
const rangeElement = ref<HTMLInputElement>();
const trackWidth = ref(PICKER_SLIDER_DEFAULT_TRACK_WIDTH);
const trackLeft = ref(0);
const hoverPosition = ref<number | null>(null);
const isRangeFocused = ref(false);
let pendingRangeValue: number | null = null;
let rangeRaf: number | null = null;
let isUnmounted = false;
let activeRangePointerId: number | null = null;
let rangeInteractionReported = false;
let lastPublishedRangeValue = boundedModelValue.value;
const instrumentStyle = {
  "--picker-warning-size": `${PICKER_WARNING_GLYPH_SIZE}px`,
  "--picker-slider-field-inset": `${PICKER_SLIDER_FIELD_INSET}px`,
  "--picker-slider-track-height": `${PICKER_SLIDER_TRACK_HEIGHT}px`,
  "--picker-slider-thumb-top": `${PICKER_SLIDER_THUMB_TOP}px`,
  "--picker-slider-thumb-width": `${PICKER_SLIDER_THUMB_WIDTH}px`,
  "--picker-slider-warning-top": `${PICKER_SLIDER_WARNING_TOP}px`,
};
const renderedIntervals = computed(() =>
  props.intervals
    .map((interval, index) => {
      const start = Math.min(1, Math.max(0, interval.start));
      const end = Math.min(1, Math.max(start, interval.end));
      return { ...interval, start, end, index };
    })
    .filter((interval) => interval.end - interval.start > Number.EPSILON * 16),
);
const normalizedModelPosition = computed(() => {
  const span = props.max - props.min;
  return span > 0 ? (boundedModelValue.value - props.min) / span : 0;
});
const mergedIntervals = computed<Record<GamutTone, GamutSection[]>>(() => {
  const result: Record<GamutTone, GamutSection[]> = { "display-p3": [], srgb: [] };
  for (const tone of GAMUT_TONES) {
    const sorted = renderedIntervals.value
      .filter((interval) => interval.tone === tone)
      .sort((a, b) => a.start - b.start);
    for (const interval of sorted) {
      const previous = result[tone].at(-1);
      if (previous && interval.start <= previous.end + Number.EPSILON * 16) {
        previous.end = Math.max(previous.end, interval.end);
      } else {
        result[tone].push({ start: interval.start, end: interval.end, tone });
      }
    }
  }
  return result;
});
const inGamutSections = computed<GamutSection[]>(() =>
  GAMUT_TONES.flatMap((tone) => mergedIntervals.value[tone]),
);
const gamutThresholds = computed<GamutThreshold[]>(() =>
  GAMUT_TONES.flatMap((tone) => {
    const positions = mergedIntervals.value[tone].flatMap(({ start, end }) => [start, end]);
    const crossings = [...new Set(positions)].filter((position) => position > 0 && position < 1);
    return crossings.map((position) => {
      const insideAfterCrossing = mergedIntervals.value[tone].some(
        (interval) => Math.abs(interval.start - position) <= Number.EPSILON * 16,
      );
      const gamutName = tone === "display-p3" ? "Display P3" : "sRGB";
      return {
        position,
        tone,
        insideSide: insideAfterCrossing ? "right" : "left",
        label: insideAfterCrossing ? `Inside ${gamutName} gamut →` : `← Inside ${gamutName} gamut`,
      };
    });
  }),
);
const contextualThreshold = computed<GamutThreshold | null>(() => {
  const position =
    hoverPosition.value ?? (isRangeFocused.value ? normalizedModelPosition.value : null);
  if (position === null) return null;
  const nearest = gamutThresholds.value.reduce<GamutThreshold | null>((candidate, threshold) => {
    if (!candidate) return threshold;
    return Math.abs(threshold.position - position) < Math.abs(candidate.position - position)
      ? threshold
      : candidate;
  }, null);
  if (!nearest || Math.abs(nearest.position - position) * trackWidth.value > 14) return null;
  return nearest;
});
const warningPreferredSide = computed<"left" | "right">(() => {
  const position = Number.isFinite(props.warningPosition) ? props.warningPosition : 0;
  const nearest = gamutThresholds.value
    .filter((threshold) => threshold.tone === "display-p3")
    .reduce<GamutThreshold | null>((candidate, threshold) => {
      if (!candidate) return threshold;
      return Math.abs(threshold.position - position) < Math.abs(candidate.position - position)
        ? threshold
        : candidate;
    }, null);
  if (!nearest) return "right";
  return nearest.insideSide === "right" ? "left" : "right";
});
const warningObstacles = computed<SliderWarningObstacle[]>(() => {
  const width = trackWidth.value;
  const fieldWidth = Math.max(0, width - PICKER_SLIDER_FIELD_INSET * 2);
  const markers = props.markers.map((marker) => ({
    center: Math.min(1, Math.max(0, marker.position)) * width,
    width:
      marker.tone === "projection"
        ? PICKER_SLIDER_PROJECTION_COLLISION_WIDTH
        : PICKER_SLIDER_TICK_COLLISION_WIDTH,
  }));
  const thresholds = gamutThresholds.value.map(({ position }) => ({
    center: PICKER_SLIDER_FIELD_INSET + position * fieldWidth,
    width: PICKER_SLIDER_TICK_COLLISION_WIDTH,
  }));
  return [...markers, ...thresholds];
});
const warningPlacement = computed(() =>
  getSliderWarningPosition({
    position: Number.isFinite(props.warningPosition) ? props.warningPosition : 0,
    trackWidth: trackWidth.value,
    thumbWidth: PICKER_SLIDER_THUMB_WIDTH,
    warningWidth: PICKER_WARNING_GLYPH_SIZE,
    edgeClearance: PICKER_SLIDER_EDGE_CLEARANCE,
    markerGap: PICKER_SLIDER_WARNING_SIDE_GAP,
    obstacleClearance: PICKER_SLIDER_ANNOTATION_CLEARANCE,
    obstacles: warningObstacles.value,
    preferredSide: warningPreferredSide.value,
  }),
);
const warningStyle = computed<Record<string, string>>(() => {
  const position = warningPlacement.value;
  return {
    "--picker-slider-warning-position": `${position.positionPercent.toFixed(4)}%`,
    "--picker-slider-warning-thumb-offset": `${position.thumbOffset.toFixed(4)}px`,
    "--picker-slider-warning-side-offset": `${position.sideOffset}px`,
    "--picker-slider-warning-edge": `${position.edge}px`,
  };
});

function updateTrackWidth(width: number): void {
  if (width > 0 && Math.abs(width - trackWidth.value) > 0.25) trackWidth.value = width;
}

function updateTrackBounds(): void {
  const bounds = trackElement.value?.getBoundingClientRect();
  if (!bounds) return;
  updateTrackWidth(bounds.width);
  trackLeft.value = bounds.left;
}

onMounted(updateTrackBounds);
useResizeObserver(trackElement, ([entry]) => {
  if (entry) updateTrackWidth(entry.contentRect.width);
});

function clamp(value: number): number {
  return Math.min(props.max, Math.max(props.min, value));
}

function clampNumeric(value: number): number {
  return props.overflowMax ? Math.max(props.min, value) : clamp(value);
}

function updateFromNumeric(event: Event): void {
  const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
  if (!Number.isFinite(value)) return;
  const next = clampNumeric(value);
  emit("update:modelValue", next);
  emit("commit", next);
}

function updateFromRange(event: Event): void {
  const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
  if (!Number.isFinite(value)) return;
  pendingRangeValue = clamp(value);
  if (activeRangePointerId !== null && !rangeInteractionReported) {
    rangeInteractionReported = true;
    emit("range-interaction", true);
  }
  if (rangeRaf !== null) return;
  rangeRaf = window.requestAnimationFrame(() => {
    rangeRaf = null;
    const next = pendingRangeValue;
    pendingRangeValue = null;
    if (next !== null && !isUnmounted) {
      lastPublishedRangeValue = next;
      emit("update:modelValue", next);
    }
  });
}

function clearPendingRange(): boolean {
  const hadPendingValue = pendingRangeValue !== null;
  if (rangeRaf !== null) window.cancelAnimationFrame(rangeRaf);
  rangeRaf = null;
  pendingRangeValue = null;
  return hadPendingValue;
}

function cancelPendingRange(): void {
  if (clearPendingRange() && rangeElement.value) {
    rangeElement.value.value = String(clamp(lastPublishedRangeValue));
  }
}

function commitFromRange(event: Event): void {
  const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
  if (!Number.isFinite(value)) return;
  const next = clamp(value);
  clearPendingRange();
  lastPublishedRangeValue = next;
  emit("update:modelValue", next);
  emit("commit", next);
  finishRangeInteraction();
}

function beginRangeInteraction(event: PointerEvent): void {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (activeRangePointerId !== null) return;
  activeRangePointerId = event.pointerId;
}

function finishRangeInteraction(): void {
  activeRangePointerId = null;
  if (!rangeInteractionReported) return;
  rangeInteractionReported = false;
  emit("range-interaction", false);
}

function finishRangePointer(event: PointerEvent): void {
  if (event.pointerId === activeRangePointerId) finishRangeInteraction();
}

function cancelRangePointer(event?: PointerEvent): void {
  if (event && event.pointerId !== activeRangePointerId) return;
  cancelPendingRange();
  finishRangeInteraction();
}

function blurRange(): void {
  isRangeFocused.value = false;
  cancelRangePointer();
}

function updateThresholdContext(event: PointerEvent): void {
  hoverPosition.value = Math.min(
    1,
    Math.max(0, (event.clientX - trackLeft.value) / trackWidth.value),
  );
}

function positionStyle(position: number): Record<string, string> {
  return { left: `${Math.min(1, Math.max(0, position)) * 100}%` };
}

function tickStyle(marker: LinearControlMarker): Record<string, string> {
  const style: Record<string, string> = positionStyle(marker.position);
  if (marker.cssColor) style["--tick-color"] = marker.cssColor;
  return style;
}

function sectionStyle(section: GamutSection): Record<string, string> {
  return { left: `${section.start * 100}%`, width: `${(section.end - section.start) * 100}%` };
}

watch(boundedModelValue, (value) => {
  if (pendingRangeValue === null) lastPublishedRangeValue = value;
});

onBeforeUnmount(() => {
  isUnmounted = true;
  cancelPendingRange();
  finishRangeInteraction();
});
</script>

<template>
  <div
    class="channel-control"
    :data-picker-control="channel.toLowerCase()"
    :data-instrument-overflow="isOutsideInstrument ? 'true' : 'false'"
    :data-warning-visible="warningVisible ? 'true' : 'false'"
    :style="instrumentStyle"
  >
    <header class="channel-control__header">
      <label :for="id">
        <span>{{ channel }}</span>
        {{ label }}
      </label>
      <span
        v-if="contextualThreshold"
        class="channel-control__threshold-context"
        :data-contextual-gamut-label="contextualThreshold.label"
      >
        {{ contextualThreshold.label }}
      </span>
      <input
        class="channel-control__number"
        type="number"
        :aria-label="`${label} numeric value`"
        :aria-describedby="describedBy"
        :value="modelValue.toFixed(precision)"
        :min="min"
        :max="numericMax"
        :step="step"
        @change="updateFromNumeric"
        @keydown.enter.prevent="updateFromNumeric"
      />
    </header>

    <div
      ref="trackElement"
      class="channel-control__track"
      @pointerenter="updateTrackBounds"
      @pointermove="updateThresholdContext"
      @pointerleave="hoverPosition = null"
    >
      <span class="channel-control__field" :style="{ backgroundImage: gradient }" />
      <span class="channel-control__gamut-ranges" aria-hidden="true">
        <span
          v-for="(section, index) in inGamutSections"
          :key="`${section.tone}-range-${index}`"
          class="channel-control__gamut-range"
          :class="`channel-control__gamut-range--${section.tone}`"
          :style="sectionStyle(section)"
          :data-gamut-range="section.tone"
          :data-range-start="section.start"
          :data-range-end="section.end"
        />
      </span>
      <span
        v-for="marker in markers"
        :key="marker.id"
        class="channel-control__tick"
        :class="`channel-control__tick--${marker.tone}`"
        :style="tickStyle(marker)"
        :title="marker.label"
        :aria-label="marker.label"
        :data-gamut-marker="marker.id"
        role="img"
      />
      <span
        v-show="warningVisible"
        class="channel-control__warning"
        :style="warningStyle"
        data-gamut-warning="linear"
        :data-warning-channel="channel.toLowerCase()"
        :data-warning-position="Math.min(1, Math.max(0, warningPosition))"
        :data-warning-side="warningPlacement.side"
        :data-warning-obstacle-count="warningObstacles.length"
        :data-visible="warningVisible ? 'true' : 'false'"
        aria-hidden="true"
      >
        <GamutWarningGlyph />
      </span>
      <input
        ref="rangeElement"
        :id="id"
        class="channel-control__range"
        type="range"
        :aria-describedby="describedBy"
        :aria-label="`${label} ${modelValue.toFixed(precision)}`"
        :value="boundedModelValue"
        :min="min"
        :max="max"
        :step="step"
        @input="updateFromRange"
        @change="commitFromRange"
        @pointerdown="beginRangeInteraction"
        @pointerup="finishRangePointer"
        @pointercancel="cancelRangePointer"
        @lostpointercapture="cancelRangePointer"
        @focus="isRangeFocused = true"
        @blur="blurRange"
      />
    </div>

    <p v-if="help" :id="helpId" class="channel-control__help">{{ help }}</p>
    <span v-if="warningDescriptionId" :id="warningDescriptionId" class="sr-only">
      {{ warningLabel }}
    </span>
  </div>
</template>
