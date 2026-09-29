<script setup lang="ts">
import { computed } from "vue";
import {
  generalizedCopy,
  gpPart,
  selectionContext,
  requestShellSelection,
  type SelectorOption,
  type ShellSelection,
  type ShellEditor,
  type SelectionFacts,
  type SelectionAction,
} from "@gamut-plane/ui";
import Selector from "./Selector.vue";
const props = defineProps<{
  id: string;
  selection: ShellSelection;
  options: readonly SelectorOption[];
  disabled: boolean;
  facts?: SelectionFacts<ShellEditor>;
}>();
const emit = defineEmits<{ request: [selection: ShellSelection] }>();
const context = computed(() => selectionContext(props.selection, props.facts));
function act(action: SelectionAction) {
  if (props.disabled) return;
  const next = requestShellSelection(props.selection, action, props.facts);
  if (next !== props.selection) emit("request", next);
}
function modeChange(event: Event, value: "edit" | "inspect") {
  act({ kind: "mode", value });
  // Native radio mutation is a request, not accepted UI. Reset the whole group synchronously.
  const target = event.target as HTMLInputElement;
  for (const radio of target.closest("fieldset")!.querySelectorAll("input")) {
    radio.checked = context.value.editing === (radio.value === "edit");
  }
}
</script>
<template>
  <div class="gp-generalized-selection" :data-gp-part="gpPart.representationControl">
    <div class="gp-context-row">
      <Selector
        :id="`${id}-representation`"
        :label="generalizedCopy.representation"
        :value="selection.representationId"
        :options="options"
        :disabled="disabled"
        @request="act({ kind: 'representation', value: $event })"
      />
      <fieldset v-if="context.canEdit" class="gp-mode" :disabled="disabled">
        <legend data-gp-visually-hidden>{{ generalizedCopy.interactionMode }}</legend>
        <label v-for="mode in ['edit', 'inspect'] as const" :key="mode">
          <input
            type="radio"
            :name="`${id}-mode`"
            :value="mode"
            :checked="context.editing === (mode === 'edit')"
            @change="modeChange($event, mode)"
          />
          <span>{{ generalizedCopy[mode] }}</span>
        </label>
      </fieldset>
      <span v-else class="gp-context-mode">{{ generalizedCopy.inspectionOnly }}</span>
    </div>
    <Selector
      v-if="context.areas.length > 1"
      :id="`${id}-area`"
      :label="generalizedCopy.area"
      :value="selection.editorId!"
      :options="context.areas"
      :disabled="disabled"
      @request="act({ kind: 'area', value: $event })"
    />
  </div>
</template>
