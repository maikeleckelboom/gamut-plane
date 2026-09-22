<script setup lang="ts">
import { isColorInGamut, serializeColor, toOklabColor, type DisplayGamut } from "@gamut-plane/core";
import { useSupported, useTimeoutFn } from "@vueuse/core";
import { computed, ref } from "vue";

import {
  GamutPlane,
  type OklchColor,
  type GamutPlaneView,
  type CanvasColorSpaceStatus,
} from "@gamut-plane/vue";
import "@gamut-plane/vue/style.css";
import {
  CSS_DISPLAY_DECIMALS,
  formatOklchForDisplay,
  formatRgbCssForDisplay,
} from "@/colorPresentation";

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
const oklab = computed(() => toOklabColor(selectedColor.value));
const oklchCanonicalCss = computed(() => serializeColor(selectedColor.value));
const oklchDisplayCss = computed(() => formatOklchForDisplay(selectedColor.value));
const srgbCanonicalCss = computed(() => exactCss("srgb"));
const displayP3CanonicalCss = computed(() => exactCss("display-p3"));
const srgbDisplayCss = computed(() =>
  srgbCanonicalCss.value ? formatRgbCssForDisplay(srgbCanonicalCss.value) : null,
);
const displayP3DisplayCss = computed(() =>
  displayP3CanonicalCss.value ? formatRgbCssForDisplay(displayP3CanonicalCss.value) : null,
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

type CssRepresentation = "oklch" | "display-p3" | "srgb";

const capabilityLabel = computed(() => {
  if (canvasCapability.value === "display-p3") {
    return "Display P3 Canvas granted. The field may paint P3 colors.";
  }
  if (canvasCapability.value === "srgb") {
    return "sRGB Canvas granted. P3 contours remain mathematical; P3-only field colors may clip.";
  }
  if (canvasCapability.value === "unavailable") {
    return "Canvas 2D is unavailable. Exact gamut facts remain mathematical.";
  }
  return "Detecting the browser Canvas color space.";
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
    copyAnnouncement.value = `Could not copy ${label}. Select the CSS value and copy it manually.`;
  }
}
</script>

<template>
  <main class="app-shell">
    <header class="project-header" aria-describedby="project-description">
      <div class="project-identity">
        <p class="project-kicker">Color-space instrument</p>
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
                <legend>Target</legend>
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
              </fieldset>
              <fieldset>
                <legend>Visible guides</legend>
                <div class="gamut-reference__options">
                  <label>
                    <input
                      v-model="boundaries.displayP3"
                      type="checkbox"
                      data-boundary-toggle="display-p3"
                    />
                    <span class="boundary-key boundary-key--p3" aria-hidden="true" />
                    <span>Display P3</span>
                  </label>
                  <label>
                    <input v-model="boundaries.srgb" type="checkbox" data-boundary-toggle="srgb" />
                    <span class="boundary-key boundary-key--srgb" aria-hidden="true" />
                    <span>sRGB</span>
                  </label>
                </div>
              </fieldset>
              <p>
                Target controls projection and reference. Visibility controls sampled guides only.
              </p>
            </section>
          </template>
        </GamutPlane>
      </div>

      <aside class="color-inspector" aria-labelledby="selected-color-title">
        <header>
          <p class="inspector-kicker">Selected color</p>
          <h2 id="selected-color-title">
            {{ activePlane === "oklab" ? "OKLab coordinates" : "OKLCH coordinates" }}
          </h2>
        </header>

        <dl v-if="activePlane === 'oklch'" class="channel-values" aria-label="OKLCH channels">
          <div>
            <dt>L</dt>
            <dd>{{ selectedColor.l.toFixed(4) }}</dd>
          </div>
          <div>
            <dt>C</dt>
            <dd>{{ selectedColor.c.toFixed(4) }}</dd>
          </div>
          <div>
            <dt>H</dt>
            <dd>{{ selectedColor.h.toFixed(2) }}°</dd>
          </div>
        </dl>
        <dl v-else class="channel-values" aria-label="OKLab channels">
          <div>
            <dt>L</dt>
            <dd>{{ oklab.l.toFixed(4) }}</dd>
          </div>
          <div>
            <dt>a</dt>
            <dd>{{ oklab.a.toFixed(4) }}</dd>
          </div>
          <div>
            <dt>b</dt>
            <dd>{{ oklab.b.toFixed(4) }}</dd>
          </div>
        </dl>

        <section class="gamut-facts" aria-labelledby="gamut-status-title">
          <h3 id="gamut-status-title">Exact gamut status</h3>
          <dl>
            <div data-exact-gamut-status="display-p3">
              <dt>Display P3</dt>
              <dd :data-status="gamutStatus.displayP3.inGamut ? 'inside' : 'outside'">
                {{ gamutStatus.displayP3.inGamut ? "Inside" : "Outside" }}
              </dd>
            </div>
            <div data-exact-gamut-status="srgb">
              <dt>sRGB</dt>
              <dd :data-status="gamutStatus.srgb.inGamut ? 'inside' : 'outside'">
                {{ gamutStatus.srgb.inGamut ? "Inside" : "Outside" }}
              </dd>
            </div>
          </dl>
          <p>Membership uses exact linear-light conversion, not the sampled contours.</p>
        </section>

        <section class="css-output" aria-labelledby="css-output-title">
          <div class="inspector-section-heading">
            <h3 id="css-output-title">CSS representations</h3>
            <p>Shown to {{ CSS_DISPLAY_DECIMALS }} decimals. Copy preserves canonical precision.</p>
          </div>
          <div class="css-representation" data-css-representation="oklch">
            <span>OKLCH</span>
            <button
              type="button"
              data-copy-representation="oklch"
              :data-copied="isCopied('oklch') ? 'true' : 'false'"
              :aria-label="isCopied('oklch') ? 'Copied OKLCH CSS value' : 'Copy OKLCH CSS value'"
              @click="copyCss('oklch', 'OKLCH', oklchCanonicalCss)"
            >
              {{ isCopied("oklch") ? "Copied" : "Copy" }}
            </button>
            <code>{{ oklchDisplayCss }}</code>
          </div>
          <div class="css-representation" data-css-representation="display-p3">
            <span>Display P3</span>
            <button
              type="button"
              data-copy-representation="display-p3"
              :data-copied="isCopied('display-p3') ? 'true' : 'false'"
              :disabled="!displayP3CanonicalCss"
              :aria-describedby="displayP3CanonicalCss ? undefined : 'display-p3-copy-reason'"
              :aria-label="
                isCopied('display-p3') ? 'Copied Display P3 CSS value' : 'Copy Display P3 CSS value'
              "
              :title="
                displayP3CanonicalCss
                  ? undefined
                  : 'Unavailable because the selected color is outside Display P3.'
              "
              @click="copyCss('display-p3', 'Display P3', displayP3CanonicalCss)"
            >
              {{ isCopied("display-p3") ? "Copied" : "Copy" }}
            </button>
            <code v-if="displayP3DisplayCss">{{ displayP3DisplayCss }}</code>
            <p v-else id="display-p3-copy-reason">Outside Display P3. No clipped value emitted.</p>
          </div>
          <div class="css-representation" data-css-representation="srgb">
            <span>sRGB</span>
            <button
              type="button"
              data-copy-representation="srgb"
              :data-copied="isCopied('srgb') ? 'true' : 'false'"
              :disabled="!srgbCanonicalCss"
              :aria-describedby="srgbCanonicalCss ? undefined : 'srgb-copy-reason'"
              :aria-label="isCopied('srgb') ? 'Copied sRGB CSS value' : 'Copy sRGB CSS value'"
              :title="
                srgbCanonicalCss
                  ? undefined
                  : 'Unavailable because the selected color is outside sRGB.'
              "
              @click="copyCss('srgb', 'sRGB', srgbCanonicalCss)"
            >
              {{ isCopied("srgb") ? "Copied" : "Copy" }}
            </button>
            <code v-if="srgbDisplayCss">{{ srgbDisplayCss }}</code>
            <p v-else id="srgb-copy-reason">Outside sRGB. No clipped value emitted.</p>
          </div>
          <p v-if="!clipboardSupported" class="copy-support">
            Clipboard access is unavailable in this browser.
          </p>
          <p class="sr-only" role="status" aria-live="polite">{{ copyAnnouncement }}</p>
        </section>

        <section class="canvas-fact" aria-labelledby="canvas-capability-title">
          <h3 id="canvas-capability-title">Canvas capability</h3>
          <p :data-canvas-capability="canvasCapability">{{ capabilityLabel }}</p>
        </section>
      </aside>
    </section>
  </main>
</template>
