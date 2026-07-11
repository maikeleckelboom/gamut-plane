<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import GamutWarningGlyph from "@/components/chromavert/GamutWarningGlyph.vue";
import {
  PICKER_SLIDER_ANNOTATION_CLEARANCE,
  PICKER_SLIDER_DEFAULT_TRACK_WIDTH,
  PICKER_SLIDER_EDGE_CLEARANCE,
  PICKER_SLIDER_FALLBACK_COLLISION_WIDTH,
  PICKER_SLIDER_FIELD_INSET,
  PICKER_SLIDER_TICK_COLLISION_WIDTH,
  PICKER_SLIDER_TRACK_HEIGHT,
  PICKER_SLIDER_THUMB_TOP,
  PICKER_SLIDER_THUMB_WIDTH,
  PICKER_SLIDER_WARNING_SIDE_GAP,
  PICKER_SLIDER_WARNING_TOP,
  PICKER_WARNING_GLYPH_SIZE,
} from "@/components/chromavert/pickerInstrumentStyle";
import {
  getSliderWarningPosition,
  type SliderWarningObstacle,
} from "@/components/chromavert/pickerWarningPlacement";

export interface LinearControlMarker {
  id: string;
  label: string;
  position: number;
  tone: "srgb" | "display-p3" | "fallback";
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
const trackWidth = ref(PICKER_SLIDER_DEFAULT_TRACK_WIDTH);
const trackLeft = ref(0);
const hoverPosition = ref<number | null>(null);
const isRangeFocused = ref(false);
let trackResizeObserver: ResizeObserver | undefined;
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
const outOfGamutSections = computed<GamutSection[]>(() =>
  GAMUT_TONES.flatMap((tone) => {
    if (mergedIntervals.value[tone].length === 0) return [];
    const sections: GamutSection[] = [];
    let cursor = 0;
    for (const interval of mergedIntervals.value[tone]) {
      if (interval.start > cursor) sections.push({ start: cursor, end: interval.start, tone });
      cursor = Math.max(cursor, interval.end);
    }
    if (cursor < 1) sections.push({ start: cursor, end: 1, tone });
    return sections;
  }),
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
      marker.tone === "fallback"
        ? PICKER_SLIDER_FALLBACK_COLLISION_WIDTH
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

onMounted(() => {
  const element = trackElement.value;
  if (!element) return;
  updateTrackBounds();
  if (typeof ResizeObserver === "undefined") return;
  trackResizeObserver = new ResizeObserver(([entry]) => {
    if (entry) updateTrackWidth(entry.contentRect.width);
  });
  trackResizeObserver.observe(element);
});

onBeforeUnmount(() => trackResizeObserver?.disconnect());

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
  emit("update:modelValue", clamp(value));
}

function commitFromRange(event: Event): void {
  const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
  if (!Number.isFinite(value)) return;
  emit("commit", clamp(value));
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
</script>

<template>
  <div
    class="oklch-linear-control"
    :data-picker-control="channel.toLowerCase()"
    :data-instrument-overflow="isOutsideInstrument ? 'true' : 'false'"
    :data-warning-visible="warningVisible ? 'true' : 'false'"
    :style="instrumentStyle"
  >
    <header class="oklch-linear-control__header">
      <label :for="id">
        <span>{{ channel }}</span>
        {{ label }}
      </label>
      <span
        v-if="contextualThreshold"
        class="oklch-linear-control__threshold-context"
        :data-contextual-gamut-label="contextualThreshold.label"
      >
        {{ contextualThreshold.label }}
      </span>
      <input
        class="oklch-linear-control__number"
        type="number"
        :aria-label="`${label} numeric value`"
        :aria-describedby="describedBy"
        :value="modelValue.toFixed(precision)"
        :min="min"
        :max="numericMax"
        :step="step"
        @change="updateFromNumeric"
      />
    </header>

    <div
      ref="trackElement"
      class="oklch-linear-control__track"
      @pointerenter="updateTrackBounds"
      @pointermove="updateThresholdContext"
      @pointerleave="hoverPosition = null"
    >
      <span class="oklch-linear-control__field" :style="{ backgroundImage: gradient }" />
      <span class="oklch-linear-control__gamut-material" aria-hidden="true">
        <span
          v-for="(section, index) in outOfGamutSections"
          :key="`${section.tone}-veil-${index}`"
          class="oklch-linear-control__veil"
          :class="`oklch-linear-control__veil--${section.tone}`"
          :style="sectionStyle(section)"
          :data-gamut-veil="section.tone"
          :data-veil-start="section.start"
          :data-veil-end="section.end"
        />
        <span
          v-for="threshold in gamutThresholds"
          :key="`${threshold.tone}-threshold-${threshold.position}`"
          class="oklch-linear-control__threshold"
          :class="`oklch-linear-control__threshold--${threshold.tone}`"
          :style="positionStyle(threshold.position)"
          :data-gamut-threshold="threshold.tone"
          :data-threshold-position="threshold.position"
        />
      </span>
      <span
        v-for="marker in markers"
        :key="marker.id"
        class="oklch-linear-control__tick"
        :class="`oklch-linear-control__tick--${marker.tone}`"
        :style="tickStyle(marker)"
        :title="marker.label"
        :aria-label="marker.label"
        :data-gamut-marker="marker.id"
      />
      <span
        v-show="warningVisible"
        class="oklch-linear-control__warning"
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
        :id="id"
        class="oklch-linear-control__range"
        type="range"
        :aria-describedby="describedBy"
        :aria-label="`${label} ${modelValue.toFixed(precision)}`"
        :value="boundedModelValue"
        :min="min"
        :max="max"
        :step="step"
        @input="updateFromRange"
        @change="commitFromRange"
        @focus="isRangeFocused = true"
        @blur="isRangeFocused = false"
      />
    </div>

    <p v-if="help" :id="helpId" class="oklch-linear-control__help">{{ help }}</p>
    <span v-if="warningDescriptionId" :id="warningDescriptionId" class="sr-only">
      {{ warningLabel }}
    </span>
  </div>
</template>
