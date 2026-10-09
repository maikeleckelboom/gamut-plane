<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useDocumentVisibility, useEventListener, useResizeObserver } from "@vueuse/core";
import {
  createSpatialScene,
  type SpatialGamut,
  type SpatialMode,
  type SpatialScene,
  type SpatialStatus,
} from "./spatialScene";
import "./spatial.css";
import { screenRuler } from "./spatialCamera";

const stage = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const active = ref<SpatialGamut>("srgb");
const visible = ref<SpatialGamut[]>(["srgb", "display-p3"]);
const mode = ref<SpatialMode>("shape");
const status = ref<SpatialStatus | "loading">("loading");
const labels = ref<readonly { x: number; y: number }[]>([]);
const scale = ref(60);
const ruler = computed(() => screenRuler(scale.value));
const frames = ref(0);
const visibility = useDocumentVisibility();
const names = { srgb: "sRGB", "display-p3": "Display P3" } as const;
const gamuts = ["srgb", "display-p3"] as const;
const activeName = computed(() =>
  visible.value.includes(active.value) ? names[active.value] : "No active surface",
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
useResizeObserver(stage, resize);
watch(visibility, (value) => scene?.setVisible(value === "visible"));
watch([active, visible, mode], () =>
  scene?.update({ active: active.value, visible: visible.value, mode: mode.value }),
);
function select(space: SpatialGamut) {
  active.value = space;
  if (!visible.value.includes(space)) visible.value = [...visible.value, space];
}
function toggle(space: SpatialGamut) {
  visible.value = visible.value.includes(space)
    ? visible.value.filter((gamut) => gamut !== space)
    : [...visible.value, space];
  if (!visible.value.includes(active.value) && visible.value[0]) active.value = visible.value[0];
}
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
      <span class="spatial-experiment">Experiment · Phase 3B</span>
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
        <fieldset class="spatial-gamuts">
          <legend>Gamuts</legend>
          <div v-for="space in gamuts" :key="space" class="spatial-gamut">
            <input
              :id="`visible-${space}`"
              type="checkbox"
              :checked="visible.includes(space)"
              :aria-label="`Show ${names[space]}`"
              @change="toggle(space)"
            />
            <button
              :aria-pressed="active === space && visible.includes(space)"
              :aria-label="`Focus ${names[space]}`"
              @click="select(space)"
            >
              {{ names[space]
              }}<span>{{ active === space && visible.includes(space) ? "Surface" : "Cage" }}</span>
            </button>
          </div>
        </fieldset>
        <fieldset class="spatial-modes">
          <legend>Presentation</legend>
          <button
            v-for="value in ['shape', 'color'] as const"
            :key="value"
            :aria-pressed="mode === value"
            @click="mode = value"
          >
            {{ value === "shape" ? "Shape" : "Color" }}
          </button>
        </fieldset>
        <div class="spatial-camera">
          <button :disabled="status !== 'ready' || !visible.length" @click="fit">Fit visible</button
          ><button :disabled="status !== 'ready'" @click="home">Home</button>
        </div>
      </div>
      <div
        ref="stage"
        class="spatial-stage"
        :data-spatial-status="status"
        :data-spatial-frames="frames"
      >
        <canvas
          ref="canvas"
          tabindex="0"
          aria-label="Orthographic gamut scene"
          aria-describedby="spatial-instructions"
        />
        <div class="spatial-stage-caption">
          <strong>{{ activeName }}</strong
          ><span>{{
            mode === "shape"
              ? "Neutral surface · directional light"
              : "Unlit surface · sRGB preview"
          }}</span>
        </div>
        <span
          v-for="(label, index) in labels"
          :key="index"
          class="spatial-axis"
          :style="{ left: `${label.x}px`, top: `${label.y}px` }"
          >{{ ["L", "+a", "+b"][index] }}</span
        >
        <div class="spatial-scale">
          <span :style="{ width: `${ruler.pixels}px` }"></span>{{ ruler.units }} OKLab<span
            class="spatial-scale-note"
            >Equal units on a, L, b</span
          >
        </div>
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
        <div v-else-if="!visible.length" class="spatial-empty" role="status">
          Select a gamut to inspect its surface.
        </div>
      </div>
      <div class="spatial-notes">
        <p id="spatial-instructions">
          Drag to orbit · Right-drag to pan · Scroll to zoom<br /><span
            >Keyboard: arrows orbit, Shift + arrows pan, + / − zoom, Home resets.</span
          >
        </p>
        <p class="spatial-preview">
          <strong>{{ mode === "color" ? "sRGB display preview" : "Shape study" }}</strong
          ><br />{{
            mode === "color"
              ? "Colors outside sRGB are clipped for display. P3 reproduction is not qualified."
              : "Opaque focus; the other gamut is a sparse cage. Dashed lines pass behind the surface."
          }}
        </p>
      </div>
    </section>
    <footer class="spatial-footer">
      <span>Cubic boundary samples · n = 64 · Experimental quality</span
      ><span>Sampled surfaces are not exact gamut membership.</span>
    </footer>
  </main>
</template>
