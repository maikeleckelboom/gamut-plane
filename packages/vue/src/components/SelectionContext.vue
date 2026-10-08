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
</script>
<template>
  <div class="gp-generalized-selection" :data-gp-part="gpPart.representationControl">
    <div class="gp-context-row">
      <Selector
        :id="`${id}-representation`"
        :label="generalizedCopy.representation"
        inline-label
        :request-current="selection.editorId === null"
        :value="selection.representationId"
        :options="options"
        :disabled="disabled"
        @request="act({ kind: 'representation', value: $event })"
      />
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
