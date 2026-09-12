<script setup lang="ts">
import {
  OKLAB_AB_PLANE,
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  OKLCH_PICKER_MAX_CHROMA,
  getChromaSliderMarkers,
  getHueGamutIntervals,
  getLightnessGamutIntervals,
  getPickerGamutStatus,
  normalizeHue,
  serializeColor,
  type OklchColor,
  type PickerPlaneId,
} from "@gamut-plane/core";
import { computed, ref, useId, watch } from "vue";
import NumericInput from "./NumericInput.vue";
import "../style.css";

import ColorChannelControl, {
  type LinearControlInterval,
  type LinearControlMarker,
} from "./ColorChannelControl.vue";
import ColorPlane from "./ColorPlane.vue";
import { PICKER_GAMUT_TABLES, type CanvasColorSpaceStatus } from "@gamut-plane/rendering";

const props = withDefaults(
  defineProps<{
    modelValue: OklchColor;
    showSrgbBoundary?: boolean;
    showDisplayP3Boundary?: boolean;
  }>(),
  {
    showSrgbBoundary: true,
    showDisplayP3Boundary: true,
  },
);

const emit = defineEmits<{
  "update:modelValue": [color: OklchColor];
  commit: [color: OklchColor];
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
const planeProjection = computed(() => activePlaneContract.value.project(props.modelValue));
const status = computed(() => getPickerGamutStatus(props.modelValue, tables));
const chromaMarkers = computed(() =>
  getChromaSliderMarkers(props.modelValue, tables, status.value),
);

const hueIntervals = computed<LinearControlInterval[]>(() => [
  ...getHueGamutIntervals(tables.displayP3, props.modelValue).map((interval) => ({
    ...interval,
    tone: "display-p3" as const,
  })),
  ...getHueGamutIntervals(tables.srgb, props.modelValue).map((interval) => ({
    ...interval,
    tone: "srgb" as const,
  })),
]);

const lightnessIntervals = computed<LinearControlInterval[]>(() => [
  ...getLightnessGamutIntervals(tables.displayP3, props.modelValue).map((interval) => ({
    ...interval,
    tone: "display-p3" as const,
  })),
  ...getLightnessGamutIntervals(tables.srgb, props.modelValue).map((interval) => ({
    ...interval,
    tone: "srgb" as const,
  })),
]);

const chromaControlMarkers = computed<LinearControlMarker[]>(() => {
  const markers: LinearControlMarker[] = [
    {
      id: "display-p3-boundary-guide",
      label: `Display P3 table boundary guide C ${chromaMarkers.value.displayP3BoundaryGuide.chroma.toFixed(4)}`,
      position: chromaMarkers.value.displayP3BoundaryGuide.position,
      tone: "display-p3",
    },
    {
      id: "srgb-boundary-guide",
      label: `sRGB table boundary guide C ${chromaMarkers.value.srgbBoundaryGuide.chroma.toFixed(4)}`,
      position: chromaMarkers.value.srgbBoundaryGuide.position,
      tone: "srgb",
    },
  ];
  const projection = chromaMarkers.value.srgbBoundaryProjection;
  if (projection) {
    markers.push({
      id: "srgb-boundary-projection",
      label: `sRGB boundary projection C ${projection.chroma.toFixed(4)}`,
      position: projection.position,
      tone: "projection",
      cssColor: boundaryProjectionCss.value,
    });
  }
  return markers;
});

const chromaIntervals = computed<LinearControlInterval[]>(() => [
  {
    start: 0,
    end: chromaMarkers.value.displayP3BoundaryGuide.position,
    tone: "display-p3",
  },
  {
    start: 0,
    end: chromaMarkers.value.srgbBoundaryGuide.position,
    tone: "srgb",
  },
]);

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
    c: props.modelValue.c,
    h: props.modelValue.h,
    alpha: 1,
  })),
);
const chromaGradient = computed(() =>
  colorGradient(12, (position) => ({
    l: props.modelValue.l,
    c: position * OKLCH_PICKER_MAX_CHROMA,
    h: props.modelValue.h,
    alpha: 1,
  })),
);
const oklabLightnessGradient = computed(() =>
  colorGradient(12, (position) => OKLAB_AB_PLANE.editFixedAxis(props.modelValue, position)),
);

const activeCss = computed(() => serializeColor(props.modelValue));
const isOutsideDisplayP3 = computed(() => !status.value.displayP3.inGamut);
const primaryGamutWarning = "Outside Display P3";
const hueWarningPosition = computed(() => normalizeHue(props.modelValue.h) / 360);
const chromaWarningPosition = computed(() => chromaMarkers.value.active.position);
const srgbBoundaryProjectionColor = computed(() =>
  status.value.srgb.inGamut
    ? null
    : {
        l: props.modelValue.l,
        c: Math.min(props.modelValue.c, status.value.srgb.interpolatedMaximumChroma),
        h: props.modelValue.h,
        alpha: props.modelValue.alpha,
      },
);
const boundaryProjectionCss = computed(() =>
  srgbBoundaryProjectionColor.value ? serializeColor(srgbBoundaryProjectionColor.value) : "",
);
const instrumentStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = { "--picker-active": activeCss.value };
  if (boundaryProjectionCss.value) style["--picker-projection"] = boundaryProjectionCss.value;
  return style;
});
const boundaryProjectionChroma = computed(
  () => chromaMarkers.value.srgbBoundaryProjection?.chroma ?? null,
);
const hueRangeDragging = ref(false);
const fixedAxisFieldPreview = computed(() => plane.value === "oklch" && hueRangeDragging.value);
const controlHelp = computed(() =>
  plane.value === "oklab"
    ? "Lightness fixes this plane. The disc is an instrument limit, not a gamut boundary."
    : "Hue fixes this plane. The guides show sampled gamut limits; your color can cross them.",
);
const chromaHelp = computed(() =>
  props.modelValue.c > OKLCH_PICKER_MAX_CHROMA
    ? `Chroma ${props.modelValue.c.toFixed(4)} exceeds the 0.4000 view. Use the numeric field to edit beyond the slider.`
    : undefined,
);
const oklabDomainHelp = computed(() =>
  props.modelValue.c > OKLCH_PICKER_MAX_CHROMA
    ? `Chroma ${props.modelValue.c.toFixed(4)} exceeds the 0.4000 a/b view. The marker sits at the edge; your color is unchanged.`
    : undefined,
);

function colorGradient(segments: number, colorAt: (position: number) => OklchColor): string {
  const stops: string[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const position = index / segments;
    stops.push(`${serializeColor(colorAt(position))} ${(position * 100).toFixed(3)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

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

function oklabLightnessColor(value: number): OklchColor {
  return OKLAB_AB_PLANE.editFixedAxis(props.modelValue, value);
}

function updateOklabLightness(value: number): void {
  emit("update:modelValue", oklabLightnessColor(value));
}

function commitOklabLightness(value: number): void {
  emit("commit", oklabLightnessColor(value));
}

type OklabCoordinate = "a" | "b";

function clampAxisValue(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function oklabCoordinateColor(coordinate: OklabCoordinate, value: number): OklchColor | null {
  if (!Number.isFinite(value)) return null;

  const contract = activePlaneContract.value;
  const projection = planeProjection.value;
  const a = clampAxisValue(
    coordinate === "a" ? value : projection.x,
    contract.xAxis.min,
    contract.xAxis.max,
  );
  const b = clampAxisValue(
    coordinate === "b" ? value : projection.y,
    contract.yAxis.min,
    contract.yAxis.max,
  );
  const point = {
    x: (a - contract.xAxis.min) / (contract.xAxis.max - contract.xAxis.min),
    y: 1 - (b - contract.yAxis.min) / (contract.yAxis.max - contract.yAxis.min),
  };

  return contract.unproject(point, projection.fixed, props.modelValue);
}

function updateOklabCoordinate(coordinate: OklabCoordinate, value: number): void {
  const color = oklabCoordinateColor(coordinate, value);
  if (color) emit("update:modelValue", color);
}

function commitOklabCoordinate(coordinate: OklabCoordinate, value: number): void {
  const color = oklabCoordinateColor(coordinate, value);
  if (color) emit("commit", color);
}

function channelColor(channel: "l" | "c" | "h", value: number): OklchColor {
  const color: OklchColor = {
    l: props.modelValue.l,
    c: props.modelValue.c,
    h: props.modelValue.h,
    alpha: props.modelValue.alpha,
  };
  if (channel === "l") color.l = value;
  else if (channel === "c") color.c = value;
  else color.h = normalizeHue(value);
  return color;
}

function updateChannel(channel: "l" | "c" | "h", value: number): void {
  emit("update:modelValue", channelColor(channel, value));
}

function commitChannel(channel: "l" | "c" | "h", value: number): void {
  emit("commit", channelColor(channel, value));
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
      <span>Coordinate view</span>
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
      <small>Same color, different coordinates.</small>
    </div>

    <div class="plane-instrument__workspace">
      <div class="plane-instrument__field">
        <ColorPlane
          :model-value="modelValue"
          :plane="activePlaneContract"
          :srgb-table="tables.srgb"
          :display-p3-table="tables.displayP3"
          :srgb-boundary-guide-color="srgbBoundaryProjectionColor"
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
        <p class="plane-instrument__control-help">{{ controlHelp }}</p>
        <template v-if="plane === 'oklch'">
          <ColorChannelControl
            :id="`${instanceId}-hue`"
            channel="H"
            label="Hue"
            :model-value="modelValue.h"
            :min="0"
            :max="360"
            :step="0.1"
            :precision="1"
            :gradient="hueGradient"
            :intervals="hueIntervals"
            :warning-visible="isOutsideDisplayP3"
            :warning-label="primaryGamutWarning"
            :warning-position="hueWarningPosition"
            @update:model-value="updateChannel('h', $event)"
            @commit="commitChannel('h', $event)"
            @cancel="emit('cancel')"
            @range-interaction="hueRangeDragging = $event"
          />

          <ColorChannelControl
            :id="`${instanceId}-lightness`"
            channel="L"
            label="Lightness"
            :model-value="modelValue.l"
            :min="0"
            :max="1"
            :step="0.001"
            :precision="4"
            :gradient="lightnessGradient"
            :intervals="lightnessIntervals"
            :warning-visible="isOutsideDisplayP3"
            :warning-label="primaryGamutWarning"
            :warning-position="modelValue.l"
            @update:model-value="updateChannel('l', $event)"
            @commit="commitChannel('l', $event)"
            @cancel="emit('cancel')"
          />

          <ColorChannelControl
            :id="`${instanceId}-chroma`"
            channel="C"
            label="Chroma"
            :model-value="modelValue.c"
            :min="0"
            :max="OKLCH_PICKER_MAX_CHROMA"
            :step="0.001"
            :precision="4"
            :gradient="chromaGradient"
            :markers="chromaControlMarkers"
            :intervals="chromaIntervals"
            :overflow-max="true"
            :warning-visible="isOutsideDisplayP3"
            :warning-label="primaryGamutWarning"
            :warning-position="chromaWarningPosition"
            :help="chromaHelp"
            @update:model-value="updateChannel('c', $event)"
            @commit="commitChannel('c', $event)"
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
            @update:model-value="updateOklabLightness"
            @commit="commitOklabLightness"
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
                @update:model-value="updateOklabCoordinate('a', $event)"
                @commit="commitOklabCoordinate('a', $event)"
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
                @update:model-value="updateOklabCoordinate('b', $event)"
                @commit="commitOklabCoordinate('b', $event)"
                @cancel="emit('cancel')"
              />
            </label>
            <small>Disc-bounded radius ≤ 0.4000 · no RGB gamut clamp</small>
          </div>
        </template>

        <details class="plane-instrument__evidence" data-boundary-details>
          <summary>
            <span>Boundary details</span>
            <small>Table guides / projection</small>
          </summary>
          <div class="plane-instrument__evidence-body">
            <p class="plane-instrument__legend-note">
              <template v-if="plane === 'oklch'">
                The guides follow the fixed hue. Your color can cross either guide without reducing
                its chroma.
              </template>
              <template v-else>
                The contours show sampled gamut limits at this lightness. Your color can cross
                either guide.
              </template>
            </p>

            <div class="plane-instrument__readouts" aria-label="Boundary guide details">
              <div data-boundary-guide="display-p3">
                <span>Display P3 table guide</span>
                <code> C {{ status.displayP3.interpolatedMaximumChroma.toFixed(4) }} </code>
              </div>
              <div data-boundary-guide="srgb">
                <span>sRGB table guide</span>
                <code> C {{ status.srgb.interpolatedMaximumChroma.toFixed(4) }} </code>
              </div>
              <div class="plane-instrument__active-readout">
                <span>Selected color</span>
                <code v-if="plane === 'oklab'">
                  OKLCH C {{ modelValue.c.toFixed(4) }} · H {{ modelValue.h.toFixed(2) }}°
                </code>
                <code v-else>C {{ modelValue.c.toFixed(4) }}</code>
              </div>
              <div class="plane-instrument__projection-readout">
                <span>sRGB boundary projection</span>
                <code
                  v-if="boundaryProjectionChroma !== null && status.srgb.interpolatedDeltaC > 0"
                >
                  table C {{ boundaryProjectionChroma.toFixed(4) }} · ΔC guide −{{
                    status.srgb.interpolatedDeltaC.toFixed(4)
                  }}
                </code>
                <code v-else-if="boundaryProjectionChroma !== null">
                  exact outside · boundary projection overlaps active
                </code>
                <code v-else>not required</code>
              </div>
            </div>
            <p class="plane-instrument__method">
              <template v-if="plane === 'oklab'">
                Contours and the boundary projection are sampled guides, not exact gamut tests. The
                circular editing limit is separate from both display gamuts.
              </template>
              <template v-else>
                Contours, channel marks and the boundary projection are sampled guides. Gamut
                membership and CSS output use direct color conversion.
              </template>
            </p>
          </div>
        </details>
      </div>
    </div>
  </section>
</template>
