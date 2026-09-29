<script setup lang="ts">
import {
  authorPlaneEdit,
  normalizeHue,
  oklabCoordinatePlanePoint,
  represent,
  type ColorResult,
  type ColorValue,
  type DisplayGamut,
  type PlaneEditError,
  type PlaneEditReference,
  type PickerPlaneId,
} from "@gamut-plane/core";
import { computed, ref, useId, watch } from "vue";
import { gpPart, editorUi, currentViewOptions, representationUi } from "@gamut-plane/ui";
import NumericInput from "./NumericInput.vue";
import { legacyViewState, resolveAcceptedRevision } from "../model/acceptedResolution.js";
import { presentAcceptedRevision } from "../model/acceptedPresentation.js";
import { currentView } from "../model/currentView.js";

import ColorChannelControl from "./ColorChannelControl.vue";
import ColorPlane from "./ColorPlane.vue";
import type { CanvasColorSpaceStatus } from "@gamut-plane/render";
import {
  currentField,
  currentExactChecks,
  currentOklchObservation,
  currentEditableDetail,
  currentGuideDisplay,
  legacyTargetCompatibility,
} from "@gamut-plane/render/internal/current";

const props = withDefaults(
  defineProps<{
    modelValue: ColorValue;
    boundaryTarget?: DisplayGamut;
    showSrgbBoundary?: boolean;
    showDisplayP3Boundary?: boolean;
  }>(),
  {
    boundaryTarget: "srgb",
    showSrgbBoundary: true,
    showDisplayP3Boundary: true,
  },
);

const emit = defineEmits<{
  "update:modelValue": [color: ColorValue];
  commit: [color: ColorValue];
  cancel: [];
  capability: [status: CanvasColorSpaceStatus];
}>();

defineSlots<{ "field-legend"(): unknown }>();

const plane = defineModel<PickerPlaneId>("plane", { default: "oklch" });
const instanceId = useId();
const titleId = `${instanceId}-instrument-title`;

const [hue, lightness, chroma] = editorUi["oklch-lc"].companions;
const [fixedLightness, a, b] = editorUi["oklab-ab"].companions;
const planeOptionButtons = new Map<PickerPlaneId, HTMLButtonElement>();
const revision = computed(() =>
  resolveAcceptedRevision(
    props.modelValue,
    legacyViewState(plane.value, props.showSrgbBoundary, props.showDisplayP3Boundary),
  ),
);
const accepted = computed(() => presentAcceptedRevision(revision.value));
const view = computed(() => currentView(accepted.value.selection));
const field = computed(() => currentField(view.value, accepted.value.editor, accepted.value.field));
const oklch = computed(() =>
  currentOklchObservation(
    revision.value.source,
    accepted.value.observation,
    "Selected hue cannot be observed",
  ),
);
const checks = computed(() => currentExactChecks(accepted.value.exactChecks));
const target = computed(() =>
  legacyTargetCompatibility(
    field.value.editorId,
    props.boundaryTarget,
    checks.value,
    accepted.value.guides,
    oklch.value,
  ),
);
const detail = computed(() => {
  const active = field.value;
  const observation = oklch.value;
  // Preserve eager current-product failure order before any visual serialization.
  void checks.value;
  void target.value;
  return currentEditableDetail(active, observation);
});
const guides = computed(() => currentGuideDisplay(accepted.value.guides));
const warningVisible = computed(() => checks.value.displayP3.status === "outside");
const y = computed(() =>
  field.value.projection.plane === "oklch"
    ? field.value.projection.representation.channels[0]
    : field.value.projection.representation.channels[2],
);
const primaryGamutWarning = "Outside Display P3";
const hueRangeDragging = ref(false);
const hueReference = ref<PlaneEditReference>();
watch(
  [() => props.modelValue, () => revision.value.contextKey],
  () => {
    const hue = oklch.value.channels[2];
    if (hue !== null) hueReference.value = { hue };
    else hueReference.value = undefined;
  },
  { immediate: true, flush: "sync" },
);
const fixedAxisFieldPreview = computed(() => view.value === "oklch" && hueRangeDragging.value);

function selectPlane(value: PickerPlaneId): void {
  plane.value = value;
}

function setPlaneOptionButton(value: PickerPlaneId, element: unknown): void {
  if (element instanceof HTMLButtonElement) planeOptionButtons.set(value, element);
  else planeOptionButtons.delete(value);
}

function movePlaneSelection(value: PickerPlaneId, event: KeyboardEvent): void {
  let direction: -1 | 1;
  if (event.key === "ArrowLeft" || event.key === "ArrowUp") direction = -1;
  else if (event.key === "ArrowRight" || event.key === "ArrowDown") direction = 1;
  else return;

  event.preventDefault();
  const currentIndex = currentViewOptions.indexOf(value);
  const nextIndex =
    (currentIndex + direction + currentViewOptions.length) % currentViewOptions.length;
  const next = currentViewOptions[nextIndex];
  if (!next) return;
  selectPlane(next);
  planeOptionButtons.get(next)?.focus();
}

function publish(result: ColorResult<ColorValue, PlaneEditError>, complete: boolean): void {
  if (!result.ok) return;
  const observed = represent(result.value, "oklch");
  if (observed.ok && observed.value.channels[2] !== null)
    hueReference.value = { hue: observed.value.channels[2] };
  if (complete) emit("commit", result.value);
  else emit("update:modelValue", result.value);
}

function editOklch(channel: "l" | "c" | "h", value: number, complete: boolean): void {
  publish(
    authorPlaneEdit(revision.value.source, {
      plane: "oklch",
      kind: "channels",
      channels: { [channel]: channel === "h" ? normalizeHue(value) : value },
      ...(channel !== "h" && hueReference.value ? { reference: hueReference.value } : {}),
    }),
    complete,
  );
}

function requireOklabProjection() {
  const projection = field.value.projection;
  if (projection.plane !== "oklab")
    throw new Error("OKLab coordinate edit requires the accepted OKLab field");
  return projection;
}

function editOklab(channel: "l" | "a" | "b", value: number, complete: boolean): void {
  const edit =
    channel === "l"
      ? { plane: "oklab" as const, kind: "channels" as const, channels: { l: value } }
      : {
          plane: "oklab" as const,
          kind: "point" as const,
          point: oklabCoordinatePlanePoint(requireOklabProjection(), channel, value),
        };
  publish(authorPlaneEdit(revision.value.source, edit), complete);
}

watch(
  () => revision.value.contextKey,
  () => {
    hueRangeDragging.value = false;
  },
);
</script>

<template>
  <section
    class="plane-instrument"
    data-gp-root
    :data-gp-view="view"
    data-plane-instrument
    :data-active-plane="view"
    :style="{ '--picker-active': detail.activeCss }"
    :aria-labelledby="titleId"
  >
    <h2 :id="titleId" class="sr-only" data-gp-visually-hidden>Color plane instrument</h2>

    <div class="plane-instrument__view-control" :data-gp-part="gpPart.viewControl">
      <div role="radiogroup" aria-label="Coordinate view" aria-orientation="horizontal">
        <button
          v-for="option in currentViewOptions"
          :key="option"
          :ref="(element) => setPlaneOptionButton(option, element)"
          type="button"
          :data-gp-part="gpPart.viewOption"
          role="radio"
          :aria-checked="view === option"
          :tabindex="view === option ? 0 : -1"
          :data-plane-option="option"
          @click="selectPlane(option)"
          @keydown="movePlaneSelection(option, $event)"
        >
          {{ representationUi[option].label }}
        </button>
      </div>
    </div>

    <div class="plane-instrument__workspace" :data-gp-part="gpPart.workspace">
      <div class="plane-instrument__field" :data-gp-part="gpPart.field">
        <ColorPlane
          :model-value="revision.source"
          :semantic-context-key="revision.contextKey"
          :field="field"
          :guides="guides"
          :marker-css="detail.markerCss"
          :edit-reference="hueReference"
          :plane="field.plane"
          :target-guide-point="target.targetGuidePoint"
          :target-guide-css="target.targetGuideCss"
          :target-guide-label="target.targetGuideLabel"
          :warning-visible="warningVisible"
          :warning-label="primaryGamutWarning"
          :interaction-preview="fixedAxisFieldPreview"
          @update:model-value="emit('update:modelValue', $event)"
          @commit="emit('commit', $event)"
          @cancel="emit('cancel')"
          @capability="emit('capability', $event)"
        />
        <slot name="field-legend" />
      </div>

      <div class="plane-instrument__controls" :data-gp-part="gpPart.controls">
        <template v-if="detail.view === 'oklch'">
          <ColorChannelControl
            :key="`${revision.contextKey}:${hue.channelId}:${hue.operationId}`"
            :id="`${instanceId}-hue`"
            :channel="hue.symbol"
            :label="hue.label"
            :model-value="field.samplingFixed"
            :min="hue.sliderRange.min"
            :max="hue.sliderRange.max"
            :step="hue.step"
            :precision="hue.precision"
            :gradient="detail.hueGradient"
            :normalize-value="normalizeHue"
            :intervals="guides.hueIntervals"
            :warning-visible="warningVisible"
            :warning-label="primaryGamutWarning"
            :warning-position="detail.huePosition"
            :help="detail.hueHelp"
            @update:model-value="editOklch('h', $event, false)"
            @commit="editOklch('h', $event, true)"
            @cancel="emit('cancel')"
            @range-interaction="hueRangeDragging = $event"
          />

          <ColorChannelControl
            :key="`${revision.contextKey}:${lightness.channelId}:${lightness.operationId}`"
            :id="`${instanceId}-lightness`"
            :channel="lightness.symbol"
            :label="lightness.label"
            :model-value="oklch.channels[0]"
            :min="lightness.sliderRange.min"
            :max="lightness.sliderRange.max"
            :step="lightness.step"
            :precision="lightness.precision"
            :gradient="detail.lightnessGradient"
            :intervals="guides.lightnessIntervals"
            :warning-visible="warningVisible"
            :warning-label="primaryGamutWarning"
            :warning-position="oklch.channels[0]"
            @update:model-value="editOklch('l', $event, false)"
            @commit="editOklch('l', $event, true)"
            @cancel="emit('cancel')"
          />

          <ColorChannelControl
            :key="`${revision.contextKey}:${chroma.channelId}:${chroma.operationId}`"
            :id="`${instanceId}-chroma`"
            :channel="chroma.symbol"
            :label="chroma.label"
            :model-value="oklch.channels[1]"
            :min="chroma.sliderRange.min"
            :max="chroma.sliderRange.max"
            :step="chroma.step"
            :precision="chroma.precision"
            :gradient="detail.chromaGradient"
            :markers="target.markers"
            :intervals="guides.chromaIntervals"
            :boundary-preview-color="target.targetResult.swatchCss"
            :boundary-preview-tone="boundaryTarget"
            :overflow-max="!('max' in chroma.numericBounds)"
            :warning-visible="warningVisible"
            :warning-label="primaryGamutWarning"
            :warning-position="detail.chromaPosition"
            :help="detail.chromaHelp"
            @update:model-value="editOklch('c', $event, false)"
            @commit="editOklch('c', $event, true)"
            @cancel="emit('cancel')"
          />
        </template>

        <template v-else>
          <ColorChannelControl
            :key="`${revision.contextKey}:${fixedLightness.channelId}:${fixedLightness.operationId}`"
            :id="`${instanceId}-oklab-lightness`"
            :channel="fixedLightness.symbol"
            :label="fixedLightness.label"
            :model-value="field.samplingFixed"
            :min="fixedLightness.sliderRange.min"
            :max="fixedLightness.sliderRange.max"
            :step="fixedLightness.step"
            :precision="fixedLightness.precision"
            :gradient="detail.fixedLightnessGradient"
            :intervals="guides.lightnessIntervals"
            :warning-visible="warningVisible"
            :warning-label="primaryGamutWarning"
            :warning-position="field.samplingFixed"
            :help="detail.domainHelp"
            @update:model-value="editOklab('l', $event, false)"
            @commit="editOklab('l', $event, true)"
            @cancel="emit('cancel')"
          />
          <div
            class="plane-instrument__coordinate-readout"
            :data-gp-part="gpPart.coordinateReadout"
            aria-label="Editable OKLab coordinates"
          >
            <span>Editable coordinate</span>
            <label>
              <span>{{ a.label }}</span>
              <NumericInput
                :key="`${revision.contextKey}:${a.channelId}:${a.operationId}`"
                :model-value="field.projection.representation.channels[1]"
                :precision="a.precision"
                :min="a.numericBounds.min"
                :max="a.numericBounds.max"
                :step="a.step"
                inputmode="decimal"
                data-oklab-coordinate="a"
                :aria-label="a.numericLabel"
                @update:model-value="editOklab('a', $event, false)"
                @commit="editOklab('a', $event, true)"
                @cancel="emit('cancel')"
              />
            </label>
            <label>
              <span>{{ b.label }}</span>
              <NumericInput
                :key="`${revision.contextKey}:${b.channelId}:${b.operationId}`"
                :model-value="y"
                :precision="b.precision"
                :min="b.numericBounds.min"
                :max="b.numericBounds.max"
                :step="b.step"
                inputmode="decimal"
                data-oklab-coordinate="b"
                :aria-label="b.numericLabel"
                @update:model-value="editOklab('b', $event, false)"
                @commit="editOklab('b', $event, true)"
                @cancel="emit('cancel')"
              />
            </label>
            <small>Disc-bounded radius ≤ 0.4000 · no RGB gamut clamp</small>
          </div>
        </template>

        <section
          class="plane-instrument__target-result"
          :data-gp-part="gpPart.targetResult"
          :data-gp-status="target.targetResult.status"
          data-boundary-target-result
          :data-boundary-target="boundaryTarget"
          :aria-label="`${target.targetResult.targetLabel} target boundary result`"
          :data-target-exact-status="target.targetResult.status"
        >
          <div class="plane-instrument__target-heading" :data-gp-part="gpPart.targetHeading">
            <span>Target · {{ target.targetResult.targetLabel }}</span>
            <span
              class="plane-instrument__target-swatch"
              :data-gp-part="gpPart.targetSwatch"
              data-boundary-guide-swatch
              :style="{ background: target.targetResult.swatchCss }"
              :aria-label="`${target.targetResult.targetLabel} sampled boundary-guide color ${target.targetResult.swatchCss}`"
              role="img"
            />
            <strong
              :data-target-status="target.targetResult.status === 'outside' ? 'outside' : 'inside'"
            >
              {{ target.targetResult.status === "outside" ? "Outside" : "Inside" }}
            </strong>
          </div>
          <dl>
            <div>
              <dt>Guide C</dt>
              <dd>{{ target.targetResult.guideChroma }}</dd>
            </div>
            <div v-if="target.targetResult.showGuideDelta">
              <dt>ΔC</dt>
              <dd>−{{ target.targetResult.guideDelta }}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  </section>
</template>
