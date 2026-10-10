<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useDocumentVisibility, useEventListener, useResizeObserver } from "@vueuse/core";
import {
  createSpatialScene,
  type SpatialGamut,
  type SpatialLabel,
  type SpatialMode,
  type SpatialScene,
  type SpatialStatus,
} from "./spatialScene";
import "./spatial.css";
import { screenRuler } from "./spatialCamera";

const stage = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const active = ref<SpatialGamut>("srgb");
const compare = ref(true);
const mode = ref<SpatialMode>("shape");
const status = ref<SpatialStatus | "loading">("loading");
const labels = ref<readonly SpatialLabel[]>([]);
const scale = ref(60);
const ruler = computed(() => screenRuler(scale.value));
const frames = ref(0);
const visibility = useDocumentVisibility();
const names = { srgb: "sRGB", "display-p3": "Display P3" } as const;
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
let scene: SpatialScene | null = null;
const fit = () => scene?.fit();
const home = () => scene?.home();
const restore = () => scene?.restore();
function resize() {
  // Projection uses the drawable CSS box, excluding the stage's decorative border.
  const rect = canvas.value?.getBoundingClientRect();
  if (rect) scene?.resize(rect.width, rect.height, window.devicePixelRatio);
}
useResizeObserver([stage, canvas], resize);
watch(visibility, (value) => scene?.setVisible(value === "visible"));
watch([active, compare, mode], () =>
  scene?.update({ active: active.value, compare: compare.value, mode: mode.value }),
);
onMounted(() => {
  useEventListener(window, "resize", resize);
  try {
    scene = createSpatialScene(
      canvas.value!,
      (value) => {
        status.value = value;
      },
      (points, length, count) => {
        labels.value = points;
        scale.value = length;
        frames.value = count;
      },
    );
    scene?.setVisible(visibility.value === "visible");
    resize();
  } catch {
    scene?.dispose();
    status.value = "unavailable";
  }
});
onBeforeUnmount(() => scene?.dispose());
</script>

<template>
  <main class="spatial-app">
    <header class="spatial-header">
      <div>
        <a href="/" class="spatial-brand">Gamut Plane</a><span class="spatial-divider">/</span
        ><span>Spatial study</span>
      </div>
      <span class="spatial-experiment">Experiment · Phase 3B-R</span>
    </header>
    <section class="spatial-workspace" aria-labelledby="spatial-title">
      <div class="spatial-intro">
        <div>
          <p class="spatial-eyebrow">RGB GAMUTS IN OKLAB</p>
          <h1 id="spatial-title">Color has a shape.</h1>
        </div>
        <p>
          Two color spaces. One scientific scale.<br />Inspect the surface, then look at its color.
        </p>
      </div>
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
            aria-describedby="spatial-instructions"
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
          <div v-if="status === 'unavailable'" class="spatial-message" role="status">
            <strong>3D rendering is unavailable</strong>
            <p>
              This study needs WebGL2. Enable graphics acceleration or use a browser with WebGL2
              support.
            </p>
            <a href="/">Open the compact instrument</a>
          </div>
          <div v-else-if="status === 'lost'" class="spatial-message" role="status">
            <strong>Graphics context interrupted</strong>
            <p>The scene will resume when the browser restores the context.</p>
            <button @click="restore">Try to restore</button><a href="/">Return to the instrument</a>
          </div>
        </div>
        <div class="spatial-scale">
          <span :style="{ width: `${ruler.pixels}px` }"></span>{{ ruler.units }} OKLab<span
            class="spatial-scale-note"
            >Equal units on a, L, b</span
          >
        </div>
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
      <span>Cubic boundary samples · n = 64 · Experimental quality</span
      ><span>Sampled surfaces are not exact gamut membership.</span>
    </footer>
  </main>
</template>
