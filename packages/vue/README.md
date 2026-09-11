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

ESM import and server-rendered shells are tested in Node.js 24 without browser globals. Canvas initializes on mount. Hydration and Nuxt integration have not been tested. Browser checks use pinned Chromium; other engines and physical devices need separate verification.

From the repository, run `pnpm build:packages` to build both packages and `pnpm test:package` to test an isolated tarball consumer. See [Testing](https://github.com/maikeleckelboom/gamut-plane/blob/dev/docs/testing.md) and [Performance](https://github.com/maikeleckelboom/gamut-plane/blob/dev/docs/performance.md).

[MIT License](LICENSE).
