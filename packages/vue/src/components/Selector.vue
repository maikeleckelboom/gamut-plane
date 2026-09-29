<script setup lang="ts">
import { onMounted, onBeforeUnmount, onUpdated, useTemplateRef } from "vue";
import { exactStatusCopy, mountSelector, type SelectorOption } from "@gamut-plane/ui";
const props = defineProps<{
  id: string;
  label: string;
  value: string;
  options: readonly SelectorOption[];
  disabled: boolean;
}>();
const emit = defineEmits<{ request: [value: string] }>();
const trigger = useTemplateRef<HTMLButtonElement>("trigger");
const popup = useTemplateRef<HTMLDivElement>("popup");
let binding: ReturnType<typeof mountSelector> | undefined;
onMounted(() => {
  binding = mountSelector(trigger.value!, popup.value!, () => ({
    ...props,
    request: (value) => emit("request", value),
  }));
});
onUpdated(() => binding?.reconcile());
onBeforeUnmount(() => binding?.dispose());
</script>
<template>
  <div class="gp-selector">
    <label :id="`${id}-label`" :for="id">{{ label }}</label>
    <button
      ref="trigger"
      :id="id"
      type="button"
      role="combobox"
      :aria-labelledby="`${id}-label`"
      aria-expanded="false"
      aria-haspopup="listbox"
      :aria-controls="`${id}-list`"
      :disabled="disabled"
    >
      <span>{{ options.find((option) => option.value === value)?.label }}</span
      ><span aria-hidden="true">▾</span>
    </button>
    <div
      ref="popup"
      :id="`${id}-list`"
      class="gp-selector-popup"
      role="listbox"
      :aria-labelledby="`${id}-label`"
      popover="auto"
      hidden
    >
      <div
        v-for="(option, index) in options"
        :key="option.value"
        :id="`${id}-option-${index}`"
        role="option"
        :data-value="option.value"
        :aria-selected="option.value === value"
        :aria-label="
          option.status
            ? `${option.label}, gamut status ${exactStatusCopy[option.status]}`
            : option.label
        "
      >
        <span class="gp-selector-check" aria-hidden="true">{{
          option.value === value ? "✓" : ""
        }}</span>
        <span>{{ option.label }}</span>
        <span class="gp-selector-status" :data-gp-status="option.status">{{
          option.status ? exactStatusCopy[option.status] : ""
        }}</span>
      </div>
    </div>
  </div>
</template>
