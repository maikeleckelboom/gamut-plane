<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { gpPart, mountNumericInput } from "@gamut-plane/ui";

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
let binding: ReturnType<typeof mountNumericInput> | undefined;
// Emit the initial value for SSR, then leave the live native value to the controller.
const vInitialValue = {
  mounted(element: HTMLInputElement) {
    element.value = props.modelValue.toFixed(props.precision);
  },
  getSSRProps() {
    return { value: props.modelValue.toFixed(props.precision) };
  },
};

onMounted(() => {
  binding = mountNumericInput(input.value!, () => ({
    value: props.modelValue,
    precision: props.precision,
    min: props.min,
    max: props.max,
    onComplete: (value) => {
      emit("update:modelValue", value);
      emit("commit", value);
    },
    onCancel: () => emit("cancel"),
  }));
});

watch(
  () => [props.modelValue, props.precision],
  () => binding?.reconcile(),
  { flush: "sync" },
);

onBeforeUnmount(() => {
  binding?.dispose();
  binding = undefined;
});
</script>

<template>
  <input
    ref="input"
    v-initial-value
    type="number"
    :data-gp-part="gpPart.numericInput"
    inputmode="decimal"
    :min="min"
    :max="max"
    :step="step"
  />
</template>
