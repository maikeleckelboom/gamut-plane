# @gamut-plane/vue

A Vue color instrument for editing one OKLCH color in OKLCH or OKLab coordinates, with sRGB and Display P3 guides. **Not yet published to npm.**

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

Requires Vue 3.5+. Vue is a peer dependency; `@gamut-plane/core` and `@vueuse/core` are external runtime dependencies. Before registry publication, install both Gamut Plane tarballs together and override the transitive core dependency to the local core tarball in the consuming package manager. The repository README gives the exact pnpm procedure. Build and validate with `pnpm build:packages` and `pnpm test:package` from the repository.

The optional `plane` model (`GamutPlaneView`: `"oklch" | "oklab"`) defaults locally to OKLCH. Bind `v-model:plane` for parent control. `showSrgbBoundary` and `showDisplayP3Boundary` default to true. `commit` reports a completed color edit; `cancel` reports an aborted plane gesture or discarded numeric draft. Plane cancellation restores the starting color; a parent replacement or view change supersedes the gesture without rollback. Native ranges retain published values when interrupted. `capability` reports `CanvasColorSpaceStatus` (`pending`, `display-p3`, `srgb`, `unavailable`). The optional `field-legend` slot places host content below the field.

Color updates preserve alpha and unedited authored values. Finite lightness/alpha must be in 0–1, chroma nonnegative, and hue finite. View changes do not rewrite the color. Sampled guides and the bounded editing geometry are separate from exact gamut membership; no automatic gamut mapping occurs.

Import the stylesheet once. It has local dark defaults, inherits the host font and accepts `--gamut-plane-accent` for focus/selection emphasis. Layout follows available component width. No document resets, Tailwind, or demo CSS are needed.

ESM import and server rendering of the shell are tested in Node.js 24 without browser globals. Canvas initializes on mount. This is not a claim of tested Nuxt integration. See the [repository documentation](https://github.com/maikeleckelboom/gamut-plane#readme) for interaction, rendering, testing, and browser limitations.

MIT licensed; see `LICENSE`.
