<script setup lang="ts">
import {
  OKLCH_PICKER_MAX_CHROMA,
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
import { gpPart } from "@gamut-plane/ui";
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

const PLANE_OPTIONS: readonly PickerPlaneId[] = ["oklch", "oklab"];
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
  const currentIndex = PLANE_OPTIONS.indexOf(value);
  const nextIndex = (currentIndex + direction + PLANE_OPTIONS.length) % PLANE_OPTIONS.length;
  const next = PLANE_OPTIONS[nextIndex];
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
          v-for="option in PLANE_OPTIONS"
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
          {{ option === "oklab" ? "OKLab" : "OKLCH" }}
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
            :id="`${instanceId}-hue`"
            channel="H"
            label="Hue"
            :model-value="presentation.fieldHue"
            :min="0"
            :max="360"
            :step="0.1"
            :precision="1"
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
            :id="`${instanceId}-lightness`"
            channel="L"
            label="Lightness"
            :model-value="presentation.oklch.channels[0]"
            :min="0"
            :max="1"
            :step="0.001"
            :precision="4"
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
            :id="`${instanceId}-chroma`"
            channel="C"
            label="Chroma"
            :model-value="presentation.oklch.channels[1]"
            :min="0"
            :max="OKLCH_PICKER_MAX_CHROMA"
            :step="0.001"
            :precision="4"
            :gradient="presentation.chromaGradient"
            :markers="presentation.markers"
            :intervals="presentation.chromaIntervals"
            :boundary-preview-color="presentation.targetResult.swatchCss"
            :boundary-preview-tone="boundaryTarget"
            :overflow-max="true"
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
            :id="`${instanceId}-oklab-lightness`"
            channel="L"
            label="OKLab lightness · fixed axis"
            :model-value="presentation.projection.fixed"
            :min="0"
            :max="1"
            :step="0.001"
            :precision="4"
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
              <span>a</span>
              <NumericInput
                :model-value="presentation.projection.x"
                :precision="4"
                :min="presentation.plane.xAxis.min"
                :max="presentation.plane.xAxis.max"
                :step="0.001"
                inputmode="decimal"
                data-oklab-coordinate="a"
                aria-label="OKLab a numeric value"
                @update:model-value="editOklab('a', $event, false)"
                @commit="editOklab('a', $event, true)"
                @cancel="emit('cancel')"
              />
            </label>
            <label>
              <span>b</span>
              <NumericInput
                :model-value="presentation.projection.y"
                :precision="4"
                :min="presentation.plane.yAxis.min"
                :max="presentation.plane.yAxis.max"
                :step="0.001"
                inputmode="decimal"
                data-oklab-coordinate="b"
                aria-label="OKLab b numeric value"
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
