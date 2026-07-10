<script setup lang="ts">
import {
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
} from "@chromavert/color";
import { computed } from "vue";

import OklchLinearControl, {
  type LinearControlInterval,
  type LinearControlMarker,
} from "@/components/chromavert/OklchLinearControl.vue";
import OklchPlanarPicker from "@/components/chromavert/OklchPlanarPicker.vue";

const props = defineProps<{
  modelValue: ChromavertColor;
}>();

const emit = defineEmits<{
  "update:modelValue": [color: ChromavertColor];
  commit: [color: ChromavertColor];
}>();

const TABLE_OPTIONS = { hueSteps: 120, lightnessSteps: 65, searchIterations: 14 } as const;
let sharedTables: PickerGamutBoundaryTables | undefined;

function getSharedPickerTables(): PickerGamutBoundaryTables {
  sharedTables ??= {
    srgb: getCachedGamutBoundaryTable("srgb", TABLE_OPTIONS),
    displayP3: getCachedGamutBoundaryTable("display-p3", TABLE_OPTIONS),
  };
  return sharedTables;
}

const tables = getSharedPickerTables();
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
    : "P3 and sRGB brackets show table-interpolated Chroma ranges. Gamut output is never silently clamped.",
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
  <section class="picker-instrument" data-picker-instrument :style="instrumentStyle">
    <header class="picker-instrument__header">
      <div>
        <p class="eyebrow">OKLCH / dual gamut view</p>
        <h2>Planar picker instrument</h2>
      </div>
      <p>
        Canonical OKLCH stays editable beyond either boundary. Display P3 is primary; sRGB is
        secondary.
      </p>
    </header>

    <div class="picker-instrument__workspace">
      <OklchPlanarPicker
        :model-value="modelValue"
        :plane="OKLCH_LIGHTNESS_CHROMA_PLANE"
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
            Between lines = P3-only (dual mode needs sRGB fallback). Active point may cross both; no
            boundary clamps canonical C.
          </span>
        </div>

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
          help="P3 and sRGB brackets show table-interpolated Hue intervals at current L/C."
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
          help="P3 and sRGB brackets show table-interpolated Lightness intervals at current C/H."
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
            <code>C {{ modelValue.c.toFixed(4) }}</code>
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
          Inside/outside membership uses exact gamut conversion. Boundary paths, ticks, intervals,
          and the fallback guide are table-interpolated visualization; export fallback remains the
          exact engine path.
          <span v-if="isOutsideDisplayP3" data-primary-gamut-warning-status>
            {{ primaryGamutWarning }}
          </span>
        </p>
      </div>
    </div>
  </section>
</template>
