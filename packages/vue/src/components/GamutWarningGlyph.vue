<script setup lang="ts">
import { PICKER_WARNING_GLYPH_SIZE } from "@gamut-plane/render";
import { gamutWarningGlyph, gpPart } from "@gamut-plane/ui";
</script>

<template>
  <svg
    class="gamut-warning-glyph"
    :data-gp-part="gpPart.warningGlyph"
    :width="PICKER_WARNING_GLYPH_SIZE"
    :height="PICKER_WARNING_GLYPH_SIZE"
    :viewBox="gamutWarningGlyph.viewBox"
    fill="none"
    aria-hidden="true"
    focusable="false"
    data-gamut-warning-glyph
  >
    <path :d="gamutWarningGlyph.path" />
  </svg>
</template>
