<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useDocumentVisibility, useEventListener, useResizeObserver } from "@vueuse/core";
import { createColorValue, definitionOf, type ColorValue } from "@gamut-plane/core";
import { GamutPlane, type GamutPlaneState } from "@gamut-plane/vue";
import "@gamut-plane/vue/style.css";
import {
  createSpatialScene,
  type SpatialFrameInfo,
  type SpatialGamut,
  type SpatialLabel,
  type SpatialMode,
  type SpatialScene,
  type SpatialStatus,
} from "./spatialScene";
import {
  createSectionScheduler,
  createSectionStore,
  followSection,
  initialSectionSelection,
  inspectSection,
  observeSelected,
  scrubSection,
  sectionLightness,
  selectedMembership,
  sliderValue,
  SECTION_GAMUTS,
  type SectionOutcomes,
  type SectionSelection,
} from "./sectionModel";
import {
  announceSection,
  describeMarker,
  describeSection,
  describeSelectedColor,
  formatLightness,
  gamutNames,
} from "./sectionSummary";
import "./spatial.css";
import { screenRuler } from "./spatialCamera";

// One authoritative authored color. The compact instrument edits it; this view only observes it.
const initial = createColorValue({ space: "oklch", channels: [0.68, 0.15, 252], alpha: 1 });
if (!initial.ok) throw new Error("Invalid initial selected color");
const selectedColor = shallowRef<ColorValue>(initial.value);
const instrumentState = ref<GamutPlaneState>({
  selection: { representationId: "oklch", editorId: "oklch-lc" },
  checkedGamuts: ["display-p3-gamut", "srgb-gamut"],
  referenceGamutId: "srgb-gamut",
  visibleGuides: ["display-p3-boundary", "srgb-boundary"],
});

const stage = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const active = ref<SpatialGamut>("srgb");
const compare = ref(true);
const mode = ref<SpatialMode>("shape");
const cut = ref(true);
const status = ref<SpatialStatus | "loading">("loading");
const labels = ref<readonly SpatialLabel[]>([]);
const scale = ref(60);
const ruler = computed(() => screenRuler(scale.value));
const frames = ref(0);
const frameInfo = shallowRef<SpatialFrameInfo | null>(null);
const visibility = useDocumentVisibility();
const names = gamutNames;
const gamuts = ["srgb", "display-p3"] as const;
const modes = [
  { id: "shape", label: "Shape" },
  { id: "color", label: "Color" },
] as const;
const other = computed<SpatialGamut>(() => (active.value === "srgb" ? "display-p3" : "srgb"));
// OKLab opponent axes: +a toward red, -a toward green, +b toward yellow, -b toward blue.
const axisText = {
  L: "L 1 · white",
  "+a": "+a red",
  "-a": "−a green",
  "+b": "+b yellow",
  "-b": "−b blue",
  black: "L 0 · black",
} as const;
// Display-preview disclosure. At n = 128 every sampled triangle of the P3 boundary lies outside sRGB
// and none of the sRGB boundary does, so a clipping overlay would be all or nothing; say it in words.
const previewNote = computed(() =>
  mode.value === "shape"
    ? "Opaque surface; the other gamut is an outline, dashed where the surface hides it."
    : active.value === "srgb"
      ? "This surface lies inside sRGB, so the preview shows its colors without clipping. P3 reproduction is not qualified."
      : "Nearly all of this surface lies outside sRGB. The preview clips those colors for display, so they are not P3 colors. P3 reproduction is not qualified.",
);

// --- Section state: derived from the shared color and one local selection --------------------------
const observation = computed(() => observeSelected(selectedColor.value));
const membership = computed(() => ({
  srgb: selectedMembership(selectedColor.value, "srgb"),
  "display-p3": selectedMembership(selectedColor.value, "display-p3"),
}));
const selection = ref<SectionSelection>(initialSectionSelection);
const lightness = computed(() => sectionLightness(selection.value, observation.value));
const slider = computed(() => sliderValue(selection.value, observation.value));
const outcomes = shallowRef<SectionOutcomes | null>(null);
const shownLightness = ref<number | null>(null);
const store = createSectionStore();
let scheduler: ReturnType<typeof createSectionScheduler> | null = null;
const marker = computed(() =>
  observation.value.status === "ok"
    ? ([observation.value.a, observation.value.l, observation.value.b] as const)
    : null,
);
const sectionText = computed(() =>
  describeSection(selection.value.mode, shownLightness.value, outcomes.value, observation.value),
);
const selectedText = computed(() => describeSelectedColor(observation.value, membership.value));
const markerNote = computed(() =>
  describeMarker(frameInfo.value?.markerHidden ?? null, frameInfo.value?.markerInView ?? null),
);
const announcement = ref("");
let announceTimer: ReturnType<typeof setTimeout> | undefined;
const settledAnnouncement = computed(() =>
  announceSection(
    selection.value.mode,
    shownLightness.value,
    outcomes.value,
    observation.value,
    membership.value,
  ),
);
// Meaningful settled changes only: wait until the color and section stop changing.
watch(settledAnnouncement, (text) => {
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    announcement.value = text;
  }, 600);
});
const followActive = computed(() => selection.value.mode === "follow");
function chooseFollow() {
  selection.value = followSection(selection.value);
}
function chooseInspect() {
  selection.value = inspectSection(selection.value, observation.value);
}
function scrub(event: Event) {
  selection.value = scrubSection(selection.value, Number((event.target as HTMLInputElement).value));
}

let scene: SpatialScene | null = null;
const fit = () => scene?.fit();
const home = () => scene?.home();
const restore = () => scene?.restore();
let recovering = false;
function viewSection() {
  // The section is only readable from the plane's far side with the near body cut away.
  cut.value = true;
  scene?.viewSection();
}
function showSelected() {
  selection.value = followSection(selection.value);
  cut.value = true;
  recovering = true;
}
function resize() {
  // Projection uses the drawable CSS box, excluding the stage's decorative border.
  const rect = canvas.value?.getBoundingClientRect();
  if (rect) scene?.resize(rect.width, rect.height, window.devicePixelRatio);
}
useResizeObserver([stage, canvas], resize);
watch(visibility, (value) => scene?.setVisible(value === "visible"));
watch([active, compare, mode, cut], () =>
  scene?.update({
    active: active.value,
    compare: compare.value,
    mode: mode.value,
    cut: cut.value,
  }),
);
watch(marker, (point) => scene?.setMarker(point));
// Development-only counters for browser tests and the evidence report.
const metrics = { requests: 0, computes: 0, lastComputeMs: 0, maxComputeMs: 0, totalComputeMs: 0 };
watch(lightness, (value) => {
  metrics.requests++;
  scheduler?.request(value);
});
onMounted(() => {
  useEventListener(window, "resize", resize);
  scheduler = createSectionScheduler({
    compute: (value) => {
      const before = performance.now();
      const result = store.outcomes(value);
      const elapsed = performance.now() - before;
      metrics.computes++;
      metrics.lastComputeMs = elapsed;
      metrics.maxComputeMs = Math.max(metrics.maxComputeMs, elapsed);
      metrics.totalComputeMs += elapsed;
      return result;
    },
    schedule: (flush) => requestAnimationFrame(flush),
    cancel: (handle) => cancelAnimationFrame(handle as number),
    onUpdate: (update) => {
      outcomes.value = update.outcomes;
      shownLightness.value = update.lightness;
      scene?.setSection({ lightness: update.lightness, outcomes: update.outcomes });
    },
  });
  try {
    scene = createSpatialScene(
      canvas.value!,
      (value) => {
        status.value = value;
      },
      (points, length, count, info) => {
        labels.value = points;
        scale.value = length;
        frames.value = count;
        frameInfo.value = info;
        if (recovering) {
          // After "Show selected" has followed and cut, fall back to the section view if the
          // marker is still hidden or outside the view.
          recovering = false;
          if (info.markerHidden || info.markerInView === false) scene?.viewSection();
        }
      },
    );
    scene?.setVisible(visibility.value === "visible");
    scene?.setMarker(marker.value);
    resize();
    // Test seam (development builds only): lets browser tests read renderer facts such as camera
    // matrices and upload counters. It is read-only and absent from production builds.
    if (!import.meta.env.PROD && stage.value) {
      Object.defineProperty(stage.value, "spatialInspect", {
        value: () => scene?.inspect(),
        configurable: true,
      });
      Object.defineProperty(stage.value, "spatialMetrics", {
        value: () => ({ ...metrics, store: { ...store.stats, size: store.size } }),
        configurable: true,
      });
    }
  } catch {
    scene?.dispose();
    status.value = "unavailable";
  }
  // Compute the first section for the initial color without waiting for a change.
  scheduler.request(lightness.value);
});
onBeforeUnmount(() => {
  clearTimeout(announceTimer);
  scheduler?.dispose();
  scene?.dispose();
});

/** Test and evidence hook: the authored definition, so representation switches can be shown not to change it. */
const authored = computed(() => {
  const definition = definitionOf(selectedColor.value);
  return { space: definition.space, channels: definition.channels.join(",") };
});
const legend = computed(() => [
  { id: "srgb" as const, label: "sRGB section" },
  { id: "display-p3" as const, label: "Display P3 section" },
]);
const visibleSectionGamuts = computed(() =>
  SECTION_GAMUTS.filter((space) => space === active.value || compare.value),
);
const needsRecovery = computed(() => markerNote.value !== null);
</script>

<template>
  <main class="spatial-app">
    <header class="spatial-header">
      <div>
        <a href="/" class="spatial-brand">Gamut Plane</a><span class="spatial-divider">/</span
        ><span>Spatial study</span>
      </div>
      <span class="spatial-experiment">Experiment · Phase 3C.1</span>
    </header>
    <section
      class="spatial-workspace"
      aria-labelledby="spatial-title"
      :data-authored-space="authored.space"
      :data-authored-channels="authored.channels"
    >
      <div class="spatial-intro">
        <div>
          <p class="spatial-eyebrow">RGB GAMUTS IN OKLAB</p>
          <h1 id="spatial-title">Color has a shape.</h1>
        </div>
        <p>
          Edit a color, then see where it sits in the gamut and how the gamut cuts through its
          lightness.
        </p>
      </div>
      <div class="spatial-columns">
        <div class="spatial-scene-column">
          <div class="spatial-toolbar">
            <fieldset class="spatial-group">
              <legend>Surface</legend>
              <label v-for="space in gamuts" :key="space" class="spatial-choice">
                <input v-model="active" type="radio" name="spatial-surface" :value="space" />
                <span>{{ names[space] }}</span>
              </label>
            </fieldset>
            <label class="spatial-compare">
              <input v-model="compare" type="checkbox" />
              <span>Show {{ names[other] }} outline</span>
            </label>
            <fieldset class="spatial-group spatial-modes">
              <legend>Presentation</legend>
              <label v-for="item in modes" :key="item.id" class="spatial-choice">
                <input v-model="mode" type="radio" name="spatial-mode" :value="item.id" />
                <span>{{ item.label }}</span>
              </label>
            </fieldset>
            <div class="spatial-camera">
              <button :disabled="status !== 'ready'" @click="fit">Fit visible</button
              ><button :disabled="status !== 'ready'" @click="home">Home</button>
            </div>
          </div>
          <div
            ref="stage"
            class="spatial-stage"
            :data-spatial-status="status"
            :data-spatial-frames="frames"
          >
            <div class="spatial-caption">
              <strong>{{ names[active] }}</strong
              ><span>{{
                mode === "shape"
                  ? "Neutral surface · directional light"
                  : "Unlit surface · sRGB preview"
              }}</span>
              <span v-if="compare" class="spatial-legend"
                ><i aria-hidden="true"></i>{{ names[other] }} outline</span
              >
            </div>
            <div class="spatial-viewport">
              <canvas
                ref="canvas"
                tabindex="0"
                aria-label="Orthographic gamut scene"
                aria-describedby="spatial-instructions spatial-summary"
              />
              <span
                v-for="label in labels.filter((item) => item.shown)"
                :key="label.id"
                class="spatial-axis"
                :class="{ 'spatial-axis-far': label.far }"
                aria-hidden="true"
                :style="{ left: `${label.x}px`, top: `${label.y}px` }"
                >{{ axisText[label.id] }}</span
              >
              <span
                v-if="frameInfo?.plane && shownLightness !== null"
                class="spatial-plane-tag"
                aria-hidden="true"
                :style="{ left: `${frameInfo.plane.x}px`, top: `${frameInfo.plane.y}px` }"
                >L {{ formatLightness(shownLightness) }}</span
              >
              <div v-if="status === 'unavailable'" class="spatial-message" role="status">
                <strong>3D rendering is unavailable</strong>
                <p>
                  This study needs WebGL2. Enable graphics acceleration or use a browser with WebGL2
                  support. The color instrument and the section facts still work.
                </p>
                <a href="/">Open the compact instrument</a>
              </div>
              <div v-else-if="status === 'lost'" class="spatial-message" role="status">
                <strong>Graphics context interrupted</strong>
                <p>The scene will resume when the browser restores the context.</p>
                <button @click="restore">Try to restore</button
                ><a href="/">Return to the instrument</a>
              </div>
            </div>
            <div class="spatial-scale">
              <span :style="{ width: `${ruler.pixels}px` }"></span>{{ ruler.units }} OKLab<span
                class="spatial-scale-note"
                >Equal units on a, L, b</span
              >
            </div>
          </div>
          <ul v-if="shownLightness !== null" class="spatial-keys" aria-label="Section key">
            <li
              v-for="item in legend"
              v-show="visibleSectionGamuts.includes(item.id)"
              :key="item.id"
              :data-section-key="item.id"
            >
              <i aria-hidden="true" :class="`spatial-key-line spatial-key-${item.id}`"></i
              >{{ item.label }}
            </li>
            <li v-if="marker" data-section-key="selected">
              <i aria-hidden="true" class="spatial-key-marker"></i>Selected color
            </li>
            <li v-if="marker" data-section-key="hidden">
              <i aria-hidden="true" class="spatial-key-ring"></i>Behind the surface
            </li>
            <li v-if="shownLightness !== null" data-section-key="plane">
              <i aria-hidden="true" class="spatial-key-plane"></i>Section plane
            </li>
          </ul>
          <div id="spatial-summary" class="spatial-summary" data-section-summary>
            <p>{{ selectedText }}</p>
            <p>{{ sectionText }}</p>
            <p v-if="markerNote" class="spatial-marker-note" data-marker-note>
              {{ markerNote }}
              <button type="button" class="spatial-inline" @click="showSelected">
                Show selected
              </button>
            </p>
          </div>
          <p
            class="spatial-live sr-only"
            role="status"
            aria-live="polite"
            data-section-announcement
          >
            {{ announcement }}
          </p>
        </div>
        <aside class="spatial-instrument-column" aria-label="Color and section">
          <section class="spatial-section" aria-labelledby="spatial-section-title">
            <div class="spatial-section-head">
              <h2 id="spatial-section-title">Lightness section</h2>
              <span class="spatial-section-value" data-section-lightness>{{
                shownLightness === null ? "None" : `L ${formatLightness(shownLightness)}`
              }}</span>
            </div>
            <fieldset class="spatial-group spatial-section-mode">
              <legend class="sr-only">Section lightness source</legend>
              <label class="spatial-choice">
                <input
                  type="radio"
                  name="spatial-section-mode"
                  value="follow"
                  :checked="followActive"
                  @change="chooseFollow"
                />
                <span>Follow selected color</span>
              </label>
              <label class="spatial-choice">
                <input
                  type="radio"
                  name="spatial-section-mode"
                  value="inspect"
                  :checked="!followActive"
                  @change="chooseInspect"
                />
                <span>Inspect lightness</span>
              </label>
            </fieldset>
            <label class="spatial-slider">
              <span class="spatial-slider-label">Lightness (OKLab L)</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.001"
                :value="slider"
                :aria-valuetext="`L ${formatLightness(slider)}${followActive ? ', following the selected color' : ', inspected separately'}`"
                data-section-slider
                @input="scrub"
              />
            </label>
            <p class="spatial-hint">
              {{
                followActive
                  ? "Moving the slider inspects another lightness. The color is not changed."
                  : "Inspecting. The selected color keeps its own lightness."
              }}
            </p>
            <p class="spatial-hint" data-section-view-hint>
              View section looks along L from below: +a to the right, +b up, as in the a/b editor.
              Cut away removes the near side so the section faces you.
            </p>
            <div class="spatial-section-actions">
              <button type="button" :disabled="status !== 'ready'" @click="viewSection">
                View section
              </button>
              <label class="spatial-compare">
                <input v-model="cut" type="checkbox" />
                <span>Cut away</span>
              </label>
              <button
                v-if="needsRecovery"
                type="button"
                class="spatial-recover"
                @click="showSelected"
              >
                Show selected
              </button>
            </div>
          </section>
          <GamutPlane v-model="selectedColor" v-model:state="instrumentState" />
        </aside>
      </div>
      <div class="spatial-notes">
        <p id="spatial-instructions">
          Drag to orbit · Right-drag or two fingers to pan · Scroll or pinch to zoom<br /><span
            >Keyboard: arrows orbit, Shift + arrows pan, + / − zoom, Home resets.</span
          >
        </p>
        <p class="spatial-preview">
          <strong>{{ mode === "color" ? "sRGB display preview" : "Shape study" }}</strong
          ><br />{{ previewNote }}
        </p>
      </div>
    </section>
    <footer class="spatial-footer">
      <span>Radial boundary samples · m = 64 · Section contours: exact cube-face solutions</span
      ><span
        >Drawn surfaces and fills are not exact gamut membership; exact checks are in core.</span
      >
    </footer>
  </main>
</template>
