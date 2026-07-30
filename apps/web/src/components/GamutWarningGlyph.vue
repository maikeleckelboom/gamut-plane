<script setup lang="ts">
import { PICKER_WARNING_GLYPH_SIZE } from "@/components/planeInstrumentStyle";
</script>

<template>
  <svg
    class="gamut-warning-glyph"
    :width="PICKER_WARNING_GLYPH_SIZE"
    :height="PICKER_WARNING_GLYPH_SIZE"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden="true"
    focusable="false"
    data-gamut-warning-glyph
  >
    <path class="gamut-warning-glyph__keyline" d="M8 1.7 14.2 14H1.8L8 1.7Z" />
    <path class="gamut-warning-glyph__core" d="M8 1.7 14.2 14H1.8L8 1.7Z" />
    <path class="gamut-warning-glyph__keyline" d="M8 5.3v4.3m0 2.7v.05" />
    <path class="gamut-warning-glyph__core" d="M8 5.3v4.3m0 2.7v.05" />
  </svg>
</template>

<style scoped>
.gamut-warning-glyph {
  display: block;
  overflow: visible;
  pointer-events: none;
}

.gamut-warning-glyph path {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.gamut-warning-glyph__keyline {
  stroke: oklch(0.08 0 0 / 0.96);
  stroke-width: 3;
}

.gamut-warning-glyph__core {
  stroke: oklch(0.94 0.006 265 / 0.96);
  stroke-width: 1.1;
}
</style>
