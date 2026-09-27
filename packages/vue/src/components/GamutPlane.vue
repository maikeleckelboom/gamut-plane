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

import ColorChannelControl from "./ColorChannelControl.vue";
import ColorPlane from "./ColorPlane.vue";
import {
  createPickerPresentation,
  PICKER_GAMUT_TABLES,
  type CanvasColorSpaceStatus,
} from "@gamut-plane/render";

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
const tables = PICKER_GAMUT_TABLES;
const presentation = computed(() =>
  createPickerPresentation(props.modelValue, plane.value, props.boundaryTarget, {
    srgb: props.showSrgbBoundary,
    displayP3: props.showDisplayP3Boundary,
  }),
);
const primaryGamutWarning = "Outside Display P3";
const hueRangeDragging = ref(false);
const hueReference = ref<PlaneEditReference>();
watch(
  () => props.modelValue,
  (value) => {
    const observed = represent(value, "oklch");
    if (!observed.ok) throw new RangeError("Selected hue cannot be observed");
    const hue = observed.value.channels[2];
    if (hue !== null) hueReference.value = { hue };
    else hueReference.value = undefined;
  },
  { immediate: true, flush: "sync" },
);
const fixedAxisFieldPreview = computed(() => plane.value === "oklch" && hueRangeDragging.value);

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
    authorPlaneEdit(props.modelValue, {
      plane: "oklch",
      kind: "channels",
      channels: { [channel]: channel === "h" ? normalizeHue(value) : value },
      ...(channel !== "h" && hueReference.value ? { reference: hueReference.value } : {}),
    }),
    complete,
  );
}

function editOklab(channel: "l" | "a" | "b", value: number, complete: boolean): void {
  const edit =
    channel === "l"
      ? { plane: "oklab" as const, kind: "channels" as const, channels: { l: value } }
      : {
          plane: "oklab" as const,
          kind: "point" as const,
          point: oklabCoordinatePlanePoint(presentation.value.oklab, channel, value),
        };
  publish(authorPlaneEdit(props.modelValue, edit), complete);
}

watch(
  () => plane.value,
  () => {
    hueRangeDragging.value = false;
  },
);
</script>

<template>
  <section
    class="plane-instrument"
    data-gp-root
    :data-gp-view="plane"
    data-plane-instrument
    :data-active-plane="plane"
    :style="{ '--picker-active': presentation.activeCss }"
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
          :aria-checked="plane === option"
          :tabindex="plane === option ? 0 : -1"
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
          :model-value="modelValue"
          :field-hue="presentation.fieldHue"
          :marker-css="presentation.markerCss"
          :edit-reference="hueReference"
          :plane="presentation.plane"
          :srgb-table="tables.srgb"
          :display-p3-table="tables.displayP3"
          :target-guide-point="presentation.targetGuidePoint"
          :target-guide-css="presentation.targetGuideCss"
          :target-guide-label="presentation.targetGuideLabel"
          :warning-visible="presentation.warningVisible"
          :warning-label="primaryGamutWarning"
          :interaction-preview="fixedAxisFieldPreview"
          :show-srgb-boundary="showSrgbBoundary"
          :show-display-p3-boundary="showDisplayP3Boundary"
          @update:model-value="emit('update:modelValue', $event)"
          @commit="emit('commit', $event)"
          @cancel="emit('cancel')"
          @capability="emit('capability', $event)"
        />
        <slot name="field-legend" />
      </div>

      <div class="plane-instrument__controls" :data-gp-part="gpPart.controls">
        <template v-if="plane === 'oklch'">
          <ColorChannelControl
            :key="`${hue.channelId}:${hue.operationId}`"
            :id="`${instanceId}-hue`"
            :channel="hue.symbol"
            :label="hue.label"
            :model-value="presentation.fieldHue"
            :min="hue.sliderRange.min"
            :max="hue.sliderRange.max"
            :step="hue.step"
            :precision="hue.precision"
            :gradient="presentation.hueGradient"
            :normalize-value="normalizeHue"
            :intervals="presentation.hueIntervals"
            :warning-visible="presentation.warningVisible"
            :warning-label="primaryGamutWarning"
            :warning-position="presentation.huePosition"
            :help="presentation.hueHelp"
            @update:model-value="editOklch('h', $event, false)"
            @commit="editOklch('h', $event, true)"
            @cancel="emit('cancel')"
            @range-interaction="hueRangeDragging = $event"
          />

          <ColorChannelControl
            :key="`${lightness.channelId}:${lightness.operationId}`"
            :id="`${instanceId}-lightness`"
            :channel="lightness.symbol"
            :label="lightness.label"
            :model-value="presentation.oklch.channels[0]"
            :min="lightness.sliderRange.min"
            :max="lightness.sliderRange.max"
            :step="lightness.step"
            :precision="lightness.precision"
            :gradient="presentation.lightnessGradient"
            :intervals="presentation.lightnessIntervals"
            :warning-visible="presentation.warningVisible"
            :warning-label="primaryGamutWarning"
            :warning-position="presentation.oklch.channels[0]"
            @update:model-value="editOklch('l', $event, false)"
            @commit="editOklch('l', $event, true)"
            @cancel="emit('cancel')"
          />

          <ColorChannelControl
            :key="`${chroma.channelId}:${chroma.operationId}`"
            :id="`${instanceId}-chroma`"
            :channel="chroma.symbol"
            :label="chroma.label"
            :model-value="presentation.oklch.channels[1]"
            :min="chroma.sliderRange.min"
            :max="chroma.sliderRange.max"
            :step="chroma.step"
            :precision="chroma.precision"
            :gradient="presentation.chromaGradient"
            :markers="presentation.markers"
            :intervals="presentation.chromaIntervals"
            :boundary-preview-color="presentation.targetResult.swatchCss"
            :boundary-preview-tone="boundaryTarget"
            :overflow-max="!('max' in chroma.numericBounds)"
            :warning-visible="presentation.warningVisible"
            :warning-label="primaryGamutWarning"
            :warning-position="presentation.chromaPosition"
            :help="presentation.chromaHelp"
            @update:model-value="editOklch('c', $event, false)"
            @commit="editOklch('c', $event, true)"
            @cancel="emit('cancel')"
          />
        </template>

        <template v-else>
          <ColorChannelControl
            :key="`${fixedLightness.channelId}:${fixedLightness.operationId}`"
            :id="`${instanceId}-oklab-lightness`"
            :channel="fixedLightness.symbol"
            :label="fixedLightness.label"
            :model-value="presentation.projection.fixed"
            :min="fixedLightness.sliderRange.min"
            :max="fixedLightness.sliderRange.max"
            :step="fixedLightness.step"
            :precision="fixedLightness.precision"
            :gradient="presentation.fixedLightnessGradient"
            :intervals="presentation.lightnessIntervals"
            :warning-visible="presentation.warningVisible"
            :warning-label="primaryGamutWarning"
            :warning-position="presentation.projection.fixed"
            :help="presentation.domainHelp"
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
                :key="`${a.channelId}:${a.operationId}`"
                :model-value="presentation.projection.x"
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
                :key="`${b.channelId}:${b.operationId}`"
                :model-value="presentation.projection.y"
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
          :data-gp-status="presentation.targetResult.status"
          data-boundary-target-result
          :data-boundary-target="boundaryTarget"
          :aria-label="`${presentation.targetResult.targetLabel} target boundary result`"
          :data-target-exact-status="presentation.targetResult.status"
        >
          <div class="plane-instrument__target-heading" :data-gp-part="gpPart.targetHeading">
            <span>Target · {{ presentation.targetResult.targetLabel }}</span>
            <span
              class="plane-instrument__target-swatch"
              :data-gp-part="gpPart.targetSwatch"
              data-boundary-guide-swatch
              :style="{ background: presentation.targetResult.swatchCss }"
              :aria-label="`${presentation.targetResult.targetLabel} sampled boundary-guide color ${presentation.targetResult.swatchCss}`"
              role="img"
            />
            <strong
              :data-target-status="
                presentation.targetResult.status === 'outside' ? 'outside' : 'inside'
              "
            >
              {{ presentation.targetResult.status === "outside" ? "Outside" : "Inside" }}
            </strong>
          </div>
          <dl>
            <div>
              <dt>Guide C</dt>
              <dd>{{ presentation.targetResult.guideChroma }}</dd>
            </div>
            <div v-if="presentation.targetResult.showGuideDelta">
              <dt>ΔC</dt>
              <dd>−{{ presentation.targetResult.guideDelta }}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  </section>
</template>
