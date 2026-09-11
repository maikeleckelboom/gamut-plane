# @gamut-plane/vue

A Vue component for editing one OKLCH color in OKLCH or OKLab coordinates, with sRGB and Display P3 gamut guides. It includes the controls, Canvas renderer, styles, and generated boundary tables.

This package is private and **not published to npm**. Use the [local tarball installation instructions](https://github.com/maikeleckelboom/gamut-plane/blob/dev/README.md#install-local-packages). Vue 3.5+ is a peer dependency; core and VueUse are runtime dependencies. Node.js 24+ is the supported build and server runtime.

## Usage

```vue
<script setup lang="ts">
import { ref } from "vue";
import { GamutPlane, type OklchColor } from "@gamut-plane/vue";
import "@gamut-plane/vue/style.css";

const color = ref<OklchColor>({ l: 0.68, c: 0.18, h: 252, alpha: 1 });
</script>

<template>
  <GamutPlane v-model="color" />
</template>
```

## Component API

| API                          | Behavior                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| `v-model`                    | Required `OklchColor`; receives live color edits                                            |
| `v-model:plane`              | Optional `GamutPlaneView` (`"oklch"` or `"oklab"`); defaults locally to `"oklch"`           |
| `showSrgbBoundary`           | Boolean prop; defaults to `true`                                                            |
| `showDisplayP3Boundary`      | Boolean prop; defaults to `true`                                                            |
| `@commit="onCommit"`         | Receives the color when an edit completes, for example to record undo history               |
| `@cancel="onCancel"`         | Reports an aborted plane gesture or discarded numeric draft, with no payload                |
| `@capability="onCapability"` | Reports `CanvasColorSpaceStatus`: `"pending"`, `"display-p3"`, `"srgb"`, or `"unavailable"` |
| `field-legend` slot          | Places host content, such as boundary visibility controls, below the field                  |

Import `GamutPlaneView` and `CanvasColorSpaceStatus` from the same package when needed. To control the view, initialize `ref<GamutPlaneView>("oklch")` and bind it with `v-model:plane`. View changes do not emit color updates or commits. Visibility props affect the field contours; other gamut information remains available.

The color model requires finite lightness and alpha in 0–1, nonnegative finite chroma, and finite hue. Edits preserve alpha and unedited values. Gamut guides and the bounded editing geometry do not clamp the authored color to a display gamut.

Cancelling a plane drag restores its starting color. A parent replacement or view change ends the gesture without rollback; interrupted native ranges retain published values. Numeric drafts apply on completion and discard on Escape. See the [interaction lifecycle](https://github.com/maikeleckelboom/gamut-plane/blob/dev/docs/architecture.md#interaction-lifecycle) for details.

## Styling and embedding

Import `@gamut-plane/vue/style.css` once. It supplies local dark surfaces, inherits the host font, and adapts to the component's available width. The app stylesheet is not required.

Use `--gamut-plane-accent` for focus and selection emphasis:

```vue
<GamutPlane v-model="color" style="--gamut-plane-accent: oklch(0.8 0.12 180)" />
```

Internal classes and other custom properties are not a theme API. Instances have independent state and IDs. Separate Vue applications in one document should set distinct `app.config.idPrefix` values.

## Rendering and validation

Canvas may grant Display P3, fall back to sRGB, or be unavailable. The capability event describes the granted context, not the display hardware. Exact membership is independent of painted output. Modern CSS color support is required; without container queries, the layout stays in one column.

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
import { GamutPlane, type OklchColor } from "@gamut-plane/vue";

const color = ref<OklchColor>({ l: 0.68, c: 0.18, h: 252, alpha: 0.37 });
</script>

<template>
  <GamutPlane v-model="color" />
</template>
```

The same component supports both views and multiple instances. No client-only wrapper, custom transpilation, alias, hydration suppression or browser polyfill is required. Initialize state identically on server and client, as for any hydratable framework component. Each SSR request owns its state. IDs need to be unique within the document, not across unrelated requests.

Tested environments: Node 24.16.0, pnpm 11.9.0, Vue 3.5.39 in the standalone packed consumer, and Nuxt 4.5.2 with Vue 3.5.42 / Vue Router 5.3.1 in the SSR fixture. The fixture locks its full dependency graph and verifies development diagnostics, production SSR and `nuxt generate`. Browser checks use Playwright 1.61.1 Chromium; other engines and physical devices need separate verification. Nuxt's own runtime minimum is 24.11 within Node 24; the package's Node 24 floor is unchanged.

From the repository, run `pnpm build:packages`, `pnpm test:package` and `pnpm test:nuxt`. Both packed consumers install unpublished core from its tarball; registry installation is not verified. See [Testing](https://github.com/maikeleckelboom/gamut-plane/blob/dev/docs/testing.md) and [Performance](https://github.com/maikeleckelboom/gamut-plane/blob/dev/docs/performance.md).

[MIT License](LICENSE).
