<script setup lang="ts">
import { useResizeObserver } from "@vueuse/core";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import NumericInput from "./NumericInput.vue";
import GamutWarningGlyph from "./GamutWarningGlyph.vue";
import {
  PICKER_SLIDER_DEFAULT_TRACK_WIDTH,
  PICKER_SLIDER_FIELD_INSET,
  PICKER_SLIDER_TRACK_HEIGHT,
  PICKER_SLIDER_THUMB_TOP,
  PICKER_SLIDER_THUMB_WIDTH,
  PICKER_SLIDER_WARNING_TOP,
  PICKER_WARNING_GLYPH_SIZE,
} from "@gamut-plane/render";
import {
  channelSections,
  channelThresholds,
  channelWarning,
  type LinearControlInterval,
  type LinearControlMarker,
} from "@gamut-plane/render";
export type { LinearControlInterval, LinearControlMarker } from "@gamut-plane/render";

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
    boundaryPreviewColor?: string;
    boundaryPreviewTone?: LinearControlInterval["tone"];
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
  cancel: [];
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
const inGamutSections = computed(() => channelSections(props.intervals));
const boundaryPreviewSection = computed(() =>
  inGamutSections.value.find(
    (section) => section.tone === props.boundaryPreviewTone && section.end < 1,
  ),
);
const gamutThresholds = computed(() => channelThresholds(inGamutSections.value));
const warning = computed(() =>
  channelWarning(props.warningPosition, trackWidth.value, props.markers, gamutThresholds.value),
);
const warningPlacement = computed(() => warning.value.placement);
const warningObstacles = computed(() => warning.value.obstacles);
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
}

onMounted(() => {
  updateTrackBounds();
  useResizeObserver(trackElement, ([entry]) => {
    if (entry) updateTrackWidth(entry.contentRect.width);
  });
});

function clamp(value: number): number {
  return Math.min(props.max, Math.max(props.min, value));
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
  rangeElement.value?.setAttribute("data-pointer-focus", "");
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
  rangeElement.value?.removeAttribute("data-pointer-focus");
  cancelRangePointer();
}

function onRangeKeydown(): void {
  rangeElement.value?.removeAttribute("data-pointer-focus");
}

function sectionStyle(section: LinearControlInterval): Record<string, string> {
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
      <NumericInput
        class="channel-control__number"
        :aria-label="`${label} numeric value`"
        :aria-describedby="describedBy"
        :model-value="modelValue"
        :precision="precision"
        :min="min"
        :max="numericMax"
        :step="step"
        @update:model-value="emit('update:modelValue', $event)"
        @commit="emit('commit', $event)"
        @cancel="emit('cancel')"
      />
    </header>

    <div ref="trackElement" class="channel-control__track" @pointerenter="updateTrackBounds">
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
          :data-start-internal="section.start > 0 ? 'true' : 'false'"
          :data-end-internal="section.end < 1 ? 'true' : 'false'"
        />
      </span>
      <span v-for="marker in markers" :key="marker.id" class="sr-only">{{ marker.label }}</span>
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
        @blur="blurRange"
        @keydown="onRangeKeydown"
      />
      <span
        v-if="boundaryPreviewSection && boundaryPreviewColor"
        class="channel-control__boundary-preview-position"
        aria-hidden="true"
      >
        <span
          class="channel-control__boundary-preview"
          :style="{
            left: `${boundaryPreviewSection.end * 100}%`,
            background: boundaryPreviewColor,
          }"
          data-slider-boundary-preview
        />
      </span>
    </div>

    <p v-if="help" :id="helpId" class="channel-control__help">{{ help }}</p>
    <span v-if="warningDescriptionId" :id="warningDescriptionId" class="sr-only">
      {{ warningLabel }}
    </span>
  </div>
</template>
