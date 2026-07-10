<script setup lang="ts">
import {
  OKLAB_AB_PLANE,
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  OKLCH_PICKER_MAX_CHROMA,
  deriveFallback,
  getCachedGamutBoundaryTable,
  getChromaSliderMarkers,
  getHueGamutIntervals,
  getLightnessGamutIntervals,
  getPickerGamutStatus,
  normalizeHue,
  serializeColor,
  type ChromavertColor,
  type PickerGamutBoundaryTables,
  type PickerPlaneId,
} from "@chromavert/color";
import { computed } from "vue";

import OklchLinearControl, {
  type LinearControlInterval,
  type LinearControlMarker,
} from "@/components/chromavert/OklchLinearControl.vue";
import OklchPlanarPicker from "@/components/chromavert/OklchPlanarPicker.vue";

const props = withDefaults(
  defineProps<{
    modelValue: ChromavertColor;
    plane?: PickerPlaneId;
  }>(),
  { plane: "oklch" },
);

const emit = defineEmits<{
  "update:modelValue": [color: ChromavertColor];
  "update:plane": [plane: PickerPlaneId];
  commit: [color: ChromavertColor];
}>();

const TABLE_OPTIONS = { hueSteps: 120, lightnessSteps: 65, searchIterations: 14 } as const;
const PLANE_OPTIONS: readonly PickerPlaneId[] = ["oklch", "oklab"];
let sharedTables: PickerGamutBoundaryTables | undefined;

function getSharedPickerTables(): PickerGamutBoundaryTables {
  sharedTables ??= {
    srgb: getCachedGamutBoundaryTable("srgb", TABLE_OPTIONS),
    displayP3: getCachedGamutBoundaryTable("display-p3", TABLE_OPTIONS),
  };
  return sharedTables;
}

const tables = getSharedPickerTables();
const activePlaneContract = computed(() =>
  props.plane === "oklab" ? OKLAB_AB_PLANE : OKLCH_LIGHTNESS_CHROMA_PLANE,
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
  const fallback = chromaMarkers.value.srgbFallbackGuide;
  if (fallback) {
    markers.push({
      id: "srgb-fallback-guide",
      label: `sRGB table fallback guide C ${fallback.chroma.toFixed(4)}`,
      position: fallback.position,
      tone: "fallback",
      cssColor: fallbackCss.value,
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
const primaryGamutWarning = "Outside primary Display P3. Canonical OKLCH is preserved.";
const hueWarningPosition = computed(() => normalizeHue(props.modelValue.h) / 360);
const chromaWarningPosition = computed(() => chromaMarkers.value.active.position);
const srgbFallback = computed(() =>
  status.value.srgb.inGamut ? null : deriveFallback(props.modelValue, "srgb").fallback,
);
const fallbackCss = computed(() => (srgbFallback.value ? serializeColor(srgbFallback.value) : ""));
const instrumentStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = { "--picker-active": activeCss.value };
  if (fallbackCss.value) style["--picker-fallback"] = fallbackCss.value;
  return style;
});
const fallbackGuideChroma = computed(() => chromaMarkers.value.srgbFallbackGuide?.chroma ?? null);
const chromaHelp = computed(() =>
  props.modelValue.c > OKLCH_PICKER_MAX_CHROMA
    ? `Active C ${props.modelValue.c.toFixed(4)} exceeds the 0.4000 instrument domain. The slider thumb pins at 0.4; the numeric field preserves canonical C.`
    : "Quiet P3 and sRGB thresholds mark table-interpolated Chroma limits. Gamut output is never silently clamped.",
);
const oklabDomainHelp = computed(() =>
  props.modelValue.c > OKLCH_PICKER_MAX_CHROMA
    ? `Active radius ${props.modelValue.c.toFixed(4)} exceeds the 0.4000 OKLab a/b instrument disc. The marker projects to the radial edge; canonical OKLCH remains unchanged until an edit.`
    : "The fixed L control unprojects the current OKLab a/b coordinate. The radial instrument disc is independent of RGB gamut contours.",
);

function colorGradient(segments: number, colorAt: (position: number) => ChromavertColor): string {
  const stops: string[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const position = index / segments;
    stops.push(`${serializeColor(colorAt(position))} ${(position * 100).toFixed(3)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

function updatePlane(color: ChromavertColor): void {
  emit("update:modelValue", color);
}

function commitPlane(color: ChromavertColor): void {
  emit("commit", color);
}

function selectPlane(value: PickerPlaneId): void {
  if (value !== props.plane) emit("update:plane", value);
}

function oklabLightnessColor(value: number): ChromavertColor {
  return OKLAB_AB_PLANE.editFixedAxis(props.modelValue, value);
}

function updateOklabLightness(value: number): void {
  emit("update:modelValue", oklabLightnessColor(value));
}

function commitOklabLightness(value: number): void {
  emit("commit", oklabLightnessColor(value));
}

function channelColor(channel: "l" | "c" | "h", value: number): ChromavertColor {
  const color: ChromavertColor = {
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
</script>

<template>
  <section
    class="picker-instrument"
    data-picker-instrument
    :data-active-plane="plane"
    :style="instrumentStyle"
  >
    <header class="picker-instrument__header">
      <div>
        <p class="eyebrow">{{ plane === "oklab" ? "OKLab a/b" : "OKLCH" }} / dual gamut view</p>
        <h2>Planar picker instrument</h2>
      </div>
      <p>
        Canonical OKLCH stays editable beyond either boundary. Display P3 is primary; sRGB is
        secondary.
      </p>
    </header>

    <div class="picker-instrument__view-control">
      <span>Coordinate view</span>
      <div role="radiogroup" aria-label="Coordinate view">
        <button
          v-for="option in PLANE_OPTIONS"
          :key="option"
          type="button"
          role="radio"
          :aria-checked="plane === option"
          :data-plane-option="option"
          @click="selectPlane(option)"
        >
          {{ option === "oklab" ? "OKLab" : "OKLCH" }}
        </button>
      </div>
      <small>View state only · gamut evidence remains sRGB and Display P3.</small>
    </div>

    <div class="picker-instrument__workspace">
      <OklchPlanarPicker
        :model-value="modelValue"
        :plane="activePlaneContract"
        :srgb-table="tables.srgb"
        :display-p3-table="tables.displayP3"
        :srgb-fallback-color="srgbFallback"
        :warning-visible="isOutsideDisplayP3"
        :warning-label="primaryGamutWarning"
        @update:model-value="updatePlane"
        @commit="commitPlane"
      />

      <div class="picker-instrument__controls">
        <div class="picker-instrument__legend" aria-label="Picker gamut legend">
          <span><i class="picker-key picker-key--p3" />P3 boundary (solid)</span>
          <span><i class="picker-key picker-key--srgb" />sRGB boundary (dashed)</span>
          <span v-if="srgbFallback"
            ><i class="picker-key picker-key--fallback" />sRGB fallback marker</span
          >
          <span class="picker-instrument__legend-note">
            <template v-if="plane === 'oklch'">
              Between lines = P3-only (dual mode needs sRGB fallback). Active point may cross both;
              no boundary clamps canonical C.
            </template>
            <template v-else>
              Closed contours come from cached Cmax facts at fixed L. The active point may cross
              either contour; neither contour clips canonical OKLCH.
            </template>
          </span>
        </div>

        <template v-if="plane === 'oklch'">
          <OklchLinearControl
            id="picker-hue"
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
            help="Quiet P3 and sRGB thresholds mark table-interpolated Hue limits at current L/C."
            @update:model-value="updateChannel('h', $event)"
            @commit="commitChannel('h', $event)"
          />

          <OklchLinearControl
            id="picker-lightness"
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
            help="Quiet P3 and sRGB thresholds mark table-interpolated Lightness limits at current C/H."
            @update:model-value="updateChannel('l', $event)"
            @commit="commitChannel('l', $event)"
          />

          <OklchLinearControl
            id="picker-chroma"
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
          />
        </template>

        <template v-else>
          <OklchLinearControl
            id="picker-oklab-lightness"
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
          />
          <div class="picker-instrument__coordinate-readout" aria-label="OKLab coordinates">
            <span>Projected coordinate</span>
            <code>a {{ planeProjection.x.toFixed(4) }}</code>
            <code>b {{ planeProjection.y.toFixed(4) }}</code>
            <small>Editable radius ≤ 0.4000 · no RGB gamut clamp</small>
          </div>
        </template>

        <div class="picker-instrument__readouts" aria-label="Picker gamut status">
          <div data-picker-gamut-status="display-p3">
            <span>Display P3</span>
            <strong :class="status.displayP3.inGamut ? 'status-pass' : 'status-warning'">
              {{ status.displayP3.inGamut ? "inside" : "outside" }}
            </strong>
            <code>
              table boundary guide C
              {{ status.displayP3.interpolatedMaximumChroma.toFixed(4) }}
            </code>
          </div>
          <div data-picker-gamut-status="srgb">
            <span>sRGB</span>
            <strong :class="status.srgb.inGamut ? 'status-pass' : 'status-info'">
              {{ status.srgb.inGamut ? "inside" : "outside" }}
            </strong>
            <code>
              table boundary guide C {{ status.srgb.interpolatedMaximumChroma.toFixed(4) }}
            </code>
          </div>
          <div class="picker-instrument__active-readout">
            <span>Active canonical</span>
            <code v-if="plane === 'oklab'">
              OKLCH C {{ modelValue.c.toFixed(4) }} · H {{ modelValue.h.toFixed(2) }}°
            </code>
            <code v-else>C {{ modelValue.c.toFixed(4) }}</code>
          </div>
          <div class="picker-instrument__fallback-readout">
            <span>sRGB fallback guide</span>
            <code v-if="fallbackGuideChroma !== null && status.srgb.interpolatedDeltaC > 0">
              table C {{ fallbackGuideChroma.toFixed(4) }} · ΔC guide −{{
                status.srgb.interpolatedDeltaC.toFixed(4)
              }}
            </code>
            <code v-else-if="fallbackGuideChroma !== null">
              exact outside · table guide overlaps active
            </code>
            <code v-else>not required</code>
          </div>
        </div>
        <p class="picker-instrument__method">
          Inside/outside membership uses exact gamut conversion.
          <template v-if="plane === 'oklab'">
            Closed contours project cached Cmax(L, h) samples into a/b; field samples unproject
            through OKLab to canonical OKLCH. The disc edge is an instrument limit, not gamut
            mapping.
          </template>
          <template v-else>
            Boundary paths, ticks, intervals, and the fallback guide are table-interpolated
            visualization; export fallback remains the exact engine path.
          </template>
          <span v-if="isOutsideDisplayP3" data-primary-gamut-warning-status>
            {{ primaryGamutWarning }}
          </span>
        </p>
      </div>
    </div>
  </section>
</template>
