<script setup lang="ts">
import {
  createColorValue,
  findMaximumChroma,
  mapToGamut,
  represent,
  serializeCss,
  serializeHex,
  type ColorValue,
  type DisplayGamut,
} from "@gamut-plane/core";
import { useSupported, useTimeoutFn } from "@vueuse/core";
import { computed, ref } from "vue";

import { GamutPlane, type GamutPlaneState, type CanvasColorSpaceStatus } from "@gamut-plane/vue";
import "@gamut-plane/vue/style.css";
import {
  formatOklchForDisplay,
  formatRgbCssForDisplay,
  unavailableOutput,
} from "@/colorPresentation";

const fixture = createColorValue({ space: "oklch", channels: [0.68, 0.15, 252], alpha: 1 });
if (!fixture.ok) throw new Error("Invalid initial selected color");
const selectedColor = ref<ColorValue>(fixture.value);
const instrumentState = ref<GamutPlaneState>({
  selection: { representationId: "oklch", editorId: "oklch-lc" },
  checkedGamuts: ["display-p3-gamut", "srgb-gamut"],
  referenceGamutId: "srgb-gamut",
  visibleGuides: ["display-p3-boundary", "srgb-boundary"],
});
const canvasCapability = ref<CanvasColorSpaceStatus>("pending");
const copyAnnouncement = ref("");
const copiedRepresentation = ref<CssRepresentation | null>(null);

function observe<S extends "oklch" | "oklab" | "srgb" | "display-p3">(space: S) {
  const result = represent(selectedColor.value, space);
  if (!result.ok) throw new RangeError(`Selected color cannot be observed in ${space}`);
  return result.value;
}
const oklch = computed(() => observe("oklch"));
const oklchCopyCss = computed(() => {
  const output = serializeCss(oklch.value, { policy: "preserve-coordinates" });
  return output.ok ? output.value.text : null;
});
const oklchDisplayCss = computed(() => formatOklchForDisplay(oklch.value));
const srgbCssOutput = computed(() => strictCss("srgb"));
const srgbCopyCss = computed(() =>
  srgbCssOutput.value.ok ? srgbCssOutput.value.value.text : null,
);
const hexOutput = computed(() => {
  const srgb = observe("srgb");
  return serializeHex(srgb, { alpha: srgb.alpha === 1 ? "omit" : "include" });
});
const hexColor = computed(() => (hexOutput.value.ok ? hexOutput.value.value.text : null));
const displayP3CssOutput = computed(() => strictCss("display-p3"));
const displayP3CopyCss = computed(() =>
  displayP3CssOutput.value.ok ? displayP3CssOutput.value.value.text : null,
);
const hexUnavailable = computed(() =>
  hexOutput.value.ok ? null : unavailableOutput(hexOutput.value.error.code, "srgb"),
);
const srgbUnavailable = computed(() =>
  srgbCssOutput.value.ok ? null : unavailableOutput(srgbCssOutput.value.error.code, "srgb"),
);
const displayP3Unavailable = computed(() =>
  displayP3CssOutput.value.ok
    ? null
    : unavailableOutput(displayP3CssOutput.value.error.code, "display-p3"),
);
const srgbDisplayCss = computed(() =>
  srgbCopyCss.value ? formatRgbCssForDisplay(srgbCopyCss.value) : null,
);
const displayP3DisplayCss = computed(() =>
  displayP3CopyCss.value ? formatRgbCssForDisplay(displayP3CopyCss.value) : null,
);
// Visual previews only. These values never become selected state or copy output.
const srgbBoundaryPreviewCss = computed(() =>
  srgbUnavailable.value?.showBoundaryPreview ? boundaryPreviewCss("srgb") : null,
);
const displayP3BoundaryPreviewCss = computed(() =>
  displayP3Unavailable.value?.showBoundaryPreview ? boundaryPreviewCss("display-p3") : null,
);

const clipboardSupported = useSupported(
  () =>
    typeof navigator.clipboard?.writeText === "function" ||
    typeof document.execCommand === "function",
);
const copyFeedback = useTimeoutFn(
  () => {
    copiedRepresentation.value = null;
  },
  1800,
  { immediate: false },
);

type CssRepresentation = "oklch" | "hex" | "display-p3" | "srgb";

const capabilityLabel = computed(() => {
  if (canvasCapability.value === "display-p3") return "Display P3";
  if (canvasCapability.value === "srgb") return "sRGB";
  if (canvasCapability.value === "unavailable") return "Unavailable";
  return "Detecting";
});

function strictCss(gamut: DisplayGamut) {
  return serializeCss(observe(gamut), {
    policy: "require-in-gamut",
    gamut: gamut === "srgb" ? "srgb-gamut" : "display-p3-gamut",
  });
}

function boundaryPreviewCss(gamut: DisplayGamut): string | null {
  const [l, , observedHue] = oklch.value.channels;
  // A separate transient boundary reference for the swatch, never the selected ColorValue.
  const reference = createColorValue({
    space: "oklch",
    channels: [l, findMaximumChroma(l, observedHue ?? 0, gamut), observedHue ?? 0],
    alpha: oklch.value.alpha,
  });
  if (!reference.ok) return null;
  const observed = represent(reference.value, gamut);
  if (!observed.ok) return null;
  const css = serializeCss(observed.value, { policy: "preserve-coordinates" });
  return css.ok ? css.value.text : null;
}

const clippableGamuts = { srgb: "srgb-gamut", "display-p3": "display-p3-gamut" } as const;
const canClip = computed(
  () =>
    ({
      hex: hexUnavailable.value?.showBoundaryPreview === true,
      srgb: srgbUnavailable.value?.showBoundaryPreview === true,
      "display-p3": displayP3Unavailable.value?.showBoundaryPreview === true,
    }) as const,
);

// Explicit, user-initiated mapping: chroma is reduced at fixed lightness and hue. Never implicit.
function clipToGamut(gamut: DisplayGamut, label: string): void {
  const result = mapToGamut(
    selectedColor.value,
    clippableGamuts[gamut],
    "oklch-chroma-reduction-v1",
  );
  copiedRepresentation.value = null;
  if (!result.ok || !result.value.changed) {
    copyAnnouncement.value = `Could not clip the color to ${label}.`;
    return;
  }
  selectedColor.value = result.value.mapped;
  copyAnnouncement.value = `Clipped the color to ${label}.`;
}

function isCopied(representation: CssRepresentation): boolean {
  return copiedRepresentation.value === representation;
}

async function copyCss(
  representation: CssRepresentation,
  label: string,
  value: string | null,
): Promise<void> {
  if (!value) return;
  copyAnnouncement.value = "";
  copiedRepresentation.value = null;
  copyFeedback.stop();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const previousFocus = document.activeElement;
      const text = document.createElement("textarea");
      text.value = value;
      text.setAttribute("readonly", "");
      text.style.cssText = "position: fixed; opacity: 0;";
      document.body.append(text);
      try {
        text.select();
        if (!document.execCommand("copy")) throw new Error("Clipboard copy rejected");
      } finally {
        text.remove();
        if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
      }
    }
    copiedRepresentation.value = representation;
    copyAnnouncement.value = `Copied ${label}: ${value}`;
    copyFeedback.start();
  } catch {
    copyAnnouncement.value = `Could not copy ${label}. Select the value and copy it manually.`;
  }
}
</script>

<template>
  <main class="app-shell">
    <header class="project-header" aria-describedby="project-description">
      <div class="project-identity">
        <h1>Gamut Plane</h1>
        <p id="project-description">
          Pick a color in OKLCH or OKLab. Inspect its coordinates and compare gamuts when needed.
        </p>
      </div>
    </header>

    <section class="instrument-layout" aria-label="Gamut Plane instrument">
      <div class="instrument-primary">
        <GamutPlane
          v-model="selectedColor"
          v-model:state="instrumentState"
          @capability="canvasCapability = $event"
        />
      </div>

      <aside class="output-demo" aria-labelledby="output-demo-title">
        <h2 id="output-demo-title">Output examples</h2>

        <section class="css-output" aria-labelledby="css-output-title">
          <h3 id="css-output-title">CSS values</h3>
          <div class="css-representation" data-css-representation="oklch">
            <span>OKLCH</span>
            <span
              class="css-representation__swatch"
              :style="{ backgroundColor: oklchCopyCss ?? undefined }"
              aria-hidden="true"
            />
            <button
              type="button"
              data-copy-representation="oklch"
              :data-copied="isCopied('oklch') ? 'true' : 'false'"
              :aria-label="isCopied('oklch') ? 'Copied OKLCH CSS value' : 'Copy OKLCH CSS value'"
              @click="copyCss('oklch', 'OKLCH', oklchCopyCss)"
            >
              {{ isCopied("oklch") ? "Copied" : "Copy" }}
            </button>
            <div class="css-representation__value">
              <code>{{ oklchDisplayCss }}</code>
            </div>
          </div>
          <div
            class="css-representation"
            data-css-representation="hex"
            :data-output-error="hexOutput.ok ? undefined : hexOutput.error.code"
          >
            <span>Hex · sRGB</span>
            <span
              class="css-representation__swatch"
              :data-preview-kind="
                hexColor ? 'output' : srgbBoundaryPreviewCss ? 'boundary' : 'none'
              "
              :style="{ backgroundColor: hexColor ?? srgbBoundaryPreviewCss ?? undefined }"
              :role="!hexColor && srgbBoundaryPreviewCss ? 'img' : undefined"
              :aria-hidden="hexColor || !srgbBoundaryPreviewCss ? 'true' : undefined"
              :aria-label="
                !hexColor && srgbBoundaryPreviewCss ? 'sRGB boundary color preview' : undefined
              "
            />
            <button
              type="button"
              class="css-clip"
              data-clip-representation="hex"
              :disabled="!canClip['hex']"
              aria-label="Clip color to sRGB"
              @click="clipToGamut('srgb', 'sRGB')"
            >
              Clip
            </button>
            <button
              type="button"
              data-copy-representation="hex"
              :data-copied="isCopied('hex') ? 'true' : 'false'"
              :disabled="!hexColor"
              :aria-describedby="hexColor ? undefined : 'hex-copy-reason'"
              :aria-label="isCopied('hex') ? 'Copied Hex value' : 'Copy Hex value'"
              @click="copyCss('hex', 'Hex', hexColor)"
            >
              {{ isCopied("hex") ? "Copied" : "Copy" }}
            </button>
            <div class="css-representation__value">
              <code v-if="hexColor">{{ hexColor }}</code>
              <span v-else aria-describedby="hex-copy-reason">{{ hexUnavailable?.compact }}</span>
            </div>
          </div>
          <div
            class="css-representation"
            data-css-representation="srgb"
            :data-output-error="srgbCssOutput.ok ? undefined : srgbCssOutput.error.code"
          >
            <span>sRGB</span>
            <span
              class="css-representation__swatch"
              :data-preview-kind="
                srgbCopyCss ? 'output' : srgbBoundaryPreviewCss ? 'boundary' : 'none'
              "
              :style="{ backgroundColor: srgbCopyCss ?? srgbBoundaryPreviewCss ?? undefined }"
              :role="!srgbCopyCss && srgbBoundaryPreviewCss ? 'img' : undefined"
              :aria-hidden="srgbCopyCss || !srgbBoundaryPreviewCss ? 'true' : undefined"
              :aria-label="
                !srgbCopyCss && srgbBoundaryPreviewCss ? 'sRGB boundary color preview' : undefined
              "
            />
            <button
              type="button"
              class="css-clip"
              data-clip-representation="srgb"
              :disabled="!canClip['srgb']"
              aria-label="Clip color to sRGB"
              @click="clipToGamut('srgb', 'sRGB')"
            >
              Clip
            </button>
            <button
              type="button"
              data-copy-representation="srgb"
              :data-copied="isCopied('srgb') ? 'true' : 'false'"
              :disabled="!srgbCopyCss"
              :aria-describedby="srgbCopyCss ? undefined : 'srgb-copy-reason'"
              :aria-label="isCopied('srgb') ? 'Copied sRGB CSS value' : 'Copy sRGB CSS value'"
              @click="copyCss('srgb', 'sRGB', srgbCopyCss)"
            >
              {{ isCopied("srgb") ? "Copied" : "Copy" }}
            </button>
            <div class="css-representation__value">
              <code v-if="srgbDisplayCss">{{ srgbDisplayCss }}</code>
              <span v-else aria-describedby="srgb-copy-reason">{{ srgbUnavailable?.compact }}</span>
            </div>
          </div>
          <div
            class="css-representation"
            data-css-representation="display-p3"
            :data-output-error="displayP3CssOutput.ok ? undefined : displayP3CssOutput.error.code"
          >
            <span>Display P3</span>
            <span
              class="css-representation__swatch"
              :data-preview-kind="
                displayP3CopyCss ? 'output' : displayP3BoundaryPreviewCss ? 'boundary' : 'none'
              "
              :style="{
                backgroundColor: displayP3CopyCss ?? displayP3BoundaryPreviewCss ?? undefined,
              }"
              :role="!displayP3CopyCss && displayP3BoundaryPreviewCss ? 'img' : undefined"
              :aria-hidden="displayP3CopyCss || !displayP3BoundaryPreviewCss ? 'true' : undefined"
              :aria-label="
                !displayP3CopyCss && displayP3BoundaryPreviewCss
                  ? 'Display P3 boundary color preview'
                  : undefined
              "
            />
            <button
              type="button"
              class="css-clip"
              data-clip-representation="display-p3"
              :disabled="!canClip['display-p3']"
              aria-label="Clip color to Display P3"
              @click="clipToGamut('display-p3', 'Display P3')"
            >
              Clip
            </button>
            <button
              type="button"
              data-copy-representation="display-p3"
              :data-copied="isCopied('display-p3') ? 'true' : 'false'"
              :disabled="!displayP3CopyCss"
              :aria-describedby="displayP3CopyCss ? undefined : 'display-p3-copy-reason'"
              :aria-label="
                isCopied('display-p3') ? 'Copied Display P3 CSS value' : 'Copy Display P3 CSS value'
              "
              @click="copyCss('display-p3', 'Display P3', displayP3CopyCss)"
            >
              {{ isCopied("display-p3") ? "Copied" : "Copy" }}
            </button>
            <div class="css-representation__value">
              <code v-if="displayP3DisplayCss">{{ displayP3DisplayCss }}</code>
              <span v-else aria-describedby="display-p3-copy-reason">{{
                displayP3Unavailable?.compact
              }}</span>
            </div>
          </div>
          <p v-if="hexUnavailable" id="hex-copy-reason" class="sr-only">
            {{ hexUnavailable.explanation }}
          </p>
          <p v-if="srgbUnavailable" id="srgb-copy-reason" class="sr-only">
            {{ srgbUnavailable.explanation }}
          </p>
          <p v-if="!displayP3CopyCss" id="display-p3-copy-reason" class="sr-only">
            {{ displayP3Unavailable?.explanation }}
          </p>
          <p v-if="!clipboardSupported" class="copy-support">
            Clipboard access is unavailable in this browser.
          </p>
          <p class="sr-only" role="status" aria-live="polite">{{ copyAnnouncement }}</p>
        </section>

        <section class="canvas-fact" aria-labelledby="canvas-capability-title">
          <h3 id="canvas-capability-title">Canvas</h3>
          <p :data-canvas-capability="canvasCapability">{{ capabilityLabel }}</p>
        </section>
      </aside>
    </section>
  </main>
</template>
