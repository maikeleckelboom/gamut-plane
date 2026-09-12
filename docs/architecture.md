# Architecture

## Layer boundaries

The standalone app imports Vue and core. Vue and React import core and the internal `@gamut-plane/render` package. Core has no dependency on any adapter or browser layer.

- `packages/core` (`@gamut-plane/core`) owns framework-neutral color types, conversion, exact gamut membership, CSS serialization/parsing, plane geometry, keyboard math, boundary search and sampled-table analysis. It has no Vue, DOM or Canvas dependency.
- `packages/render` (`@gamut-plane/render`) owns the shared Canvas renderer, its local sampling/buffer resources, generated visualization data and SVG/CSS geometry serializers. It imports core, with no Vue or React dependency.
- `packages/vue` (`@gamut-plane/vue`) owns the complete `GamutPlane` instrument, controls, component lifecycle, pointer arbitration, numeric drafts, frame scheduling, local styling and component/consumer tests.
- `packages/react` (`@gamut-plane/react`) owns a native controlled OKLCH slice, React lifecycle, pointer/keyboard interaction and its stylesheet. It has no Vue dependency. The standalone app remains Vue.
- `apps/web` consumes both public package entries. It owns the page shell, selected-color inspector, exact status presentation, boundary legend/checkboxes, clipboard feedback, metadata, social/deployment assets and application tests.

The app imports built public package entries. Its `@` alias resolves only app code. The Vue component owns its renderer.

## Distribution and public API

All packages export built ESM JavaScript and declarations from `dist`. Core, render and React use TypeScript compilation with Node-compatible relative import extensions. React's entry and component retain `"use client"`; React and its JSX runtime are external imports. Vue uses Vite library mode with Vue, VueUse, core and render external; `vue-tsc` emits declarations. Public exports restrict module access; internal declarations support adapter types without creating public subpaths.

Core is independently distributable with `@texel/color` as its one runtime dependency. Vue depends on core, render and VueUse; Vue 3.5+ is a peer, never a second bundled runtime. VueUse owns ResizeObserver, DPR tracking and scoped listener cleanup. React depends on core and render, with deliberate React / React DOM 19.3.x peers (tested 19.3.0). Each adapter retains ownership of gestures, rollback and frame scheduling.

Vue exports `GamutPlane`, `OklchColor`, `GamutPlaneView` and `CanvasColorSpaceStatus`, plus `style.css`. The component accepts a required color model, an optional plane model and two boundary-visibility props. It emits completed/cancelled edit and capability events and provides a `field-legend` slot. See the [API reference](../packages/vue/README.md#component-api). Renderer constants, table paths, preview flags and IDs are internal.

The plane model defaults locally to `oklch`; `v-model:plane` gives the parent ownership. View changes never convert or republish the authored color. Boundary props default to true. `field-legend` accepts host-owned explanatory or visibility controls without exposing renderer state. Canvas capability describes the granted context, not display hardware; `pending` is the initial shell state.

The artifacts contain built output, package metadata, README and MIT license. Core and render declare no side effects; adapters mark CSS as side-effectful so bundlers retain it. All manifests use `private: true`. Local consumers override versioned core and render dependencies with their tarballs, as shown in the [installation instructions](../README.md#install-local-packages). Registry installation is not part of this private-artifact verification.

## Styling and host ownership

`packages/vue/src/style.css` supplies local dark defaults and inherits the host font. Only `--gamut-plane-accent` is a supported customization property. Internal `--gp-*` and geometry variables are implementation details. No package rule changes document themes, body/html, generic controls or focus outside the instrument. The app's document resets, fonts and page palette stay in `app.css`.

The root owns the named inline-size container `gamut-plane`. A complete one-column base layout becomes two columns at 39em (320px field + 270px controls + 34px gap at the default font size). Enlarged text raises that threshold. Below 30em, supplementary text/readouts adapt. Host width, not viewport width, owns these decisions; without container queries the one-column layout remains usable.

Vue `useId()` supplies stable title/control IDs. Multiple instruments in one Vue application need no caller-supplied IDs. Separate Vue applications sharing a document should configure distinct `app.config.idPrefix` values.

## Server rendering

Importing any ESM entry needs no browser globals. The instrument server-renders its complete supported UI: controls, accessible labels, authored values, marker, SVG guides and a CSS-reserved field. Vite extracts CSS into the separate stylesheet export; the built JavaScript entry has no CSS import. Consumers load that stylesheet through their framework's ordinary global CSS mechanism.

Canvas context work, measurements, ResizeObserver, DPR tracking, scroll listeners and frame scheduling begin after mount. VueUse retains ownership of observer/listener cleanup. Capability is deterministically `pending` through server rendering and initial client rendering. Lifecycle setup and teardown never publish edits. Mutable color/draft/gesture/sampling/renderer state is per instance; generated lookup tables are shared visualization data.

CSS geometry serializes projected positions to eight decimal places and connector angles to ten. This presentation precision avoids hydration warnings caused by last-bit differences in transcendental math between Node and browser V8 versions. It does not change authored values, core projection/gamut math, SVG contour precision or Canvas sampling.

The independent packed Nuxt fixture verifies development diagnostics, production SSR and generated-page hydration, including retained DOM/IDs/focus/geometry, both views, out-of-gamut values, nondefault alpha, independent requests, narrow/revealed/resized hosts, route remounts, Canvas fallback and visible post-hydration painting. It uses ordinary `v-model` and global CSS; no SSR bypass is part of the package contract.

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

The render package owns checked-in tables at `packages/render/src/generated/gamutTables.ts`. Its native TypeScript generator calls the built public core entry, emits deterministic little-endian Float32 payloads and records the settings and digest. Both adapters consume this single artifact. Import decodes the payloads; it does not search or generate boundaries at startup. The React extraction preserves the payloads, settings and digest.

`pnpm check:gamut-tables` regenerates in memory and fails when the checked-in artifact is stale. After changing the algorithm or settings, run `pnpm --filter @gamut-plane/render generate:gamut-tables` and include the generated file and relevant test changes in the same commit.

## Renderer boundary

`packages/render/src/fieldRenderer.ts` owns Canvas context negotiation, drawing buffers and field invalidation keys, delegating projection and sampling math to core. Its factory is called only during each adapter's mounted/committed setup, and its synchronous `draw` introduces no extra frame queue. Each adapter owns DOM integration and frame coalescing. Disposal clears renderer references; React Strict Mode's second setup creates a fresh renderer. See [Performance](performance.md) for unchanged sampling dimensions, caching and preview behavior.

## Native React slice

`GamutPlane` requires `value` and `onChange`, with optional `onCommit`, `onCancel` and `onCapability`. The first slice supports only the OKLCH surface, labelled authored-value presentation, marker and both guides. OKLab, complete channel controls, slots, expanded theming and uncontrolled color are not implemented.

React renders pure markup, guides and hydration-safe `useId` associations. A layout effect publishes committed props to the interaction binding; abandoned renders cannot replace its callbacks or color. A separate committed effect creates renderer resources, native surface listeners, ResizeObserver, DPR media tracking and scroll/resize handling. Cleanup cancels pointer/field work, releases capture and disposes resources without emitting edits. Pure contour computation is cached by fixed axis inside the component; consumers do not need memoization.

Live pointer edits publish at most once per frame. Pointer-up discards queued work and publishes its final coordinate synchronously even when no completion callback is supplied. When present, `onCommit` receives that returned value. Escape and capture loss restore the gesture origin. Reconciliation compares all authored channels: equivalent cloned feedback/fresh callbacks preserve ownership; a differing external replacement cancels without rollback. Keyboard coordinate edits publish and complete immediately. The slice has no native range/numeric controls, so it does not conflate React `onChange` with native input completion.

The Next App Router fixture supplies serializable initial state from a Server Component to an ordinary Client Component using `useState`. The package's preserved client boundary and ordinary layout CSS import are sufficient for server HTML and hydration. A separate root Strict Mode fixture verifies repeated setup/cleanup, coalescing, external ownership and queued-work disposal through the packed public component.
