<script setup lang="ts">
import { PICKER_WARNING_GLYPH_SIZE } from "@gamut-plane/render";
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
    <path class="gamut-warning-glyph__keyline" d="M8 1.75 14.25 8 8 14.25 1.75 8Z" />
    <path class="gamut-warning-glyph__core" d="M8 5.15v4.15m0 2.15v.05" />
  </svg>
</template>

<style scoped>
.gamut-warning-glyph {
  display: block;
  overflow: visible;
  pointer-events: none;
}

.gamut-warning-glyph path {
  stroke-linecap: round;
  stroke-linejoin: round;
}

.gamut-warning-glyph__keyline {
  fill: oklch(0.08 0 0 / 0.96);
  stroke: oklch(0.94 0.006 265 / 0.96);
  stroke-width: 1;
}

.gamut-warning-glyph__core {
  stroke: var(--gp-status-outside, oklch(0.77 0.15 45));
  stroke-width: 1.45;
}
</style>
