# Gamut Plane

Gamut Plane is a Vue color instrument and standalone application for editing one OKLCH color through two coordinate views:

- **OKLCH:** lightness and chroma at a fixed hue.
- **OKLab:** `a` and `b` at a fixed lightness.

It shows sRGB and Display P3 guides while preserving the authored color, including alpha and out-of-gamut values. Switching views does not rewrite the color; editing never silently maps it into a display gamut.

![Gamut Plane showing OKLCH with Display P3 and sRGB boundaries](docs/assets/gamut-plane-desktop.png)

**Status:** repository packages exist but are not published to npm. **Live demo:** no verified production URL is recorded here. Deployment and publication remain separate release decisions.

## Local development

Use Node.js 24+ and the pinned pnpm 11.9.0:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

The dev command builds the packages before starting the app. Open the URL printed by Vite. The app consumes their built public entries; after editing package code, run `pnpm build:packages` again. For continuous package work, run core's `pnpm --filter @gamut-plane/core exec tsc -p tsconfig.build.json --watch` and Vue's `pnpm --filter @gamut-plane/vue exec vite build --watch` in separate terminals. A regular package build refreshes declarations too.

There is no backend, account, persistence, telemetry or runtime network dependency.

## Reusable Vue instrument

The repository API is `@gamut-plane/vue`. With the local artifacts installed, a consumer needs only:

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

Vue 3.5+ is a peer dependency. The package provides its own controls, rendering, styles and generated visual guides. Consumers need no tables, renderer settings or app stylesheet.

The view defaults locally to OKLCH. Bind `v-model:plane` to a `ref<GamutPlaneView>("oklch")` to give the parent ownership. The public types are `OklchColor`, `GamutPlaneView` (`"oklch" | "oklab"`) and `CanvasColorSpaceStatus`.

| Optional API                                | Purpose                                                                                                                                              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `showSrgbBoundary`, `showDisplayP3Boundary` | Show/hide the field contours; both default to true. Other gamut information remains available.                                                       |
| `commit(color)`                             | Observe completed color edits, for example to record undo history. Live updates already arrive through the model. View changes do not commit colors. |
| `cancel()`                                  | Observe an aborted plane gesture or discarded numeric draft; no completed edit is emitted.                                                           |
| `capability(status)`                        | Observe the granted Canvas color space or unavailability. `pending` describes the initial shell state.                                               |
| `field-legend` slot                         | Place host-owned legend or boundary controls below the field.                                                                                        |

### Install local artifacts

Nothing is available from npm yet. From this checkout:

```powershell
pnpm build:packages
pnpm --filter @gamut-plane/core pack --pack-destination C:/temp/gamut-plane-artifacts
pnpm --filter @gamut-plane/vue pack --pack-destination C:/temp/gamut-plane-artifacts
```

In an independent Vue application, add a temporary tarball override to its `pnpm-workspace.yaml` (merge with existing overrides):

```yaml
overrides:
  "@gamut-plane/core": "file:C:/temp/gamut-plane-artifacts/gamut-plane-core-0.1.0.tgz"
```

Then install the built tarballs there:

```powershell
pnpm add C:/temp/gamut-plane-artifacts/gamut-plane-core-0.1.0.tgz C:/temp/gamut-plane-artifacts/gamut-plane-vue-0.1.0.tgz
```

The override directs Vue's normal versioned core dependency to the unpublished artifact. It references a tarball, never sibling source or workspace resolution. Once both packages are released, the registry can resolve that dependency normally. The built core package is independently distributable; the component's normal usage needs no core import.

`pnpm test:package` automates this procedure in an isolated temporary consumer, including strict typechecking, production build, browser behavior, and Node import/server-render checks. See [Testing](docs/testing.md).

## Color, gamut and editing behavior

Three concepts remain separate:

1. **Authored color:** finite lightness and alpha in 0–1, nonnegative chroma and finite hue. The model is not rounded, gamut-mapped or changed on mount/view selection. Edits preserve alpha and unedited channels; explicit hue edits normalize angles.
2. **Editable geometry:** chroma up to 0.4 in the field and radius 0.4 in the OKLab disc. These are editing limits, not display gamuts. The OKLCH chroma number field can exceed the slider range.
3. **Exact gamut membership:** calculated by direct conversion to linear-light sRGB/Display P3 with core's numerical tolerance.

Contours, channel marks, intervals and the sRGB boundary projection use deterministic sampled tables. They are approximate guides, not membership tests or replacement colors. Out-of-view colors stay intact; their markers sit at the editing edge until an edit is made.

Drag the plane or use arrow keys; Shift increases the step and Home/End move to horizontal limits. Numeric fields retain drafts until Enter/change/blur and complete once. Invalid drafts restore the current value; Escape discards an unfinished draft. Escape or capture cancellation during a plane drag restores the starting color without committing. A parent replacement or view change ends the gesture without rollback. Native ranges retain already published values when interrupted. Idle Escape remains available to the host. See [Architecture](docs/architecture.md) for precise lifecycle semantics.

The demo's inspector, exact status presentation and clipboard UI stay application-specific. Copy keeps full serialized precision; RGB copy is available only inside that gamut. Clipboard failures do not show success.

## Styling and embedding

Import `@gamut-plane/vue/style.css` once. The instrument has local dark surfaces, inherits the host font, and adapts to its allocated width, including a narrow desktop panel. It needs no Tailwind, shadcn or demo CSS. It does not change document themes, generic controls or focus outside the component.

The only supported custom property is `--gamut-plane-accent`, for focus/selection emphasis:

```vue
<GamutPlane v-model="color" style="--gamut-plane-accent: oklch(0.8 0.12 180)" />
```

Multiple instances own independent state and generated IDs. For separate Vue applications on the same document, configure distinct Vue `app.config.idPrefix` values. Internal classes and custom properties are not a theme API.

## Browser and rendering notes

Canvas 2D may grant Display P3, fall back to sRGB or be unavailable. The instrument reports that result; wide-gamut painting also depends on the display. Exact membership remains independent of painted output. Without container queries the one-column base layout remains usable.

Pointer publication is coalesced per frame. Visible-axis edits reuse fields/contours; fixed-axis edits do more work. Hue dragging previews the field, then restores full quality. There is no universal frame-rate guarantee; [Performance](docs/performance.md) preserves measurements and limitations.

Packed ESM import and server-rendered shells are tested without DOM globals in Node 24, in both views with two instances. Canvas work starts on mount. Hydration and full Nuxt support are not yet verified. Browser automation uses pinned Chromium; other engines, physical devices and manual assistive-technology use require separate verification. Windows and Linux visual references are maintained separately.

## Architecture and validation

- `packages/core`: framework-neutral math and color/plane contracts; depends on `@texel/color`.
- `packages/vue`: reusable instrument, local presentation, interactions and bundled sampled data; consumes core and VueUse with Vue as a peer.
- `apps/web`: maintained public-API consumer with page shell, inspector, copy UI, metadata and deployment assets.

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm check:gamut-tables
pnpm build
pnpm check:build
pnpm test:e2e
pnpm test:production
pnpm test:package
pnpm audit --prod
git diff --check
```

[Architecture](docs/architecture.md) · [Testing](docs/testing.md) · [Performance](docs/performance.md) · [Deployment](docs/deployment.md) · [Release procedure](docs/release.md) · [Provenance](docs/provenance.md)

Regenerate tables only after changing their algorithm/settings with `pnpm --filter @gamut-plane/vue generate:gamut-tables`. Capture and inspect README/social assets with `pnpm generate:release-assets`.

Copyright © 2026 Maikel Eckelboom. [MIT License](LICENSE). See [Third-Party Notices](THIRD_PARTY_NOTICES.md).
