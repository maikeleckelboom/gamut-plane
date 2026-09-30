<script setup lang="ts">
import type { GamutId } from "@gamut-plane/core";
import type { GamutCheckResult } from "@gamut-plane/core/internal/capabilities";
import type { GuideId } from "@gamut-plane/render";
import { referenceGuidePolicy } from "@gamut-plane/render/internal/capabilities";
import { computed, onBeforeUnmount, onMounted, onUpdated, useTemplateRef } from "vue";
import {
  boundaryPausedCopy,
  gamutCloseGlyphPath,
  gamutRows,
  gamutStatusCopy,
  gamutSummary,
  gamutSummaryCopy,
  generalizedCopy,
  gpPart,
  mountGamutPopup,
  referenceChoices,
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
const trigger = useTemplateRef<HTMLButtonElement>("trigger");
const popup = useTemplateRef<HTMLDivElement>("popup");
const rows = computed(() =>
  gamutRows(props.state, props.checks, referenceGuidePolicy, props.paused),
);
const summary = computed(() => gamutSummaryCopy(gamutSummary(props.state, props.checks)));
const choices = computed(() => referenceChoices(props.state.referenceGamutId));
let binding: ReturnType<typeof mountGamutPopup> | undefined;
onMounted(() => {
  binding = mountGamutPopup(trigger.value!, popup.value!);
});
onUpdated(() => binding?.reconcile());
onBeforeUnmount(() => binding?.dispose());

// Native mutation is a request, not accepted UI. Restore accepted state until the parent accepts.
function toggle(event: Event, action: GamutAction<GuideId>, accepted: boolean): void {
  emit("request", action);
  (event.target as HTMLInputElement).checked = accepted;
}
function choose(event: Event, gamutId: GamutId | null): void {
  emit("request", { kind: "reference", gamutId });
  const group = (event.target as HTMLInputElement).closest("[role=radiogroup]")!;
  for (const radio of group.querySelectorAll("input")) {
    radio.checked = radio.value === (props.state.referenceGamutId ?? "none");
  }
}
</script>

<template>
  <div class="gp-gamuts" :data-gp-part="gpPart.gamuts">
    <button
      ref="trigger"
      :id="`${id}-gamuts`"
      type="button"
      class="gp-gamuts-trigger"
      :data-gp-part="gpPart.gamutTrigger"
      aria-haspopup="dialog"
      aria-expanded="false"
      :aria-controls="`${id}-gamuts-popup`"
      :aria-labelledby="`${id}-gamuts-label`"
      :aria-describedby="`${id}-gamuts-description`"
    >
      <span :id="`${id}-gamuts-label`" class="gp-gamuts-label">{{
        generalizedCopy.comparison
      }}</span>
      <span class="gp-gamuts-outside" data-gp-status="outside">{{ summary.outside ?? "" }}</span>
      <span class="gp-gamuts-chevron" aria-hidden="true">▾</span>
      <span class="gp-gamuts-summary" :data-gp-part="gpPart.gamutSummary">
        <span>{{ summary.reference }}</span>
        <template v-if="summary.target">
          {{ " " }}<span class="gp-gamuts-target">{{ summary.target }}</span>
        </template>
        <template v-if="summary.statusText">
          {{ " "
          }}<span class="gp-gamuts-status"
            ><span aria-hidden="true">·</span>{{ " "
            }}<span :data-gp-status="summary.status">{{ summary.statusText }}</span></span
          >
        </template>
      </span>
      <span :id="`${id}-gamuts-description`" data-gp-visually-hidden>{{
        summary.description
      }}</span>
    </button>
    <div
      ref="popup"
      :id="`${id}-gamuts-popup`"
      class="gp-gamuts-popup"
      :data-gp-part="gpPart.gamutPopup"
      role="dialog"
      :aria-labelledby="`${id}-gamuts-heading`"
      :aria-describedby="readOnly ? `${id}-gamuts-read-only` : undefined"
      popover="auto"
      tabindex="-1"
      hidden
    >
      <div class="gp-gamuts-head">
        <span :id="`${id}-gamuts-heading`" class="gp-gamuts-heading">{{
          generalizedCopy.comparison
        }}</span>
        <span v-if="readOnly" :id="`${id}-gamuts-read-only`" class="gp-gamuts-read-only">{{
          generalizedCopy.readOnly
        }}</span>
        <button
          type="button"
          class="gp-gamuts-close"
          data-gp-close
          :aria-label="generalizedCopy.close"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path :d="gamutCloseGlyphPath" />
          </svg>
        </button>
      </div>
      <div
        v-for="row in rows"
        :key="row.gamutId"
        role="group"
        class="gp-gamut-row"
        :data-gp-part="gpPart.gamutRow"
        :data-gp-gamut="row.gamutId"
        :aria-labelledby="`${id}-${row.gamutId}-name`"
        :aria-describedby="`${id}-${row.gamutId}-status`"
      >
        <span :id="`${id}-${row.gamutId}-name`" class="gp-gamut-name">{{ row.label }}</span>
        <span
          v-if="row.checked"
          :id="`${id}-${row.gamutId}-status`"
          class="gp-gamut-status"
          :data-gp-part="gpPart.exactResult"
          :data-gp-gamut="row.gamutId"
          :data-gp-status="row.status"
          >{{ gamutStatusCopy(row.status) }}</span
        >
        <span v-else :id="`${id}-${row.gamutId}-status`" class="gp-gamut-status">{{
          generalizedCopy.statusOff
        }}</span>
        <div class="gp-gamut-toggles">
          <label class="gp-gamut-toggle">
            <input
              type="checkbox"
              :aria-label="`${row.label} ${generalizedCopy.exactChecks}`"
              :checked="row.checked"
              :disabled="readOnly"
              @change="
                toggle(
                  $event,
                  {
                    kind: 'status',
                    gamutId: row.gamutId,
                    requested: ($event.target as HTMLInputElement).checked,
                  },
                  row.checked,
                )
              "
            />
            <span>{{ generalizedCopy.exactChecks }}</span>
          </label>
          <label class="gp-gamut-toggle" :data-gp-part="gpPart.guidePreference">
            <input
              type="checkbox"
              :aria-label="`${row.label} ${generalizedCopy.visibleGuides}`"
              :aria-describedby="row.boundaryPaused ? `${id}-${row.gamutId}-paused` : undefined"
              :checked="row.boundary"
              :disabled="readOnly"
              @change="
                toggle(
                  $event,
                  {
                    kind: 'boundary',
                    guideId: row.guideId,
                    requested: ($event.target as HTMLInputElement).checked,
                  },
                  row.boundary,
                )
              "
            />
            <span>{{ generalizedCopy.visibleGuides }}</span>
            <svg class="gp-boundary-sample" viewBox="0 0 16 4" aria-hidden="true" focusable="false">
              <path d="M1 2H15" />
            </svg>
            <template v-if="row.boundaryPaused">
              <span class="gp-boundary-paused" aria-hidden="true">{{
                generalizedCopy.boundaryPaused
              }}</span>
              <span :id="`${id}-${row.gamutId}-paused`" data-gp-visually-hidden>{{
                boundaryPausedCopy(state.selection)
              }}</span>
            </template>
          </label>
        </div>
      </div>
      <div
        role="radiogroup"
        class="gp-reference"
        :data-gp-part="gpPart.referenceChoice"
        :aria-labelledby="`${id}-reference-label`"
      >
        <span :id="`${id}-reference-label`" class="gp-reference-label">{{
          generalizedCopy.reference
        }}</span>
        <div class="gp-reference-options">
          <label v-for="choice in choices" :key="choice.value">
            <input
              type="radio"
              :name="`${id}-reference`"
              :value="choice.value"
              :checked="choice.selected"
              :disabled="readOnly"
              @change="choose($event, choice.gamutId)"
            />
            <span>{{ choice.label }}</span>
          </label>
        </div>
      </div>
    </div>
  </div>
</template>
