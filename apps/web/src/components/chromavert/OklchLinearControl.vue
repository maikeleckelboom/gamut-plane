<script setup lang="ts">
import { computed } from "vue";

import GamutWarningGlyph from "@/components/chromavert/GamutWarningGlyph.vue";
import {
  PICKER_BRACKET_CAP_LENGTH,
  PICKER_BRACKET_CORE_WIDTH,
  PICKER_BRACKET_KEYLINE_WIDTH,
  PICKER_BRACKET_LANE_INSET,
  PICKER_SLIDER_EDGE_CLEARANCE,
  PICKER_SLIDER_FIELD_INSET,
  PICKER_SLIDER_THUMB_TOP,
  PICKER_SLIDER_THUMB_WIDTH,
  PICKER_SLIDER_WARNING_TOP,
  PICKER_SRGB_DASH_GAP,
  PICKER_SRGB_DASH_LENGTH,
  PICKER_WARNING_GLYPH_SIZE,
} from "@/components/chromavert/pickerInstrumentStyle";
import { getSliderWarningPosition } from "@/components/chromavert/pickerWarningPlacement";

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
const instrumentStyle = {
  "--picker-warning-size": `${PICKER_WARNING_GLYPH_SIZE}px`,
  "--picker-bracket-cap-length": `${PICKER_BRACKET_CAP_LENGTH}px`,
  "--picker-bracket-lane-inset": `${PICKER_BRACKET_LANE_INSET}px`,
  "--picker-bracket-core-width": `${PICKER_BRACKET_CORE_WIDTH}px`,
  "--picker-bracket-keyline-width": `${PICKER_BRACKET_KEYLINE_WIDTH}px`,
  "--picker-srgb-dash-length": `${PICKER_SRGB_DASH_LENGTH}px`,
  "--picker-srgb-dash-gap": `${PICKER_SRGB_DASH_GAP}px`,
  "--picker-slider-field-inset": `${PICKER_SLIDER_FIELD_INSET}px`,
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
const warningStyle = computed<Record<string, string>>(() => {
  const position = getSliderWarningPosition({
    position: Number.isFinite(props.warningPosition) ? props.warningPosition : 0,
    thumbWidth: PICKER_SLIDER_THUMB_WIDTH,
    warningWidth: PICKER_WARNING_GLYPH_SIZE,
    edgeClearance: PICKER_SLIDER_EDGE_CLEARANCE,
  });
  return {
    "--picker-slider-warning-position": `${position.positionPercent.toFixed(4)}%`,
    "--picker-slider-warning-thumb-offset": `${position.thumbOffset.toFixed(4)}px`,
    "--picker-slider-warning-edge": `${position.edge}px`,
  };
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
  emit("update:modelValue", clampNumeric(value));
}

function updateFromRange(event: Event): void {
  const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
  if (!Number.isFinite(value)) return;
  emit("update:modelValue", clamp(value));
}

function positionStyle(position: number): Record<string, string> {
  return { left: `${Math.min(1, Math.max(0, position)) * 100}%` };
}

function tickStyle(marker: LinearControlMarker): Record<string, string> {
  const style: Record<string, string> = positionStyle(marker.position);
  if (marker.cssColor) style["--tick-color"] = marker.cssColor;
  return style;
}

function intervalStyle(interval: LinearControlInterval): Record<string, string> {
  const start = Math.min(1, Math.max(0, interval.start));
  const end = Math.min(1, Math.max(start, interval.end));
  return { left: `${start * 100}%`, width: `${(end - start) * 100}%` };
}

function bracketLineY(tone: LinearControlInterval["tone"]): number {
  return tone === "display-p3" ? 0.5 : PICKER_BRACKET_CAP_LENGTH - 0.5;
}

function bracketCapsPath(tone: LinearControlInterval["tone"]): string {
  const lineY = bracketLineY(tone);
  const capEnd = tone === "display-p3" ? PICKER_BRACKET_CAP_LENGTH : 0;
  return `M 0 ${lineY} V ${capEnd} M 1000 ${lineY} V ${capEnd}`;
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

    <div class="oklch-linear-control__track">
      <span class="oklch-linear-control__field" :style="{ backgroundImage: gradient }" />
      <span class="oklch-linear-control__brackets" aria-hidden="true">
        <span
          v-for="interval in renderedIntervals"
          :key="`${interval.tone}-${interval.index}`"
          class="oklch-linear-control__interval"
          :class="`oklch-linear-control__interval--${interval.tone}`"
          :style="intervalStyle(interval)"
          :data-gamut-interval="interval.tone"
          :data-gamut-bracket="interval.tone"
          :data-bracket-start="interval.start"
          :data-bracket-end="interval.end"
        >
          <svg
            class="oklch-linear-control__bracket"
            :viewBox="`0 0 1000 ${PICKER_BRACKET_CAP_LENGTH}`"
            preserveAspectRatio="none"
          >
            <line
              class="oklch-linear-control__bracket-keyline"
              :class="
                interval.tone === 'srgb'
                  ? 'oklch-linear-control__bracket-horizontal--srgb'
                  : undefined
              "
              x1="0"
              x2="1000"
              :y1="bracketLineY(interval.tone)"
              :y2="bracketLineY(interval.tone)"
              vector-effect="non-scaling-stroke"
            />
            <line
              class="oklch-linear-control__bracket-core"
              :class="
                interval.tone === 'srgb'
                  ? 'oklch-linear-control__bracket-horizontal--srgb'
                  : undefined
              "
              x1="0"
              x2="1000"
              :y1="bracketLineY(interval.tone)"
              :y2="bracketLineY(interval.tone)"
              :data-bracket-line="interval.tone === 'srgb' ? 'dashed' : 'solid'"
              vector-effect="non-scaling-stroke"
            />
            <path
              class="oklch-linear-control__bracket-keyline"
              :d="bracketCapsPath(interval.tone)"
              vector-effect="non-scaling-stroke"
            />
            <path
              class="oklch-linear-control__bracket-core"
              :d="bracketCapsPath(interval.tone)"
              data-bracket-caps="start-end"
              vector-effect="non-scaling-stroke"
            />
          </svg>
        </span>
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
      />
    </div>

    <p v-if="help" :id="helpId" class="oklch-linear-control__help">{{ help }}</p>
    <span v-if="warningDescriptionId" :id="warningDescriptionId" class="sr-only">
      {{ warningLabel }}
    </span>
  </div>
</template>
