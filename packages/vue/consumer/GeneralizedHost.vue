<script setup lang="ts">
import { ref } from "vue";
import { createColorValue, snapshotColor } from "@gamut-plane/core";
import { GamutPlane, type GamutPlaneState } from "@gamut-plane/vue";
import "@gamut-plane/vue/style.css";

const result = createColorValue({ space: "oklch", channels: [0.62, 0.2, 45], alpha: 0.37 });
if (!result.ok) throw new Error("Invalid generalized consumer color");
const value = ref(result.value);
const state = ref<GamutPlaneState>({
  selection: { representationId: "oklch", editorId: "oklch-lc" },
  checkedGamuts: [],
  referenceGamutId: null,
  visibleGuides: [],
});
</script>

<template>
  <main class="generalized-host">
    <h1>Generalized instrument</h1>
    <GamutPlane v-model="value" v-model:state="state" />
    <output :data-definition="JSON.stringify(snapshotColor(value))">{{
      JSON.stringify(snapshotColor(value))
    }}</output>
    <output :data-generalized-state="JSON.stringify(state)">{{ JSON.stringify(state) }}</output>
  </main>
</template>

<style>
.generalized-host {
  width: min(440px, 100%);
  margin-inline: auto;
}
.generalized-host > output {
  display: block;
  overflow-wrap: anywhere;
  font-size: 0.75rem;
}
</style>
