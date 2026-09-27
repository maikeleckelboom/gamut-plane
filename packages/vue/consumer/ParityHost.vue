<script setup lang="ts">
import { ref } from "vue";
import { analyzeGamut, createColorValue, type DisplayGamut } from "@gamut-plane/core";
import { GamutPlane, type GamutPlaneView } from "@gamut-plane/vue";

const query = new URLSearchParams(location.search);
const channels = [
  Number(query.get("l") ?? 0.5),
  Number(query.get("c") ?? 0.2),
  Number(query.get("h") ?? 0.5),
] as const;
const created = createColorValue({ space: "oklch", channels, alpha: 0.7 });
if (!created.ok) throw new Error("Invalid parity color");
const value = ref(created.value);
const view = ref<GamutPlaneView>(query.get("view") === "oklab" ? "oklab" : "oklch");
const srgb = ref(query.get("srgb") !== "false");
const p3 = ref(query.get("p3") !== "false");
const target: DisplayGamut = query.get("target") === "display-p3" ? "display-p3" : "srgb";
const width = Number(query.get("width") ?? 800);
const srgbAnalysis = analyzeGamut(value.value, "srgb-gamut");
const p3Analysis = analyzeGamut(value.value, "display-p3-gamut");
if (!srgbAnalysis.ok || !p3Analysis.ok) throw new Error("Invalid parity gamut analysis");
</script>

<template>
  <main class="parity-host">
    <div
      class="parity-instance"
      :style="{ width: `${width}px` }"
      :data-srgb-status="srgbAnalysis.value.status"
      :data-p3-status="p3Analysis.value.status"
    >
      <GamutPlane
        v-model="value"
        v-model:plane="view"
        :boundary-target="target"
        :show-srgb-boundary="srgb"
        :show-display-p3-boundary="p3"
      >
        <template #field-legend>
          <div data-legend>
            <label><input v-model="srgb" type="checkbox" />sRGB guide</label>
            <label><input v-model="p3" type="checkbox" />Display P3 guide</label>
          </div>
        </template>
      </GamutPlane>
    </div>
  </main>
</template>

<style>
:root {
  font:
    16px/1.4 Georgia,
    serif;
}
body {
  margin: 16px;
}
.parity-instance {
  max-width: 100%;
}
</style>
