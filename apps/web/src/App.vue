<script setup lang="ts">
import {
  getPickerGamutStatus,
  serializeColor,
  toOklabColor,
  type DisplayGamut,
  type OklchColor,
  type PickerPlaneId,
} from "@gamut-plane/core";
import { useClipboard } from "@vueuse/core";
import { computed, ref } from "vue";

import PlaneInstrument from "@/components/PlaneInstrument.vue";
import type { CanvasColorSpaceStatus } from "@/components/ColorPlane.vue";
import { PICKER_GAMUT_TABLES } from "@/generated/gamutTables";

const selectedColor = ref<OklchColor>({
  l: 0.68,
  c: 0.18,
  h: 252,
  alpha: 1,
});
const activePlane = ref<PickerPlaneId>("oklch");
const boundaries = ref({
  srgb: true,
  displayP3: true,
});
const canvasCapability = ref<CanvasColorSpaceStatus>("pending");
const copyAnnouncement = ref("");

const gamutStatus = computed(() => getPickerGamutStatus(selectedColor.value, PICKER_GAMUT_TABLES));
const oklab = computed(() => toOklabColor(selectedColor.value));
const oklchCss = computed(() => serializeColor(selectedColor.value));
const srgbCss = computed(() => exactCss("srgb"));
const displayP3Css = computed(() => exactCss("display-p3"));

const { copy, isSupported: clipboardSupported } = useClipboard({
  legacy: true,
  copiedDuring: 1800,
});

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

function updateSelectedColor(color: OklchColor): void {
  selectedColor.value = color;
}

async function copyCss(label: string, value: string | null): Promise<void> {
  if (!value) return;
  await copy(value);
  copyAnnouncement.value = `Copied ${label}: ${value}`;
}
</script>

<template>
  <main class="app-shell">
    <header class="project-header">
      <div>
        <p class="project-kicker">Color-space instrument</p>
        <h1>Gamut Plane</h1>
      </div>
      <p>Interactive OKLab and OKLCH planes with precise sRGB and Display P3 gamut boundaries.</p>
    </header>

    <section class="instrument-layout" aria-label="Gamut Plane instrument">
      <div class="instrument-primary">
        <PlaneInstrument
          :model-value="selectedColor"
          :plane="activePlane"
          :show-srgb-boundary="boundaries.srgb"
          :show-display-p3-boundary="boundaries.displayP3"
          @update:model-value="updateSelectedColor"
          @update:plane="activePlane = $event"
          @commit="updateSelectedColor"
          @capability="canvasCapability = $event"
        />

        <fieldset class="boundary-controls">
          <legend>Boundary visibility</legend>
          <label>
            <input
              v-model="boundaries.displayP3"
              type="checkbox"
              data-boundary-toggle="display-p3"
            />
            <span class="boundary-key boundary-key--p3" aria-hidden="true" />
            Display P3
          </label>
          <label>
            <input v-model="boundaries.srgb" type="checkbox" data-boundary-toggle="srgb" />
            <span class="boundary-key boundary-key--srgb" aria-hidden="true" />
            sRGB
          </label>
          <p>Visibility changes the view only. The selected color is unchanged.</p>
        </fieldset>
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
          <h3 id="css-output-title">CSS representations</h3>
          <div>
            <span>OKLCH</span>
            <code>{{ oklchCss }}</code>
            <button type="button" @click="copyCss('OKLCH', oklchCss)">Copy OKLCH</button>
          </div>
          <div>
            <span>Display P3</span>
            <code v-if="displayP3Css">{{ displayP3Css }}</code>
            <p v-else>Outside Display P3. No clipped value emitted.</p>
            <button
              type="button"
              :disabled="!displayP3Css"
              @click="copyCss('Display P3', displayP3Css)"
            >
              Copy Display P3
            </button>
          </div>
          <div>
            <span>sRGB</span>
            <code v-if="srgbCss">{{ srgbCss }}</code>
            <p v-else>Outside sRGB. No clipped value emitted.</p>
            <button type="button" :disabled="!srgbCss" @click="copyCss('sRGB', srgbCss)">
              Copy sRGB
            </button>
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
