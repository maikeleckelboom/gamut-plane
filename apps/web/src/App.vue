<script setup lang="ts">
import {
  findMaximumChroma,
  isColorInGamut,
  serializeColor,
  serializeHexColor,
  type DisplayGamut,
} from "@gamut-plane/core";
import { useSupported, useTimeoutFn } from "@vueuse/core";
import { computed, ref } from "vue";

import {
  GamutPlane,
  type OklchColor,
  type GamutPlaneView,
  type CanvasColorSpaceStatus,
} from "@gamut-plane/vue";
import "@gamut-plane/vue/style.css";
import { formatOklchForDisplay, formatRgbCssForDisplay } from "@/colorPresentation";

const selectedColor = ref<OklchColor>({
  l: 0.68,
  c: 0.18,
  h: 252,
  alpha: 1,
});
const activePlane = ref<GamutPlaneView>("oklch");
const boundaryTarget = ref<DisplayGamut>("srgb");
const boundaries = ref({
  srgb: true,
  displayP3: true,
});
const canvasCapability = ref<CanvasColorSpaceStatus>("pending");
const copyAnnouncement = ref("");
const copiedRepresentation = ref<CssRepresentation | null>(null);

const gamutStatus = computed(() => ({
  srgb: { inGamut: isColorInGamut(selectedColor.value, "srgb") },
  displayP3: { inGamut: isColorInGamut(selectedColor.value, "display-p3") },
}));
const oklchCanonicalCss = computed(() => serializeColor(selectedColor.value));
const oklchDisplayCss = computed(() => formatOklchForDisplay(selectedColor.value));
const srgbCanonicalCss = computed(() => exactCss("srgb"));
const hexColor = computed(() =>
  gamutStatus.value.srgb.inGamut ? serializeHexColor(selectedColor.value) : null,
);
const displayP3CanonicalCss = computed(() => exactCss("display-p3"));
const srgbDisplayCss = computed(() =>
  srgbCanonicalCss.value ? formatRgbCssForDisplay(srgbCanonicalCss.value) : null,
);
const displayP3DisplayCss = computed(() =>
  displayP3CanonicalCss.value ? formatRgbCssForDisplay(displayP3CanonicalCss.value) : null,
);
// Visual previews only. These values never become selected state or copy output.
const srgbBoundaryPreviewCss = computed(() =>
  gamutStatus.value.srgb.inGamut
    ? null
    : serializeColor(
        {
          ...selectedColor.value,
          c: findMaximumChroma(selectedColor.value.l, selectedColor.value.h, "srgb"),
        },
        "srgb",
      ),
);
const displayP3BoundaryPreviewCss = computed(() =>
  gamutStatus.value.displayP3.inGamut
    ? null
    : serializeColor(
        {
          ...selectedColor.value,
          c: findMaximumChroma(selectedColor.value.l, selectedColor.value.h, "display-p3"),
        },
        "display-p3",
      ),
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

function exactCss(gamut: DisplayGamut): string | null {
  const status = gamut === "srgb" ? gamutStatus.value.srgb : gamutStatus.value.displayP3;
  return status.inGamut ? serializeColor(selectedColor.value, gamut) : null;
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
          Interactive OKLab and OKLCH planes with sampled sRGB and Display P3 guides and exact
          membership checks.
        </p>
      </div>
    </header>

    <section class="instrument-layout" aria-label="Gamut Plane instrument">
      <div class="instrument-primary">
        <GamutPlane
          v-model="selectedColor"
          v-model:plane="activePlane"
          :boundary-target="boundaryTarget"
          :show-srgb-boundary="boundaries.srgb"
          :show-display-p3-boundary="boundaries.displayP3"
          @capability="canvasCapability = $event"
        >
          <template #field-legend>
            <section
              class="gamut-reference"
              data-gamut-reference
              aria-labelledby="gamut-reference-title"
            >
              <h3 id="gamut-reference-title">Gamut reference</h3>
              <fieldset>
                <legend class="sr-only">Target</legend>
                <div class="gamut-reference__row">
                  <span class="gamut-reference__label" aria-hidden="true">Target</span>
                  <div class="gamut-reference__options">
                    <label>
                      <input
                        v-model="boundaryTarget"
                        type="radio"
                        value="srgb"
                        name="boundary-target"
                        data-boundary-target-option="srgb"
                      />
                      <span>sRGB</span>
                    </label>
                    <label>
                      <input
                        v-model="boundaryTarget"
                        type="radio"
                        value="display-p3"
                        name="boundary-target"
                        data-boundary-target-option="display-p3"
                      />
                      <span>Display P3</span>
                    </label>
                  </div>
                </div>
              </fieldset>
              <fieldset>
                <legend class="sr-only">Visible guides</legend>
                <div class="gamut-reference__row">
                  <span class="gamut-reference__label" aria-hidden="true">Visible guides</span>
                  <div class="gamut-reference__options">
                    <label>
                      <input
                        v-model="boundaries.srgb"
                        type="checkbox"
                        data-boundary-toggle="srgb"
                      />
                      <span class="boundary-key boundary-key--srgb" aria-hidden="true" />
                      <span>sRGB</span>
                    </label>
                    <label>
                      <input
                        v-model="boundaries.displayP3"
                        type="checkbox"
                        data-boundary-toggle="display-p3"
                      />
                      <span class="boundary-key boundary-key--p3" aria-hidden="true" />
                      <span>Display P3</span>
                    </label>
                  </div>
                </div>
              </fieldset>
            </section>
          </template>
        </GamutPlane>
      </div>

      <aside class="color-inspector" aria-labelledby="selected-color-title">
        <h2 id="selected-color-title" class="sr-only">Selected color</h2>

        <section class="gamut-facts" aria-labelledby="gamut-status-title">
          <h3 id="gamut-status-title">Exact gamut status</h3>
          <dl>
            <div data-exact-gamut-status="srgb">
              <dt>sRGB</dt>
              <dd :data-status="gamutStatus.srgb.inGamut ? 'inside' : 'outside'">
                {{ gamutStatus.srgb.inGamut ? "Inside" : "Outside" }}
              </dd>
            </div>
            <div data-exact-gamut-status="display-p3">
              <dt>Display P3</dt>
              <dd :data-status="gamutStatus.displayP3.inGamut ? 'inside' : 'outside'">
                {{ gamutStatus.displayP3.inGamut ? "Inside" : "Outside" }}
              </dd>
            </div>
          </dl>
        </section>

        <section class="css-output" aria-labelledby="css-output-title">
          <h3 id="css-output-title">CSS representations</h3>
          <div class="css-representation" data-css-representation="oklch">
            <span>OKLCH</span>
            <span
              class="css-representation__swatch"
              :style="{ backgroundColor: oklchCanonicalCss }"
              role="img"
              aria-label="Selected OKLCH color preview"
            />
            <button
              type="button"
              data-copy-representation="oklch"
              :data-copied="isCopied('oklch') ? 'true' : 'false'"
              :aria-label="isCopied('oklch') ? 'Copied OKLCH CSS value' : 'Copy OKLCH CSS value'"
              @click="copyCss('oklch', 'OKLCH', oklchCanonicalCss)"
            >
              {{ isCopied("oklch") ? "Copied" : "Copy" }}
            </button>
            <div class="css-representation__value">
              <code>{{ oklchDisplayCss }}</code>
            </div>
          </div>
          <div class="css-representation" data-css-representation="hex">
            <span>Hex · sRGB</span>
            <span
              class="css-representation__swatch"
              :data-preview-kind="hexColor ? 'output' : 'boundary'"
              :style="{ backgroundColor: hexColor ?? srgbBoundaryPreviewCss ?? undefined }"
              role="img"
              :aria-label="hexColor ? 'Hex output color preview' : 'sRGB boundary color preview'"
            />
            <button
              type="button"
              data-copy-representation="hex"
              :data-copied="isCopied('hex') ? 'true' : 'false'"
              :disabled="!hexColor"
              :aria-describedby="hexColor ? undefined : 'srgb-copy-reason'"
              :aria-label="isCopied('hex') ? 'Copied Hex value' : 'Copy Hex value'"
              @click="copyCss('hex', 'Hex', hexColor)"
            >
              {{ isCopied("hex") ? "Copied" : "Copy" }}
            </button>
            <div class="css-representation__value">
              <code v-if="hexColor">{{ hexColor }}</code>
              <span v-else aria-describedby="srgb-copy-reason">Unavailable · outside sRGB</span>
            </div>
          </div>
          <div class="css-representation" data-css-representation="srgb">
            <span>sRGB</span>
            <span
              class="css-representation__swatch"
              :data-preview-kind="srgbCanonicalCss ? 'output' : 'boundary'"
              :style="{ backgroundColor: srgbCanonicalCss ?? srgbBoundaryPreviewCss ?? undefined }"
              role="img"
              :aria-label="
                srgbCanonicalCss ? 'sRGB output color preview' : 'sRGB boundary color preview'
              "
            />
            <button
              type="button"
              data-copy-representation="srgb"
              :data-copied="isCopied('srgb') ? 'true' : 'false'"
              :disabled="!srgbCanonicalCss"
              :aria-describedby="srgbCanonicalCss ? undefined : 'srgb-copy-reason'"
              :aria-label="isCopied('srgb') ? 'Copied sRGB CSS value' : 'Copy sRGB CSS value'"
              @click="copyCss('srgb', 'sRGB', srgbCanonicalCss)"
            >
              {{ isCopied("srgb") ? "Copied" : "Copy" }}
            </button>
            <div class="css-representation__value">
              <code v-if="srgbDisplayCss">{{ srgbDisplayCss }}</code>
              <span v-else aria-describedby="srgb-copy-reason">Unavailable · outside sRGB</span>
            </div>
          </div>
          <div class="css-representation" data-css-representation="display-p3">
            <span>Display P3</span>
            <span
              class="css-representation__swatch"
              :data-preview-kind="displayP3CanonicalCss ? 'output' : 'boundary'"
              :style="{
                backgroundColor: displayP3CanonicalCss ?? displayP3BoundaryPreviewCss ?? undefined,
              }"
              role="img"
              :aria-label="
                displayP3CanonicalCss
                  ? 'Display P3 output color preview'
                  : 'Display P3 boundary color preview'
              "
            />
            <button
              type="button"
              data-copy-representation="display-p3"
              :data-copied="isCopied('display-p3') ? 'true' : 'false'"
              :disabled="!displayP3CanonicalCss"
              :aria-describedby="displayP3CanonicalCss ? undefined : 'display-p3-copy-reason'"
              :aria-label="
                isCopied('display-p3') ? 'Copied Display P3 CSS value' : 'Copy Display P3 CSS value'
              "
              @click="copyCss('display-p3', 'Display P3', displayP3CanonicalCss)"
            >
              {{ isCopied("display-p3") ? "Copied" : "Copy" }}
            </button>
            <div class="css-representation__value">
              <code v-if="displayP3DisplayCss">{{ displayP3DisplayCss }}</code>
              <span v-else aria-describedby="display-p3-copy-reason">
                Unavailable · outside Display P3
              </span>
            </div>
          </div>
          <p v-if="!hexColor" id="srgb-copy-reason" class="sr-only">
            Selected color is outside sRGB; no clipped Hex or sRGB value is emitted.
          </p>
          <p v-if="!displayP3CanonicalCss" id="display-p3-copy-reason" class="sr-only">
            Selected color is outside Display P3; no clipped value is emitted.
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
