# @gamut-plane/vue

A Vue instrument for one authored `ColorValue`. It edits or inspects OKLCH, OKLab, sRGB and Display P3, including three native RGB Areas per encoding. Exact gamut checks and sampled guides are independent requests. All six RGB Areas support both gamut boundaries and native channel intervals. This package is private and unpublished; Vue 3.5+ is a peer dependency.

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

The product explicitly admits `oklch-lc`, `oklab-ab` and all six native RGB editors: `srgb-rg`, `srgb-rb`, `srgb-gb`, `display-p3-rg`, `display-p3-rb`, `display-p3-gb`. Coordinates opens the preferred admitted editor, including choosing the current representation from an explicit observation state. Active explicit RGB Areas remain authoritative. There is no Edit / Inspect switch. Hosts can still supply `editorId: null` in state or defaultState for observation of coordinates and alpha; it is never silently coerced, and a rejected Coordinates request keeps that observation state. RGB Area uses R / G, R / B and G / B labels with informative fixed-channel options. Passive Coordinates badges use only explicitly requested accepted exact results.

The fixed channel is a full-width gradient rail with a precise numeric input; the plane channels are two side-by-side numeric input cards. Authoritative editor geometry assigns those roles: OKLCH has Hue then Lightness/Chroma, OKLab has Lightness then a/b, and RGB follows the selected Area. This deliberately changes RGB visual order from invariant R/G/B rows to fixed-first; channel identities and authoring semantics are unchanged. RGB rail bounds are normalized [0,1]; all three numbers accept every finite value with step 0.001 and display precision 4. Passive formatting does not reauthor or round a color. Edits preserve alpha and untouched observed channels. Missing Hue shows unset until authored. The same native numeric draft controller handles Enter/change/blur, Escape, stepping, controlled rejection and external replacement.

The Gamut references button opens the existing nonmodal popup grouped by gamut: each row shows its exact status (or Status off) with independent Status and Boundary checkboxes, followed by Reference (sRGB, Display P3 or None). Changes apply immediately; opening runs no analysis. The closed disclosure is one quiet row with a compact cue for explicitly checked Outside, unavailable/unchecked status or requested Paused boundaries; its accessible description retains detailed Reference meaning. A requested Boundary stays selected, marked Paused, while the current view cannot draw it. Checks, guides and Reference remain independent, and Coordinates never authors or maps the color. Checks and guides can each request zero, one, or both gamuts. Exact results display sRGB then Display P3; canonical state arrays may use a different order. A guide preference remains selected in inspection and can reappear when an editor is selected. Unavailable observation, editor, and exact facts remain distinct. Inspection retains signed zero and missing Hue, uses locale-independent nine-significant-digit formatting, and never reauthors color.

The defining `ColorValue` is authoritative. Selection and comparison changes only observe it. A deliberate edit creates a new value in the selected editor and preserves alpha. Display gamut guides do not clamp authored color. Hue-less neutrals need a real Hue edit before chromatic OKLCH editing; the numeric Chroma field can exceed the visible slider range.

## SSR and Nuxt

Register `@gamut-plane/vue/style.css` in Nuxt's normal `css` configuration. The ESM entry imports in Node without browser globals. Server output includes controls, values, marker, SVG guides when requested, and reserved field geometry. Canvas painting and observers begin after mount; hydration does not publish edits. Separate Vue applications sharing a document should use distinct `app.config.idPrefix` values. Serialize colors across process boundaries with core's `snapshotColor` and `restoreColor`.

Vue uses VueUse for mounted browser resources. The packed Vue/Vite and Nuxt fixtures verify installed private tarballs, SSR, and hydration; they do not prove registry installation. See the [repository installation guide](../../README.md#install-local-packages), [testing guide](../../docs/testing.md), and [architecture](../../docs/architecture.md).
