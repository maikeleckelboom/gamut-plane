<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

const props = defineProps<{
  modelValue: number;
  min: number;
  max?: number;
  step: number;
  precision: number;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: number];
  commit: [value: number];
  cancel: [];
}>();
const input = ref<HTMLInputElement>();
const draft = ref(props.modelValue.toFixed(props.precision));
let dirty = false;
let revision = 0;

function reset(): void {
  dirty = false;
  draft.value = props.modelValue.toFixed(props.precision);
  // Also clear the browser's internal bad-input buffer (e.g. a lone minus sign).
  if (input.value) input.value.value = draft.value;
}

function edit(event: Event): void {
  revision += 1;
  dirty = true;
  draft.value = (event.currentTarget as HTMLInputElement).value;
}

function complete(): void {
  if (!dirty) return;
  const value = input.value?.valueAsNumber;
  dirty = false;
  const completedRevision = revision;
  if (value !== undefined && Number.isFinite(value)) {
    const next = Math.min(props.max ?? Infinity, Math.max(props.min, value));
    emit("update:modelValue", next);
    emit("commit", next);
  }
  void nextTick(() => {
    if (revision === completedRevision) reset();
  });
}

function keydown(event: KeyboardEvent): void {
  if (event.isComposing) return;
  if (event.key === "Enter") {
    event.preventDefault();
    complete();
  } else if (event.key === "Escape" && dirty) {
    event.preventDefault();
    event.stopPropagation();
    revision += 1;
    reset();
    emit("cancel");
  }
}

watch(() => props.modelValue, reset);
</script>

<template>
  <input
    ref="input"
    type="number"
    inputmode="decimal"
    :value="draft"
    :min="min"
    :max="max"
    :step="step"
    @input="edit"
    @change="complete"
    @blur="complete"
    @keydown="keydown"
  />
</template>
