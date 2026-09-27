# @gamut-plane/vue

A Vue component for editing one `ColorValue` in OKLCH or OKLab coordinates, with sRGB and Display P3 gamut guides. It includes the controls, Canvas renderer, styles, and generated boundary tables.

This package is private and **not published to npm**. Use the [local tarball installation instructions](https://github.com/maikeleckelboom/gamut-plane/blob/dev/README.md#install-local-packages). Vue 3.5+ is a peer dependency; core, the internal `@gamut-plane/render` and `@gamut-plane/ui` packages, and VueUse are runtime dependencies. Node.js 24+ is the supported build and server runtime.

## Usage

```vue
<script setup lang="ts">
import { ref } from "vue";
import { createColorValue } from "@gamut-plane/core";
import { GamutPlane, type ColorValue, type DisplayGamut } from "@gamut-plane/vue";
import "@gamut-plane/vue/style.css";

const initial = createColorValue({ space: "oklch", channels: [0.68, 0.18, 252], alpha: 1 });
if (!initial.ok) throw new Error("Invalid initial color");
const color = ref<ColorValue>(initial.value);
const boundaryTarget = ref<DisplayGamut>("srgb");
</script>

<template>
  <GamutPlane v-model="color" :boundary-target="boundaryTarget" />
</template>
```

## Component API

| API                          | Behavior                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `v-model`                    | Required `ColorValue`; receives live color edits                                            |
| `v-model:plane`              | Optional `GamutPlaneView` (`"oklch"` or `"oklab"`); defaults locally to `"oklch"`           |
| `boundaryTarget`             | Controlled `DisplayGamut` sampled-guide target; defaults to `"srgb"`                        |
| `showSrgbBoundary`           | Boolean prop; defaults to `true`                                                            |
| `showDisplayP3Boundary`      | Boolean prop; defaults to `true`                                                            |
| `@commit="onCommit"`         | Receives the color when an edit completes, for example to record undo history               |
| `@cancel="onCancel"`         | Reports an aborted plane gesture or discarded numeric draft, with no payload                |
| `@capability="onCapability"` | Reports `CanvasColorSpaceStatus`: `"pending"`, `"display-p3"`, `"srgb"`, or `"unavailable"` |
| `field-legend` slot          | Places host content, such as boundary visibility controls, below the field                  |

Import `DisplayGamut`, `GamutPlaneView` and `CanvasColorSpaceStatus` from the same package when needed. To control the view, initialize `ref<GamutPlaneView>("oklch")` and bind it with `v-model:plane`. View, target and visibility changes do not emit color updates or commits. Visibility props remove that gamut's field contour, accessible path, channel intervals and target-guide overlays. Exact status and the active target result remain available.

Boundary target selects the sampled-guide reference gamut. Target and visibility are independent state, but visibility controls all visual guide overlays for that gamut. Neither mutates the authored color or changes the other setting. The picker treats `within-tolerance` as visually contained; strict output policy remains separate.

The `ColorValue` definition is authoritative. Changing coordinate view only observes it; real edits produce a new value defined in the edited plane. An absent neutral hue stays absent until a Hue edit establishes a direction. The field uses a presentation-only hue slice while direction is absent; chromatic OKLCH edits wait for a real Hue edit. Edits preserve alpha, and gamut guides do not clamp the authored color to a display gamut. Use `snapshotColor` and `restoreColor` from core at serialization boundaries.

`GamutPlane` accepts an authored `ColorValue`, including ordinary extended and out-of-display-gamut coordinates, and preserves them. Its OKLCH and OKLab views require that selected value to be numerically representable in both views. Core `ColorValue` intentionally permits a wider finite coordinate domain: for pathological finite coordinates, `represent` or `projectColorToPlane` can return `numerical-range`. The instrument never silently clamps, maps, normalizes or replaces such a value; choose a representable authored value before mounting it.

Cancelling a plane drag restores its starting color. A parent replacement or view change ends the gesture without rollback; interrupted native ranges retain published values. Numeric drafts apply on completion and discard on Escape. See the [interaction lifecycle](https://github.com/maikeleckelboom/gamut-plane/blob/dev/docs/architecture.md#interaction-lifecycle) for details.

## Styling and embedding

Import `@gamut-plane/vue/style.css` once. It supplies local dark surfaces, inherits the host font, and adapts to the component's available width. The app stylesheet is not required.

Use `--gamut-plane-accent` for focus and selection emphasis:

```vue
<GamutPlane v-model="color" style="--gamut-plane-accent: oklch(0.8 0.12 180)" />
```

Internal classes and other custom properties are not a theme API. Instances have independent state and IDs. Separate Vue applications in one document should set distinct `app.config.idPrefix` values.

## Rendering and validation

Canvas may grant Display P3, fall back to sRGB, or be unavailable. The capability event describes the granted context, not the display hardware. Exact gamut status is independent of painted output. Modern CSS color support is required; without container queries, the layout stays in one column.

The normal ESM entry imports in Node without browser globals. Server output includes controls, labels, authored values, markers and SVG gamut guides. The stylesheet reserves the square field before JavaScript. Hydration retains that DOM and the authored color; it does not emit changes, commits or cancellations. Canvas capability stays `pending` until mounted initialization. Canvas painting requires JavaScript; server rasterization and a no-JavaScript interactive picker are not provided.

## SSR and Nuxt

Register the stylesheet using Nuxt's normal global CSS configuration:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  css: ["@gamut-plane/vue/style.css"],
});
```

Use the component with ordinary Vue state in a page or component:

```vue
<script setup lang="ts">
import { ref } from "vue";
import { createColorValue } from "@gamut-plane/core";
import { GamutPlane, type ColorValue } from "@gamut-plane/vue";

const initial = createColorValue({ space: "oklch", channels: [0.68, 0.18, 252], alpha: 0.37 });
if (!initial.ok) throw new Error("Invalid initial color");
const color = ref<ColorValue>(initial.value);
</script>

<template>
  <GamutPlane v-model="color" />
</template>
```

The same component supports both views and multiple instances. No client-only wrapper, custom transpilation, alias, hydration suppression or browser polyfill is required. Initialize state identically on server and client, as for any hydratable framework component. Each SSR request owns its state. IDs need to be unique within the document, not across unrelated requests.

Tested environments: Node 24.16.0, pnpm 11.9.0, Vue 3.5.39 in the standalone packed consumer, and Nuxt 4.5.2 with Vue 3.5.42 / Vue Router 5.3.1 in the SSR fixture. The fixture locks its full dependency graph and verifies development diagnostics, production SSR and `nuxt generate`. Browser checks use Playwright 1.61.1 Chromium; other engines and physical devices need separate verification. Nuxt's own runtime minimum is 24.11 within Node 24; the package's Node 24 floor is unchanged.

From the repository, run `pnpm build:packages`, `pnpm test:package` and `pnpm test:nuxt`. Both packed consumers install unpublished core, render and UI from their tarballs; registry installation is not verified. See [Testing](https://github.com/maikeleckelboom/gamut-plane/blob/dev/docs/testing.md) and [Performance](https://github.com/maikeleckelboom/gamut-plane/blob/dev/docs/performance.md).

[MIT License](LICENSE).
