# Gamut Plane

Gamut Plane provides complete native Vue and React OKLCH and OKLab instruments, with sampled sRGB and Display P3 gamut guides and exact membership checks. It includes a standalone Vue app for exploring colors and copying CSS values.

**Live demo:** [gamut-plane.eckelboommaikel.workers.dev](https://gamut-plane.eckelboommaikel.workers.dev)

Both views edit the same OKLCH color:

- **OKLCH:** lightness and chroma at a fixed hue.
- **OKLab:** `a` and `b` at a fixed lightness.

Switching views preserves the color, including alpha and out-of-gamut values. Gamut membership comes from direct color conversion; the drawn boundaries are sampled guides. Editing never silently maps a color into sRGB or Display P3.

![Gamut Plane showing OKLCH with Display P3 and sRGB boundaries](docs/assets/gamut-plane-desktop.png)

The source is public under the MIT license. All workspace packages are private and **not published to npm**. Both adapters provide the complete two-view instrument with controlled color, numeric editing, gamut guides and normal SSR/hydration.

## Run the app

Use Node.js 24+ and pnpm 11.9.0, as specified in `package.json`:

```powershell
git clone --branch dev https://github.com/maikeleckelboom/gamut-plane.git
cd gamut-plane
pnpm install --frozen-lockfile
pnpm dev
```

Open the URL printed by Vite. The app runs entirely in the browser, with no backend, account, persistence, telemetry, or runtime network dependency.

`pnpm dev` builds the packages before starting the app. After changing package code, run `pnpm build:packages` again. For continuous package development, run these watchers in separate terminals after the initial build:

```powershell
pnpm --filter @gamut-plane/core exec tsc -p tsconfig.build.json --watch
pnpm --filter @gamut-plane/render exec tsc -p tsconfig.build.json --watch
pnpm --filter @gamut-plane/vue exec vite build --watch
```

The Vue watcher rebuilds JavaScript and CSS. Run `pnpm build:packages` to refresh its declarations after API changes.

## Use the Vue component

After [installing the local packages](#install-local-packages), import the component and its stylesheet:

```vue
<script setup lang="ts">
import { ref } from "vue";
import { GamutPlane, type DisplayGamut, type OklchColor } from "@gamut-plane/vue";
import "@gamut-plane/vue/style.css";

const color = ref<OklchColor>({ l: 0.68, c: 0.18, h: 252, alpha: 1 });
const boundaryTarget = ref<DisplayGamut>("srgb");
</script>

<template>
  <GamutPlane v-model="color" :boundary-target="boundaryTarget" />
</template>
```

Vue 3.5+ is required. The component includes its controls, renderer, styles, and gamut tables. It inherits the host font and adapts to its available width. Import the stylesheet once; use `--gamut-plane-accent` to customize focus and selection emphasis.

The view defaults to OKLCH. Bind `v-model:plane` to a `ref<GamutPlaneView>("oklch")` to control it from the parent. `boundaryTarget` accepts the exported `DisplayGamut` type and defaults to `"srgb"`. Boundary visibility props, edit events, Canvas capability reporting, and the `field-legend` slot are documented in the [Vue package README](packages/vue/README.md).

## Use the React component

```tsx
import { useState } from "react";
import { GamutPlane, type OklchColor } from "@gamut-plane/react";
import "@gamut-plane/react/style.css";

export function ColorEditor() {
  const [color, setColor] = useState<OklchColor>({ l: 0.68, c: 0.18, h: 252, alpha: 1 });
  return (
    <GamutPlane
      value={color}
      onValueChange={setColor}
      defaultView="oklab"
      boundaryTarget="display-p3"
    />
  );
}
```

React / React DOM 19.3.x are the pinned peer policy. Color is controlled-only; view can be controlled with `view` / `onViewChange` or initialized with `defaultView`. Boundary target is a controlled prop and defaults to sRGB. The [React API](packages/react/README.md) documents native section props/ref, `legend`, target/visibility, callback ordering, CSS and Next usage. The [parity map](docs/react-parity.md) connects product contracts to tests.

### Install local packages

From this checkout, build and pack the Vue adapter and its private dependencies into a temporary directory:

```powershell
$artifacts = Join-Path $env:TEMP "gamut-plane-artifacts"
New-Item -ItemType Directory -Force -Path $artifacts
pnpm build:packages
pnpm --filter @gamut-plane/core pack --pack-destination $artifacts
pnpm --filter @gamut-plane/render pack --pack-destination $artifacts
pnpm --filter @gamut-plane/vue pack --pack-destination $artifacts
```

Copy the tarballs into an `artifacts` directory in your Vue application. Add this override to that application's `pnpm-workspace.yaml`, merging it with any existing overrides:

```yaml
overrides:
  "@gamut-plane/core": "file:./artifacts/gamut-plane-core-0.1.0.tgz"
  "@gamut-plane/render": "file:./artifacts/gamut-plane-render-0.1.0.tgz"
```

Then install them from the application root:

```powershell
pnpm add ./artifacts/gamut-plane-core-0.1.0.tgz ./artifacts/gamut-plane-render-0.1.0.tgz ./artifacts/gamut-plane-vue-0.1.0.tgz
```

The overrides resolve all unpublished transitive dependencies from their local artifacts. `pnpm test:package` exercises this installation in an isolated Vue consumer. For React, pack/install `@gamut-plane/react` instead of Vue, keeping both dependency tarballs and overrides. `pnpm test:react-vite` verifies ordinary React consumption; `pnpm test:next` verifies Next App Router and root Strict Mode. These checks do not verify registry installation. For framework-independent color math, see [the core package](packages/core/README.md).

## Color and editing behavior

The solid contour shows Display P3; the dashed contour shows sRGB. Contours, channel marks, boundary-guide colors and the selected target projection interpolate generated tables. Exact inside/outside status uses direct conversion to linear-light RGB with a small numerical tolerance.

Boundary target selects the projection/reference gamut. Boundary visibility selects which ordinary sampled guide layers are drawn across the plane and channel controls. Neither changes the target automatically or mutates the authored color. Exact membership for both gamuts and the primary Display P3 warning remain independent of both controls. An active target projection can remain visible when that target's ordinary guide layer is hidden.

The field's chroma limit and OKLab disc radius are both 0.4. These define the editing geometry, not either display gamut. The OKLCH chroma number field can exceed the slider range. Colors outside the visible geometry keep their values, with the marker projected to the edge.

Drag the plane or use arrow keys. Shift increases the step; Home and End move to horizontal limits. Numeric fields apply a draft on Enter or blur and discard it on Escape. Escape during a plane drag restores its starting color. Edits preserve alpha and unedited channels. See [the interaction contract](docs/architecture.md#interaction-lifecycle) for cancellation and parent-update behavior.

The app's inspector copies full-precision CSS values. RGB copy is available only when the color is inside that gamut; clipboard failures do not show success.

## Browser and rendering limits

- Canvas 2D may grant Display P3, fall back to sRGB, or be unavailable. The component reports the granted context. Visible wide-gamut color also depends on the display; exact membership does not.
- Modern CSS color support is required. Without container queries, the component keeps its one-column layout.
- Pointer updates are coalesced per frame. Visible-axis edits reuse the field and contours; fixed-axis edits redraw them. Hue dragging uses a lower-resolution preview. See [performance measurements and limits](docs/performance.md).
- The normal ESM entry supports SSR and hydration. Controls, authored values, markers, SVG gamut guides and CSS field geometry render on the server; Canvas painting starts after mount. `pnpm test:nuxt` verifies the packed package in Nuxt development, production SSR and generated pages. See [Vue SSR usage](packages/vue/README.md#ssr-and-nuxt).
- Browser automation uses pinned Chromium with Windows and Linux visual references. Other engines, physical devices, and manual assistive-technology use have not been verified.

## Repository guide

| Location          | Contents                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `packages/core`   | Framework-neutral color math, gamut membership, serialization, and plane geometry                |
| `packages/render` | Internal shared Canvas renderer, SVG/CSS geometry serialization and generated tables             |
| `packages/vue`    | Complete Vue component, lifecycle, controls, interactions and styles                             |
| `packages/react`  | Complete native React instrument, private controls/controllers and packed Vite/Next verification |
| `apps/web`        | Standalone app, inspector, clipboard UI, and deployment assets                                   |

[Architecture](docs/architecture.md) explains package boundaries and interaction contracts. [Testing](docs/testing.md) covers local checks, browser setup, snapshots, and packed consumption. The [release runbook](docs/release.md) contains the full clean-checkout gate and promotion sequence; [deployment](docs/deployment.md) covers Cloudflare Workers Static Assets and Workers Builds.

Copyright © 2026 Maikel Eckelboom. [MIT License](LICENSE). See [Provenance](docs/provenance.md) and [Third-Party Notices](THIRD_PARTY_NOTICES.md).
