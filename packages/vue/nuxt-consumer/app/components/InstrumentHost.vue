<script setup lang="ts">
import { ref } from "vue";
import { GamutPlane, type OklchColor, type GamutPlaneView } from "@gamut-plane/vue";

const route = useRoute();
const events = useState("events", () => ({ changes: 0, commits: 0, cancels: 0 }));
const initial: OklchColor = route.query.alternate
  ? { l: 0.31, c: 0.41, h: -28.25, alpha: 0.61 }
  : { l: 0.68, c: 0.52345678, h: 612.123456, alpha: 0.37 };
const colors = ref([{ ...initial }, { ...initial, l: 0.43, h: 120.25 }]);
const views: GamutPlaneView[] = ["oklch", "oklab"];
const hidden = ref(Boolean(route.query.hidden));
const narrow = ref(Boolean(route.query.narrow));
</script>

<template>
  <div>
    <button @click="hidden = !hidden">Toggle visibility</button>
    <button @click="narrow = !narrow">Resize hosts</button>
    <div
      v-for="(view, index) in views"
      :key="view"
      :data-host="view"
      :style="{
        width: narrow ? '280px' : '760px',
        maxWidth: '100%',
        display: hidden ? 'none' : undefined,
      }"
    >
      <GamutPlane
        v-model="colors[index]!"
        :plane="view"
        :boundary-target="index === 0 ? 'srgb' : 'display-p3'"
        @update:model-value="events.changes++"
        @commit="events.commits++"
        @cancel="events.cancels++"
      />
      <output data-color>{{ JSON.stringify(colors[index]) }}</output>
    </div>
  </div>
</template>
