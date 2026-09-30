<script setup lang="ts">
import type { GamutCheckResult } from "@gamut-plane/core/internal/capabilities";
import type { GuideId } from "@gamut-plane/render";
import { referenceGuidePolicy } from "@gamut-plane/render/internal/capabilities";
import { computed, onBeforeUnmount, onMounted, onUpdated, useTemplateRef } from "vue";
import {
  gamutContextMenuGroups,
  gamutContextMenuName,
  generalizedCopy,
  gpPart,
  mountGamutContextMenu,
  type GamutAction,
} from "@gamut-plane/ui";
import type { GamutPlaneState } from "../model/publicState.js";

const props = defineProps<{
  id: string;
  state: GamutPlaneState;
  checks: readonly GamutCheckResult[];
  paused: readonly GuideId[];
  readOnly: boolean;
}>();
const emit = defineEmits<{ request: [action: GamutAction<GuideId>] }>();
const menu = useTemplateRef<HTMLDivElement>("menu");
const groups = computed(() =>
  gamutContextMenuGroups(props.state, props.checks, referenceGuidePolicy, props.paused),
);
let binding: ReturnType<typeof mountGamutContextMenu> | undefined;
onMounted(() => {
  const surface = menu.value!.parentElement!.querySelector<HTMLElement>(
    '[data-gp-part="surface"]',
  )!;
  binding = mountGamutContextMenu(surface, menu.value!, () => ({
    groups: groups.value,
    readOnly: props.readOnly,
    request: (action) => emit("request", action),
  }));
});
onUpdated(() => binding?.reconcile());
onBeforeUnmount(() => binding?.dispose());
</script>

<template>
  <div
    ref="menu"
    class="gp-gamut-menu"
    :data-gp-part="gpPart.gamutContextMenu"
    role="menu"
    :aria-label="gamutContextMenuName"
    :aria-describedby="readOnly ? `${id}-menu-read-only` : undefined"
    popover="manual"
    hidden
  >
    <span v-if="readOnly" :id="`${id}-menu-read-only`" data-gp-visually-hidden>{{
      generalizedCopy.readOnly
    }}</span>
    <template v-for="(group, index) in groups" :key="group.id">
      <hr v-if="index > 0" class="gp-gamut-menu-separator" />
      <div role="group" :aria-labelledby="`${id}-menu-${group.id}`">
        <div :id="`${id}-menu-${group.id}`" class="gp-gamut-menu-heading">{{ group.label }}</div>
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          class="gp-gamut-menu-item"
          :role="item.role"
          :data-gp-command="item.id"
          :aria-checked="item.checked"
          :aria-disabled="readOnly"
          :aria-labelledby="`${id}-menu-${item.id}-label`"
          :aria-describedby="item.fact ? `${id}-menu-${item.id}-fact` : undefined"
          tabindex="-1"
        >
          <span class="gp-gamut-menu-indicator" aria-hidden="true" />
          <span :id="`${id}-menu-${item.id}-label`">{{ item.label }}</span>
          <span
            v-if="item.fact"
            class="gp-gamut-menu-fact"
            :data-gp-status="item.status ?? undefined"
            :aria-hidden="item.description ? true : undefined"
            :id="item.description ? undefined : `${id}-menu-${item.id}-fact`"
            >{{ item.fact }}</span
          >
          <span
            v-if="item.description"
            :id="`${id}-menu-${item.id}-fact`"
            data-gp-visually-hidden
            >{{ item.description }}</span
          >
        </button>
      </div>
    </template>
  </div>
</template>
