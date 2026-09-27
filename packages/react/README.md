# @gamut-plane/react

A complete native React OKLCH and OKLab instrument with channel controls, numeric drafts, sampled gamut guides, a target guide and exact Display P3 status. Private, version `0.2.0`, and unpublished.

## Controlled color

```tsx
"use client";

import { useState } from "react";
import { GamutPlane, type ColorValue } from "@gamut-plane/react";
import "@gamut-plane/react/style.css";

export function ColorEditor({ initial }: { initial: ColorValue }) {
  const [color, setColor] = useState(initial);
  return <GamutPlane value={color} onValueChange={setColor} />;
}
```

The parent owns the immutable `ColorValue`; there is no `defaultValue` or uncontrolled color mode. Construct it with `createColorValue` from `@gamut-plane/core`. Every edit preserves alpha and emits a new value defined in the edited plane. View changes only observe the current definition. Defining-equal feedback reconstructed by the parent retains an active gesture without stable object identity.

Hue-less OKLCH neutrals stay hue-less until a real Hue edit establishes direction. The field's fallback hue slice is presentation only; chromatic OKLCH edits wait for that direction. Neither display-gamut membership nor the visible 0.4 chroma/disc limit clamps authored color. The Chroma numeric field supports values beyond its slider. Plane edits use core `authorPlaneEdit` and never round-trip through RGB or CSS.

`GamutPlane` accepts an authored `ColorValue`, including ordinary extended and out-of-display-gamut coordinates, and preserves them. Its OKLCH and OKLab views require that selected value to be numerically representable in both views. Core `ColorValue` intentionally permits a wider finite coordinate domain: for pathological finite coordinates, `represent` or `projectColorToPlane` can return `numerical-range`. The instrument never silently clamps, maps, normalizes or replaces such a value; choose a representable authored value before mounting it.

## Coordinate view

Initialize an internally owned view with `defaultView="oklab"`. It defaults to `"oklch"`; subsequent changes to `defaultView` do not reset it. An optional `onViewChange` reports user requests for a different view.

To control view, import `GamutPlaneView` and keep view state alongside color in the parent:

```tsx
const [view, setView] = useState<GamutPlaneView>("oklch");

<GamutPlane value={color} onValueChange={setColor} view={view} onViewChange={setView} />;
```

A supplied `view` wins over `defaultView`, even without `onViewChange`: that is read-only view state. External view changes do not call `onViewChange`. Switching view never changes, republishes or commits color. An actual view change during a plane drag cancels it once, retaining the last published color.

## Component API

| Prop                       | Type                                                        | Default / purpose                                   |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| `value`                    | `ColorValue`                                                | Required defining color                             |
| `onValueChange`            | `(value: ColorValue) => void`                               | Required edit delivery                              |
| `view`                     | `GamutPlaneView`                                            | Optional authoritative view                         |
| `defaultView`              | `GamutPlaneView`                                            | `"oklch"`; initialization only                      |
| `onViewChange`             | `(view: GamutPlaneView) => void`                            | User requests for a different view                  |
| `boundaryTarget`           | `DisplayGamut`                                              | `"srgb"`; controlled sampled-guide target           |
| `showSrgbBoundary`         | `boolean`                                                   | `true`                                              |
| `showDisplayP3Boundary`    | `boolean`                                                   | `true`                                              |
| `onValueCommit`            | `(value: ColorValue) => void`                               | Completion, after value delivery                    |
| `onCancel`                 | `() => void`                                                | Plane cancellation or discarded dirty numeric draft |
| `onCanvasColorSpaceChange` | `(status: CanvasColorSpaceStatus) => void`                  | Committed post-mount context transitions            |
| `legend`                   | `React.ReactNode`                                           | Host content beneath the field                      |
| `className`                | `string`                                                    | Merged root class                                   |
| `style`                    | `React.CSSProperties & { "--gamut-plane-accent"?: string }` | Merged root styles                                  |
| `ref`                      | Native section ref                                          | Root `<section>`                                    |

`GamutPlaneView` is `"oklch" | "oklab"`; `DisplayGamut` is `"srgb" | "display-p3"`. Both types are exported with `GamutPlane`, `GamutPlaneProps`, `ColorValue` and `CanvasColorSpaceStatus`. Internal components/controllers are private.

Root props are based on native section props, including `id`, ordinary `data-*`, appropriate ARIA descriptions and ordinary DOM event handlers. React 19's normal ref prop accepts an object or callback ref; there is no imperative handle. Internal labels, roles, reserved state attributes and geometry variables remain component-owned. Children, injected HTML, editable content and hydration suppression are not supported. Use `legend` for composition.

```tsx
const instrumentRef = useRef<HTMLElement>(null);
const [boundaryTarget, setBoundaryTarget] = useState<DisplayGamut>("srgb");

<GamutPlane
  ref={instrumentRef}
  id="brand-color"
  data-editor="brand"
  value={color}
  onValueChange={setColor}
  boundaryTarget={boundaryTarget}
  showSrgbBoundary={showSrgb}
  showDisplayP3Boundary={showP3}
  legend={<BoundaryControls />}
  className="my-picker"
  style={{ "--gamut-plane-accent": "oklch(0.8 0.12 180)" }}
/>;
```

The legend renders normally during SSR and receives no private renderer state. Hiding a boundary removes its field contour, accessible hit path, channel intervals and target-guide overlays. Exact status and the target result retain their meaning. `analyzeGamut` receives the original `ColorValue`; contours, guide values, guide swatch and target guide are sampled visualization data. The OKLab circular edit limit is not a display gamut.

Boundary target selects the sampled-guide reference gamut. Target and visibility are independent state, but visibility controls all visual guide overlays for that gamut. Neither mutates the authored color or changes the other setting. The primary Display P3 warning appears only for exact `outside` status, regardless of target; `within-tolerance` is visually contained while strict output may reject it.

Only `--gamut-plane-accent` is a supported theme property. Styles are local, inherit the host font and preserve its document palette, resets and color scheme. Available container width owns the one/two-column layout at 39em, with a usable one-column fallback. Scientific axes and ranges remain left-to-right inside an RTL host; surrounding prose inherits its direction.

## Edit callbacks

| Interaction                                             | Delivery                                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Plane drag                                              | Latest point only; at most one `onValueChange` per animation frame                                             |
| Plane pointer completion                                | Discard queued work; synchronous `onValueChange(finalValue)`, then `onValueCommit(finalValue)`                 |
| Plane keyboard edit                                     | Active core plane edit, then value change and commit                                                           |
| Plane Escape, pointer cancel or unexpected capture loss | Discard work; `onValueChange(origin)`, then `onCancel`; no commit                                              |
| Different parent color during a drag                    | Parent replacement wins; discard work and cancel once without rollback or commit                               |
| Native range input                                      | Latest value only; at most one publication per frame, no commit                                                |
| Native range change                                     | Discard work; publish the final native value synchronously, then commit                                        |
| Range pointer cancellation, capture loss or blur        | Discard unpublished work and end Hue preview; retain published values without inventing cancellation or commit |
| Numeric typing                                          | Local draft only                                                                                               |
| Valid Enter, native change or blur                      | Clamp to numeric bounds, publish and commit once; deduplicate the completion sequence                          |
| Empty/invalid numeric completion                        | Restore current authored value without an edit                                                                 |
| Dirty numeric Escape                                    | Restore draft, call `onCancel`, stop that Escape; no color edit                                                |
| Idle Escape                                             | Bubbles normally                                                                                               |
| Unmount                                                 | Discard work, listeners, capture and renderer resources silently                                               |

Numeric handling respects IME composition; external value changes reset stale drafts. Hue preview begins only after actual native pointer input on Hue and ends on completion/interruption. Other controls retain full quality. Native input and change remain distinct; React's synthetic event naming does not determine completion.

## Canvas status

`CanvasColorSpaceStatus` is `"pending" | "display-p3" | "srgb" | "unavailable"`. Server and initial client shells start pending without a render-time callback. The callback reports committed post-mount transitions; Strict Mode replay avoids repeating an unchanged result. It describes the granted Canvas context, not exact gamut membership or display hardware. Controls remain usable when Canvas is unavailable.

## SSR and Next

The ESM entry preserves `"use client"`. Use `snapshotColor` on the server and `restoreColor` in the Client Component when passing a color across the Server Component boundary; do not pass a live `ColorValue` as serialized props. Within one runtime, pass `ColorValue` directly. Import `@gamut-plane/react/style.css` through Next's normal root layout CSS mechanism.

Server HTML includes the chosen view's controls, numbers, labels, marker, SVG guides, disclosure, legend and reserved square geometry. Painting, measurement, observers and listeners begin after mount. No SSR disabling, hydration suppression, custom transpilation, alias, polyfill or manual renderer initialization is needed. Hydration and Strict Mode do not publish edits.

IDs use React `useId`. Multiple instruments in one root have unique relationships. Separate roots sharing a document must use different `identifierPrefix` values, matching between server rendering and `hydrateRoot`; see [React's useId guidance](https://react.dev/reference/react/useId#using-the-same-id-prefix-on-the-client-and-the-server).

Peers remain React / React DOM 19.3.x, tested at 19.3.0 with Next 16.3.4. Canvas bitmap rendering and interaction require client JavaScript; there is no server rasterization.

## Private artifact verification

Build and pack core, render, UI and React, then install all four tarballs with local dependency overrides using the [repository instructions](../../README.md#install-local-packages). Consumers import only this adapter and its CSS. Registry installation and npm publication are not claimed.

`pnpm test` includes React package tests. `pnpm test:react-vite` verifies isolated packed Vite consumption, accessibility and visuals. `pnpm test:next` verifies packed Next development/production hydration, prerendering and root Strict Mode. See the [coverage map](../../docs/react-parity.md) and [testing guide](../../docs/testing.md).
