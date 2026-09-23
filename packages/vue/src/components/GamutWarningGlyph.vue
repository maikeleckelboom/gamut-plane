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
    <path d="M8 1.5 14.25 13.5H1.75Z" />
  </svg>
</template>

<style scoped>
.gamut-warning-glyph {
  display: block;
  overflow: visible;
  pointer-events: none;
}

.gamut-warning-glyph path {
  stroke-linejoin: round;
  fill: var(--gp-status-outside, oklch(0.77 0.15 45));
  stroke: oklch(0.08 0 0 / 0.96);
  stroke-width: 1.25;
}
</style>
