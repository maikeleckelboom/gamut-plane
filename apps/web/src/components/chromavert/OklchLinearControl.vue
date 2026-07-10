<script setup lang="ts">
import { computed } from "vue";

export interface LinearControlMarker {
  id: string;
  label: string;
  position: number;
  tone: "srgb" | "display-p3" | "fallback";
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
    help?: string;
  }>(),
  {
    precision: 3,
    markers: () => [],
    intervals: () => [],
    help: "",
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: number];
}>();

const helpId = computed(() => (props.help ? `${props.id}-help` : undefined));
const boundedModelValue = computed(() => clamp(props.modelValue));
const isOutsideInstrument = computed(
  () => props.modelValue < props.min || props.modelValue > props.max,
);

function clamp(value: number): number {
  return Math.min(props.max, Math.max(props.min, value));
}

function updateFromEvent(event: Event): void {
  const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
  if (Number.isFinite(value)) emit("update:modelValue", clamp(value));
}

function positionStyle(position: number): Record<string, string> {
  return { left: `${Math.min(1, Math.max(0, position)) * 100}%` };
}

function intervalStyle(interval: LinearControlInterval): Record<string, string> {
  const start = Math.min(1, Math.max(0, interval.start));
  const end = Math.min(1, Math.max(start, interval.end));
  return { left: `${start * 100}%`, width: `${(end - start) * 100}%` };
}
</script>

<template>
  <div
    class="oklch-linear-control"
    :data-picker-control="channel.toLowerCase()"
    :data-instrument-overflow="isOutsideInstrument ? 'true' : 'false'"
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
        :value="modelValue.toFixed(precision)"
        :min="min"
        :max="max"
        :step="step"
        @change="updateFromEvent"
      />
    </header>

    <div class="oklch-linear-control__track">
      <span class="oklch-linear-control__field" :style="{ backgroundImage: gradient }" />
      <span
        v-for="(interval, index) in intervals"
        :key="`${interval.tone}-${index}`"
        class="oklch-linear-control__interval"
        :class="`oklch-linear-control__interval--${interval.tone}`"
        :style="intervalStyle(interval)"
        :data-gamut-interval="interval.tone"
      />
      <span
        v-for="marker in markers"
        :key="marker.id"
        class="oklch-linear-control__tick"
        :class="`oklch-linear-control__tick--${marker.tone}`"
        :style="positionStyle(marker.position)"
        :title="marker.label"
        :aria-label="marker.label"
        :data-gamut-marker="marker.id"
      />
      <input
        :id="id"
        class="oklch-linear-control__range"
        type="range"
        :aria-describedby="helpId"
        :aria-label="`${label} ${modelValue.toFixed(precision)}`"
        :value="boundedModelValue"
        :min="min"
        :max="max"
        :step="step"
        @input="updateFromEvent"
      />
    </div>

    <p v-if="help" :id="helpId" class="oklch-linear-control__help">{{ help }}</p>
  </div>
</template>
