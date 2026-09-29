<script setup lang="ts">
import { gpAttribute, gpPart, mountRange, referenceWarningGlyphPath } from "@gamut-plane/ui";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import { rangeWarningStyle } from "@gamut-plane/render/internal/current";
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
    channel: "L" | "C" | "H" | "a" | "b";
    modelValue: number;
    min?: number | undefined;
    max?: number | undefined;
    coordinateContext?: string | undefined;
    accessibleLabel?: string;
    continuous?: boolean;
    step: number;
    gradient: string;
    normalizeValue?: (value: number) => number;
    precision?: number;
    intervals?: readonly LinearControlInterval[];
    overflowMax?: boolean;
    help?: string;
    helpVisuallyHidden?: boolean;
    warning?: string | null;
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
const warningId = computed(() => (props.warning ? `${props.id}-warning` : undefined));
const describedBy = computed(
  () => [helpId.value, warningId.value].filter(Boolean).join(" ") || undefined,
);
const available = computed(() => props.min !== undefined && props.max !== undefined);
const warningStyle = computed(() =>
  available.value ? rangeWarningStyle(props.modelValue, props.min!, props.max!) : null,
);
const boundedModelValue = computed(() => clamp(props.modelValue));
const isOutsideInstrument = computed(
  () => available.value && (props.modelValue < props.min! || props.modelValue > props.max!),
);
const numericMax = computed<number | undefined>(() => (props.overflowMax ? undefined : props.max));
const rangeElement = ref<HTMLInputElement>();
let rangeBinding: ReturnType<typeof mountRange> | undefined;
// SSR supplies the initial value; mountRange owns the live native value after mount.
// Presentation-only updates must not overwrite a pending drag or normalized Hue endpoint.
const vInitialValue = {
  mounted(element: HTMLInputElement) {
    element.value = String(boundedModelValue.value);
  },
  getSSRProps() {
    return { value: boundedModelValue.value };
  },
};
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
    context: props.coordinateContext,
    keyboardStep: props.continuous ? props.step : undefined,
    ...(props.normalizeValue ? { normalizeValue: props.normalizeValue } : {}),
    onInput: (value) => emit("update:modelValue", value),
    onComplete: (value) => {
      emit("update:modelValue", value);
      emit("commit", value);
    },
    onInteraction: (active) => emit("range-interaction", active),
    onNativeValue: (nativeValue) => {
      const position = available.value
        ? rangeWarningStyle(nativeValue, props.min!, props.max!)
        : null;
      if (position)
        rangeElement.value?.parentElement?.style.setProperty(
          "--gp-range-warning-position",
          position.left,
        );
    },
  }));
});

function clamp(value: number): number {
  return Math.min(props.max ?? Infinity, Math.max(props.min ?? -Infinity, value));
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
  () => [props.modelValue, props.min, props.max, props.normalizeValue, props.coordinateContext],
  () => {
    rangeBinding?.reconcile();
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
    :data-gp-unavailable="String(!available)"
    :data-picker-control="channel.toLowerCase()"
    :data-instrument-overflow="isOutsideInstrument ? 'true' : 'false'"
    :style="instrumentStyle"
  >
    <header class="channel-control__header" :data-gp-part="gpPart.channelHeader">
      <label :for="id">
        {{ label }}
      </label>
      <NumericInput
        class="channel-control__number"
        :aria-label="`${accessibleLabel ?? label} numeric value`"
        :aria-describedby="describedBy"
        :model-value="modelValue"
        :readonly="!available"
        :aria-disabled="!available || undefined"
        :context="coordinateContext"
        :precision="precision"
        :min="min"
        :max="numericMax"
        :step="step"
        @update:model-value="emit('update:modelValue', $event)"
        @commit="emit('commit', $event)"
        @cancel="emit('cancel')"
      />
    </header>

    <span :data-gp-part="gpPart.channelSymbol" aria-hidden="true">{{ channel }}</span>
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
      <svg
        v-if="warning && warningStyle"
        :data-gp-part="gpPart.referenceWarning"
        data-gamut-warning="linear"
        :style="{ left: `var(--gp-range-warning-position, ${warningStyle.left})` }"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        aria-hidden="true"
        focusable="false"
      >
        <path :d="referenceWarningGlyphPath" />
      </svg>
      <input
        ref="rangeElement"
        :id="id"
        class="channel-control__range"
        :data-gp-part="gpPart.nativeRange"
        type="range"
        :aria-describedby="describedBy"
        :aria-label="accessibleLabel ?? label"
        :aria-valuetext="
          isOutsideInstrument
            ? `${modelValue.toFixed(precision)} (outside direct range)`
            : undefined
        "
        :disabled="!available || min === max"
        v-initial-value
        :min="min"
        :max="max"
        :step="continuous ? 'any' : step"
        @pointerdown="markPointerFocus"
        @blur="clearPointerFocus"
        @keydown="clearPointerFocus"
      />
    </div>

    <span v-if="help && helpVisuallyHidden" :id="helpId" data-gp-visually-hidden>{{ help }}</span>
    <p v-else-if="help" :id="helpId" class="channel-control__help">{{ help }}</p>
    <span v-if="warning" :id="warningId" data-gp-visually-hidden>{{ warning }}</span>
  </div>
</template>
