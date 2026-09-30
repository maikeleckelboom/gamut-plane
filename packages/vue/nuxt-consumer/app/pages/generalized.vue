<script setup lang="ts">
import { onMounted, ref } from "vue";
import { createColorValue, snapshotColor } from "@gamut-plane/core";
import { GamutPlane, type GamutPlaneState } from "@gamut-plane/vue";

const initial = createColorValue({ space: "srgb", channels: [1.2, 0.4, -0.1], alpha: 0.37 });
if (!initial.ok) throw new Error("Invalid generalized Nuxt color");
const value = ref(initial.value);
const hydrated = ref(false);
onMounted(() => {
  hydrated.value = true;
});
const state = ref<GamutPlaneState>({
  selection: { representationId: "srgb", editorId: "srgb-rg" },
  checkedGamuts: ["srgb-gamut"],
  referenceGamutId: null,
  visibleGuides: ["srgb-boundary", "display-p3-boundary"],
});
</script>

<template>
  <div
    data-generalized-host
    :data-generalized-hydrated="hydrated ? 'true' : undefined"
    style="width: min(440px, 100%)"
  >
    <GamutPlane v-model="value" v-model:state="state" />
    <output :data-definition="JSON.stringify(snapshotColor(value))">{{
      JSON.stringify(snapshotColor(value))
    }}</output>
  </div>
</template>
