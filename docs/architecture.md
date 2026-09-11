# Architecture

## Layer boundaries

The app imports the Vue and core packages. Vue imports core; core has no dependency on either layer.

- `packages/core` (`@gamut-plane/core`) owns framework-neutral color types, conversion, exact gamut membership, CSS serialization/parsing, plane geometry, keyboard math, boundary search and sampled-table analysis. It has no Vue, DOM or Canvas dependency.
- `packages/vue` (`@gamut-plane/vue`) owns `GamutPlane`, its internal controls, Canvas/SVG rendering, pointer arbitration, numeric drafts, invalidation, local styling, generated visualization data and component/consumer tests.
- `apps/web` consumes both public package entries. It owns the page shell, selected-color inspector, exact status presentation, boundary legend/checkboxes, clipboard feedback, metadata, social/deployment assets and application tests.

The app imports built public package entries. Its `@` alias resolves only app code. The Vue component owns its renderer.

## Distribution and public API

Both packages export built ESM JavaScript and declarations from `dist`. Core uses TypeScript compilation with Node-compatible relative import extensions; Vue uses Vite library mode with `vue`, `@vueuse/core` and `@gamut-plane/core` external. `vue-tsc` emits declarations. Public exports restrict module access; internal declarations support the component type without creating public subpaths.

Core is independently distributable with `@texel/color` as its one runtime dependency. Vue depends on core and VueUse; Vue 3.5+ is a peer, never a second bundled runtime. VueUse owns ResizeObserver, DPR tracking and scoped listener cleanup. The instrument retains ownership of gestures, rollback and rendering invalidation.

Vue exports `GamutPlane`, `OklchColor`, `GamutPlaneView` and `CanvasColorSpaceStatus`, plus `style.css`. The component accepts a required color model, an optional plane model and two boundary-visibility props. It emits completed/cancelled edit and capability events and provides a `field-legend` slot. See the [API reference](../packages/vue/README.md#component-api). Renderer constants, table paths, preview flags and IDs are internal.

The plane model defaults locally to `oklch`; `v-model:plane` gives the parent ownership. View changes never convert or republish the authored color. Boundary props default to true. `field-legend` accepts host-owned explanatory or visibility controls without exposing renderer state. Canvas capability describes the granted context, not display hardware; `pending` is the initial shell state.

The artifacts contain built output, package metadata, README and MIT license. Core declares no side effects; Vue marks CSS as side-effectful so bundlers retain it. Both manifests use `private: true`. Local consumers override the packed Vue package's versioned core dependency with the core tarball, as shown in the [installation instructions](../README.md#install-local-packages).

## Styling and host ownership

`packages/vue/src/style.css` supplies local dark defaults and inherits the host font. Only `--gamut-plane-accent` is a supported customization property. Internal `--gp-*` and geometry variables are implementation details. No package rule changes document themes, body/html, generic controls or focus outside the instrument. The app's document resets, fonts and page palette stay in `app.css`.

The root owns the named inline-size container `gamut-plane`. A complete one-column base layout becomes two columns at 39em (320px field + 270px controls + 34px gap at the default font size). Enlarged text raises that threshold. Below 30em, supplementary text/readouts adapt. Host width, not viewport width, owns these decisions; without container queries the one-column layout remains usable.

Vue `useId()` supplies stable title/control IDs. Multiple instruments in one Vue application need no caller-supplied IDs. Separate Vue applications sharing a document should configure distinct `app.config.idPrefix` values.

## Server rendering

Importing either ESM entry needs no browser globals. The instrument can server-render its shell and guides; Canvas context work, observers and drawing begin on mount. Packed-consumer tests render both views with two instances in Node 24, checking unique IDs, no emitted edits and preserved authored values. Hydration and Nuxt integration have not been tested.

## Interaction lifecycle

There is one authored color in the parent. The component has temporary gesture state and numeric drafts, not a second persistent color model.

| Input or event                                               | Behavior                                                                                                                                                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plane pointer down/move                                      | One pointer owns the gesture. Store only its latest point and publish at most once per animation frame.                                                                                         |
| Pointer up                                                   | Discard the scheduled callback, publish the final point synchronously, then emit one `commit`. Subsequent capture loss is inert.                                                                |
| Pointer cancel, unexpected capture loss, active-plane Escape | Discard queued work, emit the gesture's starting color through `update:modelValue`, then `cancel`; never `commit`.                                                                              |
| Different parent color                                       | End the plane gesture without rollback, discard pending work and emit `cancel`. The parent's replacement stays authoritative.                                                                   |
| View changes during a plane gesture                          | End the gesture and discard its pending point. Retain the last published color without a commit; never reinterpret an old point through the new view.                                           |
| Plane keyboard coordinate edit                               | Publish and commit the edited value immediately.                                                                                                                                                |
| Native range input/change                                    | Coalesce live input per frame. `change` delivers the final native value and commits it. Cancellation/blur discards pending range work and ends Hue preview, retaining already published values. |
| Numeric input                                                | Hold a draft without publishing while typing. Enter, native change or blur completes a valid edit once. Bounds apply on completion; invalid/empty drafts restore the current value.             |
| Numeric Escape                                               | Discard a dirty draft without changing the color; emit `cancel`. Idle Escape bubbles to the host.                                                                                               |
| Unmount                                                      | Cancel queued pointer/range/draw work and release pointer capture. Do not publish or commit during teardown.                                                                                    |

Plane feedback is recognized by exact equality of the four authored channels with the last emitted color, so ordinary reactive or cloned `v-model` feedback retains ownership. A differing value supersedes the gesture. Identical-valued external replacements are indistinguishable from feedback through this value-only API. Parents should feed accepted updates back promptly rather than replaying delayed stale values.

`NumericInput.vue` owns drafts, validation and completion deduplication for channel and OKLab fields. `GamutPlane.vue` uses core plane unprojection for a/b edits and preserves alpha. Numeric values are not round-tripped through hex or a sampled projection.

`ColorPlane.vue` owns pointer capture and geometry. ResizeObserver updates its local size; a scoped VueUse scroll listener marks pointer bounds dirty, and the next pointer event measures them again. Mount/reveal and DPR changes schedule rendering. Escape is handled on the focused input/surface only, not by a global key listener.

The app checks native `writeText` rejection and the legacy `execCommand` boolean result before showing clipboard success. It uses VueUse for the feedback timeout. The installed VueUse clipboard helper does not expose the legacy fallback's failure result, so the app handles the write directly.

## Exact facts and visualization guides

Exact Display P3 and sRGB membership is calculated directly from the active color. It is not sampled from a contour.

Contours, crossing ticks, and the sRGB boundary projection interpolate precomputed `Float32Array` data. They approximate boundaries and must not replace direct membership checks or serialization.

## Generated tables

The Vue package owns checked-in tables at `packages/vue/src/generated/gamutTables.ts`. Its native TypeScript generator calls the built public core entry, emits deterministic little-endian Float32 payloads and records the settings and digest. Vite embeds those resources in the Vue ESM artifact. Import decodes the payloads; it does not search or generate boundaries at startup.

`pnpm check:gamut-tables` regenerates in memory and fails when the checked-in artifact is stale. After changing the algorithm or settings, run `pnpm --filter @gamut-plane/vue generate:gamut-tables` and include the generated file and relevant test changes in the same commit.

## Renderer boundary

`ColorPlane.vue` owns Canvas context negotiation, drawing buffers, invalidation keys and DOM integration, delegating projection and sampling math to core. See [Performance](performance.md) for sampling dimensions, caching, and preview behavior.
