<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, onUpdated, useTemplateRef } from "vue";
import {
  exactStatusCopy,
  mountSelector,
  selectorGroups,
  type SelectorOption,
} from "@gamut-plane/ui";
const props = defineProps<{
  id: string;
  label: string;
  value: string;
  options: readonly SelectorOption[];
  disabled: boolean;
  inlineLabel?: boolean;
  requestCurrent?: boolean;
}>();
const emit = defineEmits<{ request: [value: string] }>();
const trigger = useTemplateRef<HTMLButtonElement>("trigger");
const popup = useTemplateRef<HTMLDivElement>("popup");
const groups = computed(() => selectorGroups(props.options));
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
      :aria-describedby="
        options.find((option) => option.value === value)?.description
          ? `${id}-description`
          : undefined
      "
      :disabled="disabled"
    >
      <span v-if="inlineLabel" class="gp-selector-inline-label" aria-hidden="true">{{
        label
      }}</span>
      <span>{{ options.find((option) => option.value === value)?.label }}</span
      ><span aria-hidden="true">▾</span>
    </button>
    <span
      v-if="options.find((option) => option.value === value)?.description"
      :id="`${id}-description`"
      data-gp-visually-hidden
      >{{ options.find((option) => option.value === value)?.description }}</span
    >
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
        v-for="(group, groupIndex) in groups"
        :key="groupIndex"
        :role="group.label ? 'group' : undefined"
        :aria-labelledby="group.label ? `${id}-group-${groupIndex}` : undefined"
      >
        <div v-if="group.label" :id="`${id}-group-${groupIndex}`" class="gp-selector-heading">
          {{ group.label }}
        </div>
        <div
          v-for="{ option, index } in group.options"
          :key="option.value"
          :id="`${id}-option-${index}`"
          role="option"
          :data-value="option.value"
          :aria-selected="option.value === value"
          :aria-label="
            option.status
              ? `${option.label}, gamut status ${exactStatusCopy[option.status]}`
              : `${option.optionLabel ?? option.label}${option.description ? `. ${option.description}` : ''}`
          "
        >
          <span class="gp-selector-check" aria-hidden="true">{{
            option.value === value ? "✓" : ""
          }}</span>
          <span class="gp-selector-name">{{ option.optionLabel ?? option.label }}</span>
          <span v-if="option.coordinates" class="gp-selector-coordinates" aria-hidden="true">{{
            option.coordinates
          }}</span>
          <span v-if="option.status" class="gp-selector-status" :data-gp-status="option.status">{{
            option.status ? exactStatusCopy[option.status] : ""
          }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
