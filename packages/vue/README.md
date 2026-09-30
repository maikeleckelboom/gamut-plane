# @gamut-plane/vue

A Vue instrument for one authored `ColorValue`. It edits or inspects OKLCH, OKLab, sRGB and Display P3, including three native RGB Areas per encoding. Exact gamut checks and sampled guides are independent requests. RGB guide support remains deferred to Phase 2N.2. This package is private and unpublished; Vue 3.5+ is a peer dependency.

## Component API

```vue
<script setup lang="ts">
import { ref } from "vue";
import { createColorValue } from "@gamut-plane/core";
import { GamutPlane, type ColorValue, type GamutPlaneState } from "@gamut-plane/vue";
import "@gamut-plane/vue/style.css";

const initial = createColorValue({ space: "oklch", channels: [0.68, 0.18, 252], alpha: 1 });
if (!initial.ok) throw new Error("Invalid initial color");
const color = ref<ColorValue>(initial.value);
const state = ref<GamutPlaneState>({
  selection: { representationId: "oklch", editorId: "oklch-lc" },
  checkedGamuts: ["display-p3-gamut", "srgb-gamut"],
  referenceGamutId: "srgb-gamut",
  visibleGuides: ["display-p3-boundary", "srgb-boundary"],
});
</script>

<template>
  <GamutPlane v-model="color" v-model:state="state" />
</template>
```

| API                      | Purpose                                                                       |
| ------------------------ | ----------------------------------------------------------------------------- |
| `v-model`                | Required defining color; receives live edits.                                 |
| `v-model:state`          | Parent-controlled complete selection, checks, and guides.                     |
| `state`, `@update:state` | Explicit form of controlled state; without an update handler it is read-only. |
| `defaultState`           | Initializes locally owned instrument state once.                              |
| `@commit`, `@cancel`     | Edit completion and cancelled gesture/draft notifications.                    |
| `@capability`            | Granted Canvas context: `pending`, `display-p3`, `srgb`, or `unavailable`.    |
| `field-legend` slot      | Host content below the field.                                                 |

Import `GamutPlaneState`, `GamutPlaneSelection`, `GamutPlaneGamutId`, and `GamutPlaneGuideId` from the package when needed. Import the stylesheet once. It inherits the host font and adapts to available width; `--gamut-plane-accent` is the supported customization property.

The default local state selects `oklch-lc` with both exact statuses and sampled boundaries requested, with sRGB as Reference. State is a complete atomic object. A request emits a frozen canonical state and becomes visible only when the parent accepts it. An instance keeps its initial controlled or local ownership mode. Invalid IDs or shapes fail clearly. Explicit empty arrays remain empty.

The product explicitly admits `oklch-lc`, `oklab-ab` and all six native RGB editors: `srgb-rg`, `srgb-rb`, `srgb-gb`, `display-p3-rg`, `display-p3-rb`, `display-p3-gb`. Every representation allows `editorId: null` for Inspect. Coordinates chooses the destination's preferred editor, using R/G for RGB; explicit Areas remain authoritative, and Inspect → Edit returns to the preferred Area without remembering history. RGB Area uses the existing combobox with R / G, R / B and G / B labels and informative fixed-channel options. Passive Coordinates badges use explicitly requested accepted exact results, never hidden analysis.

RGB controls always follow Red, Green, Blue order. Sliders use normalized [0,1] bounds; numeric inputs accept every finite value, including overflow, with step 0.001 and display precision 4. Edits preserve the other two observed native channels and alpha. Fields and gradients keep actual encoded siblings/fixed channels without OKLCH conversion. Authored RGB markers use raw projected coordinates and may be clipped, with accessible numeric-recovery copy; cancellation and rejected edits restore that raw accepted position. RGB Boundary requests persist as Paused, and spatial Reference remains unavailable until 2N.2. Explicit exact Outside warnings remain independent of marker visibility.

The Gamuts button opens a nonmodal popup grouped by gamut: each row shows its exact status (or Status off) with independent Status and Boundary checkboxes, followed by one Reference choice (sRGB, Display P3 or None). Changes apply immediately; opening runs no analysis. The closed summary is Reference-first, for example `Reference sRGB · Outside`, with a bounded count of other checked gamuts that are Outside. A requested Boundary stays selected, marked Paused, while the current view cannot draw it. Checks and guides can each request zero, one, or both gamuts. Exact results display sRGB then Display P3; canonical state arrays may use a different order. A guide preference remains selected in inspection and can reappear when an editor is selected. Unavailable observation, editor, and exact facts remain distinct. Inspection retains signed zero and missing Hue, uses locale-independent nine-significant-digit formatting, and never reauthors color.

The defining `ColorValue` is authoritative. Selection and comparison changes only observe it. A deliberate edit creates a new value in the selected editor and preserves alpha. Display gamut guides do not clamp authored color. Hue-less neutrals need a real Hue edit before chromatic OKLCH editing; the numeric Chroma field can exceed the visible slider range.

## SSR and Nuxt

Register `@gamut-plane/vue/style.css` in Nuxt's normal `css` configuration. The ESM entry imports in Node without browser globals. Server output includes controls, values, marker, SVG guides when requested, and reserved field geometry. Canvas painting and observers begin after mount; hydration does not publish edits. Separate Vue applications sharing a document should use distinct `app.config.idPrefix` values. Serialize colors across process boundaries with core's `snapshotColor` and `restoreColor`.

Vue uses VueUse for mounted browser resources. The packed Vue/Vite and Nuxt fixtures verify installed private tarballs, SSR, and hydration; they do not prove registry installation. See the [repository installation guide](../../README.md#install-local-packages), [testing guide](../../docs/testing.md), and [architecture](../../docs/architecture.md).
