<script setup lang="ts">
import { gpAttribute, gpPart, mountRange } from "@gamut-plane/ui";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import NumericInput from "./NumericInput.vue";
import {
  PICKER_SLIDER_FIELD_INSET,
  PICKER_SLIDER_TRACK_HEIGHT,
  PICKER_SLIDER_THUMB_TOP,
  PICKER_SLIDER_THUMB_WIDTH,
} from "@gamut-plane/render";
import { channelSections, type LinearControlInterval } from "@gamut-plane/render";
export type { LinearControlInterval } from "@gamut-plane/render";

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
    normalizeValue?: (value: number) => number;
    precision?: number;
    intervals?: readonly LinearControlInterval[];
    overflowMax?: boolean;
    help?: string;
  }>(),
  {
    precision: 3,
    intervals: () => [],
    overflowMax: false,
    help: "",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: number];
  commit: [value: number];
  cancel: [];
  "range-interaction": [active: boolean];
}>();

const helpId = computed(() => (props.help ? `${props.id}-help` : undefined));
const boundedModelValue = computed(() => clamp(props.modelValue));
const isOutsideInstrument = computed(
  () => props.modelValue < props.min || props.modelValue > props.max,
);
const numericMax = computed<number | undefined>(() => (props.overflowMax ? undefined : props.max));
const rangeElement = ref<HTMLInputElement>();
const displayedRangeValue = ref(boundedModelValue.value);
let rangeBinding: ReturnType<typeof mountRange> | undefined;
const instrumentStyle = {
  "--picker-slider-field-inset": `${PICKER_SLIDER_FIELD_INSET}px`,
  "--picker-slider-track-height": `${PICKER_SLIDER_TRACK_HEIGHT}px`,
  "--picker-slider-thumb-top": `${PICKER_SLIDER_THUMB_TOP}px`,
  "--picker-slider-thumb-width": `${PICKER_SLIDER_THUMB_WIDTH}px`,
};
const guideSections = computed(() => channelSections(props.intervals));

onMounted(() => {
  rangeBinding = mountRange(rangeElement.value!, () => ({
    value: boundedModelValue.value,
    min: props.min,
    max: props.max,
    ...(props.normalizeValue ? { normalizeValue: props.normalizeValue } : {}),
    onInput: (value) => emit("update:modelValue", value),
    onComplete: (value) => {
      emit("update:modelValue", value);
      emit("commit", value);
    },
    onInteraction: (active) => emit("range-interaction", active),
  }));
});

function clamp(value: number): number {
  return Math.min(props.max, Math.max(props.min, value));
}

function markPointerFocus(event: PointerEvent): void {
  if (event.pointerType === "mouse" && event.button !== 0) return;
  rangeElement.value?.setAttribute("data-pointer-focus", "");
  rangeElement.value?.setAttribute(gpAttribute.pointerFocus, "");
}

function clearPointerFocus(): void {
  rangeElement.value?.removeAttribute("data-pointer-focus");
  rangeElement.value?.removeAttribute(gpAttribute.pointerFocus);
}

function sectionStyle(section: LinearControlInterval): Record<string, string> {
  return { left: `${section.start * 100}%`, width: `${(section.end - section.start) * 100}%` };
}

watch(
  () => [props.modelValue, props.min, props.max, props.normalizeValue],
  () => {
    rangeBinding?.reconcile();
    // Vue's value binding must reflect the controller's native value after feedback.
    displayedRangeValue.value = rangeElement.value?.valueAsNumber ?? boundedModelValue.value;
  },
  { flush: "sync" },
);

onBeforeUnmount(() => {
  rangeBinding?.dispose();
  rangeBinding = undefined;
});
</script>

<template>
  <div
    class="channel-control"
    :data-gp-part="gpPart.channel"
    :data-gp-channel="channel.toLowerCase()"
    :data-gp-overflow="String(isOutsideInstrument)"
    :data-picker-control="channel.toLowerCase()"
    :data-instrument-overflow="isOutsideInstrument ? 'true' : 'false'"
    :style="instrumentStyle"
  >
    <header class="channel-control__header" :data-gp-part="gpPart.channelHeader">
      <label :for="id">
        <span>{{ channel }}</span>
        {{ label }}
      </label>
      <NumericInput
        class="channel-control__number"
        :aria-label="`${label} numeric value`"
        :aria-describedby="helpId"
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

    <div class="channel-control__track" :data-gp-part="gpPart.channelTrack">
      <span
        class="channel-control__field"
        :data-gp-part="gpPart.channelField"
        :style="{ backgroundImage: gradient }"
      />
      <span class="channel-control__gamut-ranges" aria-hidden="true">
        <span
          v-for="(section, index) in guideSections"
          :key="`${section.tone}-range-${index}`"
          class="channel-control__gamut-range"
          :data-gp-part="gpPart.gamutInterval"
          :data-gp-gamut="section.tone"
          :class="`channel-control__gamut-range--${section.tone}`"
          :style="sectionStyle(section)"
          :data-gamut-range="section.tone"
          :data-range-start="section.start"
          :data-range-end="section.end"
        />
      </span>
      <input
        ref="rangeElement"
        :id="id"
        class="channel-control__range"
        :data-gp-part="gpPart.nativeRange"
        type="range"
        :aria-describedby="helpId"
        :aria-label="label"
        :value="displayedRangeValue"
        :min="min"
        :max="max"
        :step="step"
        @pointerdown="markPointerFocus"
        @blur="clearPointerFocus"
        @keydown="clearPointerFocus"
      />
    </div>

    <p v-if="help" :id="helpId" class="channel-control__help">{{ help }}</p>
  </div>
</template>
