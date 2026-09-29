<script setup lang="ts">
import { ref } from "vue";
import { createColorValue, represent, snapshotColor } from "@gamut-plane/core";
import { GamutPlane, type ColorValue, type GamutPlaneState } from "@gamut-plane/vue";

function color(l: number, c: number, h: number, alpha: number): ColorValue {
  const result = createColorValue({ space: "oklch", channels: [l, c, h], alpha });
  if (!result.ok) throw new Error("Invalid Nuxt consumer color");
  return result.value;
}

const route = useRoute();
const events = useState("events", () => ({ changes: 0, commits: 0, cancels: 0 }));
const initial = route.query.alternate
  ? color(0.31, 0.41, -28.25, 0.61)
  : color(0.68, 0.52345678, 612.123456, 0.37);
const observedInitial = represent(initial, "oklch");
if (!observedInitial.ok) throw new Error("Cannot observe Nuxt consumer color");
const colors = ref([
  initial,
  color(0.43, observedInitial.value.channels[1], 120.25, observedInitial.value.alpha),
]);
function observedReadout(value: ColorValue) {
  const result = represent(value, "oklch");
  if (!result.ok) throw new Error("Cannot observe Nuxt consumer color");
  const [l, c, h] = result.value.channels;
  return { l, c, h, alpha: result.value.alpha };
}
const states = ref<GamutPlaneState[]>([
  {
    selection: { representationId: "oklch", editorId: "oklch-lc" },
    checkedGamuts: [],
    referenceGamutId: null,
    visibleGuides: [],
  },
  {
    selection: { representationId: "oklab", editorId: "oklab-ab" },
    checkedGamuts: [],
    referenceGamutId: null,
    visibleGuides: [],
  },
]);
const hidden = ref(Boolean(route.query.hidden));
const narrow = ref(Boolean(route.query.narrow));
</script>

<template>
  <div>
    <button @click="hidden = !hidden">Toggle visibility</button>
    <button @click="narrow = !narrow">Resize hosts</button>
    <div
      v-for="(state, index) in states"
      :key="index"
      :data-host="state.selection.representationId"
      :style="{
        width: narrow ? '280px' : '760px',
        maxWidth: '100%',
        display: hidden ? 'none' : undefined,
      }"
    >
      <GamutPlane
        v-model="colors[index]!"
        :state="state"
        @update:state="states[index] = $event"
        @update:model-value="events.changes++"
        @commit="events.commits++"
        @cancel="events.cancels++"
      />
      <output data-color :data-definition="JSON.stringify(snapshotColor(colors[index]!))">{{
        JSON.stringify(observedReadout(colors[index]!))
      }}</output>
    </div>
  </div>
</template>
