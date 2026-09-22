<script setup lang="ts">
import { ref } from "vue";
import {
  GamutPlane,
  type DisplayGamut,
  type OklchColor,
  type GamutPlaneView,
} from "@gamut-plane/vue";
import "@gamut-plane/vue/style.css";

const initial = (): OklchColor => ({ l: 0.5, c: 0.2, h: 0.5, alpha: 0.7 });
const first = ref(initial());
const second = ref(initial());
const plane = ref<GamutPlaneView>("oklch");
const boundaryTarget = ref<DisplayGamut>("srgb");
const width = ref(340);
const shown = ref(!new URLSearchParams(location.search).has("hidden"));
const dark = ref(false);
const commits = ref([0, 0]);
const escapes = ref(0);
const single = new URLSearchParams(location.search).has("single");
if (single) width.value = 900;
</script>

<template>
  <main @keydown.esc="escapes++">
    <h1>Instrument test host</h1>
    <label>Host width <input v-model="width" type="number" /></label>
    <button @click="shown = !shown">Toggle first</button>
    <button @click="dark = !dark">Toggle surroundings</button>
    <button @click="first = { l: 0.7, c: 0.52, h: 270, alpha: 0.3 }">Replace first color</button>
    <button @click="plane = plane === 'oklch' ? 'oklab' : 'oklch'">Parent view</button>
    <button @click="boundaryTarget = boundaryTarget === 'srgb' ? 'display-p3' : 'srgb'">
      Parent boundary target
    </button>
    <output data-escapes>{{ escapes }}</output>
    <div class="host-scroll" :class="{ dark }">
      <div class="host-spacer" />
      <div class="host-instance" data-host="first" :style="{ width: `${width}px` }">
        <div v-show="shown">
          <GamutPlane v-model="first" :boundary-target="boundaryTarget" @commit="commits[0]!++" />
        </div>
        <output data-color>{{ JSON.stringify(first) }}</output>
        <output data-commits>{{ commits[0] }}</output>
        <output data-boundary-target-output>{{ boundaryTarget }}</output>
      </div>
      <div class="host-spacer" />
    </div>
    <div v-if="!single" class="host-instance dark" data-host="second" style="width: 800px">
      <GamutPlane
        v-model="second"
        v-model:plane="plane"
        boundary-target="display-p3"
        @commit="commits[1]!++"
      />
      <output data-color>{{ JSON.stringify(second) }}</output>
      <output data-commits>{{ commits[1] }}</output>
      <output data-plane>{{ plane }}</output>
    </div>
    <div data-host-collision class="color-plane__gamut channel-control__gamut-range">
      Host content
    </div>
  </main>
</template>

<style>
:root {
  --foreground: rebeccapurple;
  font:
    16px/1.4 Georgia,
    serif;
  color: #202020;
  background: white;
}
body {
  margin: 16px;
}
main > button,
main > label input {
  font: inherit;
  color: rebeccapurple;
  background: #eee;
  border: 2px solid rebeccapurple;
}
.host-scroll {
  height: 680px;
  overflow: auto;
  background: #f3f3f3;
}
.host-spacer {
  height: 120px;
}
.host-instance {
  margin: 24px;
  max-width: calc(100% - 48px);
}
.dark {
  background: #101418;
  color: white;
}
.host-instance > output {
  display: block;
  overflow-wrap: anywhere;
}
</style>
