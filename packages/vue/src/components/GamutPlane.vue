<script setup lang="ts">
import {
  OKLAB_AB_PLANE,
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  OKLCH_PICKER_MAX_CHROMA,
  authorPlaneEdit,
  normalizeHue,
  oklabCoordinatePlanePoint,
  projectColorToPlane,
  represent,
  serializeColor,
  type ColorResult,
  type ColorValue,
  type DisplayGamut,
  type PlaneEditError,
  type PlaneEditReference,
  type PickerPlaneId,
} from "@gamut-plane/core";
import { computed, ref, useId, watch } from "vue";
import NumericInput from "./NumericInput.vue";
import "../style.css";

import ColorChannelControl from "./ColorChannelControl.vue";
import ColorPlane from "./ColorPlane.vue";
import {
  colorGradient,
  displayGamutLabel,
  getBoundaryPresentation,
  observePickerPresentationColor,
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
const activePlaneContract = computed(() =>
  plane.value === "oklab" ? OKLAB_AB_PLANE : OKLCH_LIGHTNESS_CHROMA_PLANE,
);
const presentationColor = computed(() => observePickerPresentationColor(props.modelValue));
const oklchProjection = computed(() => {
  const projected = projectColorToPlane(props.modelValue, "oklch");
  if (!projected.ok) throw new RangeError("Selected color cannot be projected into OKLCH");
  return projected.value;
});
const oklabProjection = computed(() => {
  const projected = projectColorToPlane(props.modelValue, "oklab");
  if (!projected.ok) throw new RangeError("Selected color cannot be projected into OKLab");
  return projected.value;
});
const planeProjection = computed(() =>
  plane.value === "oklch"
    ? {
        point: oklchProjection.value.point,
        x: oklchProjection.value.representation.channels[1],
        y: oklchProjection.value.representation.channels[0],
        fixed: presentationColor.value.h,
      }
    : {
        point: oklabProjection.value.point,
        x: oklabProjection.value.representation.channels[1],
        y: oklabProjection.value.representation.channels[2],
        fixed: oklabProjection.value.representation.channels[0],
      },
);
const boundary = computed(() =>
  getBoundaryPresentation(presentationColor.value, plane.value, props.boundaryTarget, {
    srgb: props.showSrgbBoundary,
    displayP3: props.showDisplayP3Boundary,
  }),
);
const status = computed(() => boundary.value.analysis.status);
const targetResult = computed(() => boundary.value.analysis.target);
const targetLabel = computed(() => displayGamutLabel(props.boundaryTarget));
const hueIntervals = computed(() => boundary.value.hueIntervals);
const lightnessIntervals = computed(() => boundary.value.lightnessIntervals);
const chromaControlMarkers = computed(() => boundary.value.markers);
const chromaIntervals = computed(() => boundary.value.chromaIntervals);

const hueGradient = computed(() =>
  colorGradient(72, (position) => ({
    l: 0.8,
    c: OKLCH_PICKER_MAX_CHROMA,
    h: position * 360,
    alpha: 1,
  })),
);
const lightnessGradient = computed(() =>
  colorGradient(12, (position) => ({
    l: position,
    c: presentationColor.value.c,
    h: presentationColor.value.h,
    alpha: 1,
  })),
);
const chromaGradient = computed(() =>
  colorGradient(12, (position) => ({
    l: presentationColor.value.l,
    c: position * OKLCH_PICKER_MAX_CHROMA,
    h: presentationColor.value.h,
    alpha: 1,
  })),
);
const oklabLightnessGradient = computed(() =>
  colorGradient(12, (position) => OKLAB_AB_PLANE.editFixedAxis(presentationColor.value, position)),
);

const activeCss = computed(() => serializeColor(presentationColor.value));
const isOutsideDisplayP3 = computed(() => !status.value.displayP3.inGamut);
const primaryGamutWarning = "Outside Display P3";
const hueWarningPosition = computed(() => normalizeHue(presentationColor.value.h) / 360);
const chromaWarningPosition = computed(() =>
  Math.min(1, Math.max(0, presentationColor.value.c / OKLCH_PICKER_MAX_CHROMA)),
);
const boundaryProjectionColor = computed(() => boundary.value.projectionColor);
const instrumentStyle = computed<Record<string, string>>(() => ({
  "--picker-active": activeCss.value,
}));
const boundaryGuideCss = computed(() => serializeColor(targetResult.value.boundaryGuide.color));
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
const isOutsideOklchInstrumentDomain = computed(() => {
  return !OKLCH_LIGHTNESS_CHROMA_PLANE.isPointInInstrumentDomain(oklchProjection.value.point);
});
const isOutsideOklabInstrumentDomain = computed(() => {
  return !OKLAB_AB_PLANE.isPointInInstrumentDomain(oklabProjection.value.point);
});
const chromaHelp = computed(() =>
  isOutsideOklchInstrumentDomain.value
    ? "Selected chroma is outside the visible editing range. Use the numeric field to edit the full value."
    : undefined,
);
const oklabDomainHelp = computed(() =>
  isOutsideOklabInstrumentDomain.value
    ? "Selected color is outside the OKLab editing disc. The marker is shown at the edge; the color is preserved."
    : undefined,
);

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
          point: oklabCoordinatePlanePoint(oklabProjection.value, channel, value),
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
    data-plane-instrument
    :data-active-plane="plane"
    :style="instrumentStyle"
    :aria-labelledby="titleId"
  >
    <h2 :id="titleId" class="sr-only">Color plane instrument</h2>

    <div class="plane-instrument__view-control">
      <div role="radiogroup" aria-label="Coordinate view" aria-orientation="horizontal">
        <button
          v-for="option in PLANE_OPTIONS"
          :key="option"
          :ref="(element) => setPlaneOptionButton(option, element)"
          type="button"
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

    <div class="plane-instrument__workspace">
      <div class="plane-instrument__field">
        <ColorPlane
          :model-value="modelValue"
          :presentation-color="presentationColor"
          :edit-reference="hueReference"
          :plane="activePlaneContract"
          :srgb-table="tables.srgb"
          :display-p3-table="tables.displayP3"
          :boundary-projection-color="boundaryProjectionColor"
          :boundary-projection-label="`${targetLabel} target boundary projection`"
          :warning-visible="isOutsideDisplayP3"
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

      <div class="plane-instrument__controls">
        <template v-if="plane === 'oklch'">
          <ColorChannelControl
            :id="`${instanceId}-hue`"
            channel="H"
            label="Hue"
            :model-value="presentationColor.h"
            :min="0"
            :max="360"
            :step="0.1"
            :precision="1"
            :gradient="hueGradient"
            :intervals="hueIntervals"
            :warning-visible="isOutsideDisplayP3"
            :warning-label="primaryGamutWarning"
            :warning-position="hueWarningPosition"
            :help="
              oklchProjection.representation.channels[2] === null
                ? 'Hue is unset. Edit Hue to choose a direction.'
                : undefined
            "
            @update:model-value="editOklch('h', $event, false)"
            @commit="editOklch('h', $event, true)"
            @cancel="emit('cancel')"
            @range-interaction="hueRangeDragging = $event"
          />

          <ColorChannelControl
            :id="`${instanceId}-lightness`"
            channel="L"
            label="Lightness"
            :model-value="oklchProjection.representation.channels[0]"
            :min="0"
            :max="1"
            :step="0.001"
            :precision="4"
            :gradient="lightnessGradient"
            :intervals="lightnessIntervals"
            :warning-visible="isOutsideDisplayP3"
            :warning-label="primaryGamutWarning"
            :warning-position="oklchProjection.representation.channels[0]"
            @update:model-value="editOklch('l', $event, false)"
            @commit="editOklch('l', $event, true)"
            @cancel="emit('cancel')"
          />

          <ColorChannelControl
            :id="`${instanceId}-chroma`"
            channel="C"
            label="Chroma"
            :model-value="oklchProjection.representation.channels[1]"
            :min="0"
            :max="OKLCH_PICKER_MAX_CHROMA"
            :step="0.001"
            :precision="4"
            :gradient="chromaGradient"
            :markers="chromaControlMarkers"
            :intervals="chromaIntervals"
            :boundary-preview-color="boundaryGuideCss"
            :boundary-preview-tone="boundaryTarget"
            :overflow-max="true"
            :warning-visible="isOutsideDisplayP3"
            :warning-label="primaryGamutWarning"
            :warning-position="chromaWarningPosition"
            :help="
              oklchProjection.representation.channels[2] === null
                ? 'Set Hue before increasing chroma.'
                : chromaHelp
            "
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
            :model-value="planeProjection.fixed"
            :min="0"
            :max="1"
            :step="0.001"
            :precision="4"
            :gradient="oklabLightnessGradient"
            :intervals="lightnessIntervals"
            :warning-visible="isOutsideDisplayP3"
            :warning-label="primaryGamutWarning"
            :warning-position="planeProjection.fixed"
            :help="oklabDomainHelp"
            @update:model-value="editOklab('l', $event, false)"
            @commit="editOklab('l', $event, true)"
            @cancel="emit('cancel')"
          />
          <div class="plane-instrument__coordinate-readout" aria-label="Editable OKLab coordinates">
            <span>Editable coordinate</span>
            <label>
              <span>a</span>
              <NumericInput
                :model-value="planeProjection.x"
                :precision="4"
                :min="activePlaneContract.xAxis.min"
                :max="activePlaneContract.xAxis.max"
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
                :model-value="planeProjection.y"
                :precision="4"
                :min="activePlaneContract.yAxis.min"
                :max="activePlaneContract.yAxis.max"
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
          data-boundary-target-result
          :data-boundary-target="boundaryTarget"
          :aria-label="`${targetLabel} target boundary result`"
        >
          <div class="plane-instrument__target-heading">
            <span>Target · {{ targetLabel }}</span>
            <span
              class="plane-instrument__target-swatch"
              data-boundary-guide-swatch
              :style="{ background: boundaryGuideCss }"
              :aria-label="`${targetLabel} sampled boundary-guide color ${boundaryGuideCss}`"
              role="img"
            />
            <strong :data-target-status="targetResult.inGamut ? 'inside' : 'outside'">
              {{ targetResult.inGamut ? "Inside" : "Outside" }}
            </strong>
          </div>
          <dl>
            <div>
              <dt>Guide C</dt>
              <dd>{{ targetResult.boundaryGuide.chroma.toFixed(4) }}</dd>
            </div>
            <div v-if="targetResult.guideDeltaC > 0">
              <dt>ΔC</dt>
              <dd>−{{ targetResult.guideDeltaC.toFixed(4) }}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  </section>
</template>
