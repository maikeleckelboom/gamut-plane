<script setup lang="ts">
import type { GamutId } from "@gamut-plane/core";
import type { ReferenceBoundaryFit } from "@gamut-plane/render/internal/current";
import type { FieldViewport } from "@gamut-plane/render/internal/viewport";
import {
  exactGamutUi,
  gpPart,
  mountGamutPopup,
  referenceBoundaryFitCopy,
  viewportCopy,
} from "@gamut-plane/ui";
import { computed, onBeforeUnmount, onMounted, onUpdated, useId, useTemplateRef } from "vue";

const props = defineProps<{ fit: ReferenceBoundaryFit; referenceGamutId: GamutId | null }>();
const emit = defineEmits<{ fit: [pose: FieldViewport] }>();
const id = useId();
const trigger = useTemplateRef<HTMLButtonElement>("trigger");
const popup = useTemplateRef<HTMLDivElement>("popup");
const target = computed(() =>
  props.referenceGamutId ? exactGamutUi[props.referenceGamutId].label : null,
);
const description = computed(() => referenceBoundaryFitCopy(target.value, props.fit));
let binding: ReturnType<typeof mountGamutPopup> | undefined;
onMounted(() => {
  binding = mountGamutPopup(trigger.value!, popup.value!, { matchTriggerWidth: false });
});
onUpdated(() => binding?.reconcile());
onBeforeUnmount(() => binding?.dispose());
function frameReference(): void {
  if (props.fit.kind !== "available") return;
  emit("fit", props.fit.viewport);
  binding?.close(true);
}
</script>

<template>
  <div class="gp-field-framing">
    <button
      ref="trigger"
      type="button"
      :data-gp-part="gpPart.viewportButton"
      class="gp-framing-trigger"
      :aria-label="viewportCopy.framingOptions"
      aria-haspopup="dialog"
      aria-expanded="false"
      :aria-controls="`${id}-framing`"
    >
      <span aria-hidden="true">▾</span>
    </button>
    <div
      ref="popup"
      :id="`${id}-framing`"
      class="gp-framing-popup"
      role="dialog"
      :aria-label="viewportCopy.framing"
      popover="auto"
      hidden
    >
      <span class="gp-framing-reference"
        >Reference <span>{{ target ?? "None" }}</span></span
      >
      <button
        type="button"
        class="gp-framing-action"
        :aria-disabled="fit.kind !== 'available' || undefined"
        :aria-describedby="`${id}-reason`"
        @click="frameReference"
      >
        {{ viewportCopy.fitReference }}
      </button>
      <p :id="`${id}-reason`" class="gp-framing-reason">{{ description }}</p>
    </div>
  </div>
</template>
