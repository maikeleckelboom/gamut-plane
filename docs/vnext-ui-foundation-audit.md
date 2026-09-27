# vNext UI foundation audit (Phase 1A)

Status: implementation plan, 2026-09-27. This document describes the clean `dev` tree at
`b899e1d00f55b37e7def95af29a8868cce5b1c90` (`chore(tooling): centralize oxc configuration`).
Local `main` was `bfdd4aa5b42b4b434fcc59e549062d149aca4fbe`, the released v0.3 baseline.
The current private package manifests still carry version `0.2.0`; extraction does not change versions.
No `@gamut-plane/ui` package or canonical part contract exists in this baseline. The direction is
[ADR 0002](decisions/0002-vnext-instrument-architecture.md); the current two-plane semantics are
[ADR 0001](decisions/0001-coordinate-plane-projections.md). This is an extraction plan, not a
decision to redesign the instrument or generalize its color model.

## Scope and evidence

The audit covers the root workspace/configuration and CI, `packages/core`, `packages/render`, both
adapter source trees and their unit/browser/packed consumers, and the standalone web app. It uses
current source and tests, plus [architecture](architecture.md), [testing](testing.md),
[React parity](react-parity.md), and [SSR validation](ssr-hydration-validation.md). No browser suite
was run for this documentation-only pass. The proposed parity gates below are work for Phase 1B;
existing test coverage is evidence of a contract, not proof that two current DOM trees or pixels
are identical.

`docs/react-parity.md` retains a `BoundaryDetails.tsx` source listing, but that file is absent from
the current React source tree; both current instruments render the always-visible target result.
The source and tests, rather than that historical listing, govern the anatomy below.

The first extraction milestone preserves current OKLCH/OKLab views, singular `boundaryTarget`,
independent sRGB/Display P3 guide flags, target result, slot/legend, and visual appearance as closely
as practical. It must preserve authored `ColorValue`, exact gamut facts, sampled visual guides,
explicit edits, and the current adapter public component/style entries. Popover layout, more color
spaces, gamut sets, and output redesign come later.

## Current ownership and package boundary

| Owner                 | Current authority and evidence                                                                                                                                                                                                                                                                                                             | Extraction judgment                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `@gamut-plane/core`   | `src/color/value.ts`, `src/color/represent.ts`, `src/gamut/analyze.ts`, `src/output/*`, and `src/picker/{edit,geometry,keyboard,plane,analysis}.ts` own authorship, observation, exact status, serialization, numeric sampling, coordinate constraints, and `authorPlaneEdit`. `src/index.ts` exports these without DOM or framework code. | Correct boundary. Do not move color truth, plane math, gamut analysis, or generated-guide interpolation into UI.                            |
| `@gamut-plane/render` | `src/fieldRenderer.ts` owns Canvas negotiation, buffers, sampling/cache keys, quality and disposal; `src/generated/gamutTables.ts` is one visualization artifact. `src/geometry.ts` serializes SVG paths and hydration-stable positions.                                                                                                   | Keep renderer, tables, contour/field serializers here. Pure UI presentation currently in render can move later without changing algorithms. |
| Vue adapter           | `src/components/GamutPlane.vue` assembles the product and edits; `ColorPlane.vue` owns pointer, DOM, frame and VueUse lifecycle; `ColorChannelControl.vue` owns range lifecycle and channel markup; `NumericInput.vue` owns drafts. `src/style.css` is its authored stylesheet.                                                            | Retain Vue component API/reactivity/lifecycle. Share proven presentation, parts, styles and controller policy.                              |
| React adapter         | `src/GamutPlane.tsx` assembles controlled color/view and edits; `components/ColorPlane.tsx` mounts `interaction/planeInteraction.ts`; `ColorChannelControl.tsx` mounts `interaction/rangeInteraction.ts`; `NumericInput.tsx` manages drafts. `src/style.css` is another authored stylesheet.                                               | Retain React props/hooks/committed ownership and JSX. Existing DOM controllers are useful extraction seeds.                                 |
| Web app               | `apps/web/src/App.vue`, `colorPresentation.ts`, `app.css` own the page, inspector, output/copy behavior and boundary controls around public Vue.                                                                                                                                                                                           | Do not absorb its page composition during the v0.3-preserving extraction.                                                                   |

`package.json` and `pnpm-workspace.yaml` use pnpm 11.9.0, Node 24+, and workspace packages under
`packages/*`. The root `build:packages` order is core, render, Vue, React; any future UI dependency
must be inserted between render and adapters. Root `.oxfmtrc.json` and `.oxlintrc.json` are the
single Oxc policies. The package tsconfigs build `dist` ESM/declarations; Vue uses Vite library CSS
extraction (`packages/vue/vite.config.ts`), while React uses `tsc` plus
`packages/react/scripts/prepareBuild.ts` to copy CSS. `.github/workflows/ci.yml` has static/unit,
browser/visual/packed, and packed SSR jobs. The future package must join that graph without adding
package-local formatter/linter policy.

The proposed dependency direction is adapters → UI (and existing core/render), UI → core/render
only for proven pure inputs, render → core. Render must not import UI, and UI must have no
Vue/React/Svelte runtime dependency; this prevents a presentation extraction from creating a
render/UI cycle.

### Render files: current versus eventual owner

| File                                   | Actual responsibility                                                                                                                                                              | Long-term classification / Phase 1B action                                                                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `render/src/fieldRenderer.ts`          | Browser Canvas context and fallback, offscreen buffers, numeric field drawing, cache invalidation and quality.                                                                     | Rendering/resource concern. Keep in render; mount/dispose still occur in adapter lifecycle.                                                                                                                                     |
| `render/src/geometry.ts`               | `Float32Array` contour to SVG path, eight-decimal point style, `VIEWBOX_SIZE`.                                                                                                     | Render serialization. Keep its fixed precision; no UI move required.                                                                                                                                                            |
| `render/src/boundaryPresentation.ts`   | Reads core's sampled tables and exact status separately; filters visible intervals and creates the outside-only target-guide point/marker. Also supplies UI labels and marker CSS. | Mixed visual geometry and UI presentation. Keep table interpolation in render; a later UI model may consume its outputs/own labels. No mechanical Phase 1B move.                                                                |
| `render/src/pickerPresentation.ts`     | Observes both planes and analyzes original `ColorValue`; composes gradients, marker CSS, status, target-result strings and user help for both adapters.                            | Mixed color-derived visualization and UI view model. Keep exact analysis/projections and visual sampling authoritative in core/render; evaluate moving only the final display/copy layer after the canonical anatomy is proven. |
| `render/src/pickerWarningPlacement.ts` | Pure planar/slider collision and edge placement in CSS pixels.                                                                                                                     | UI presentation geometry; a credible eventual UI owner. Phase 1B can leave it in render to avoid churn.                                                                                                                         |
| `render/src/channelGeometry.ts`        | Merges sampled intervals, finds thresholds, and calls warning placement with measured track width.                                                                                 | UI presentation geometry, already shared. Moving it is optional and separate from CSS parity.                                                                                                                                   |
| `render/src/planeInstrumentStyle.ts`   | Pixel constants for marker/glyph/slider dimensions consumed by adapters and warning geometry.                                                                                      | UI visual geometry, likely future UI owner alongside canonical style. If moved, preserve numeric values and dependency direction; do not change placement math in that commit.                                                  |
| `render/src/presentation.ts`           | Generates sampled CSS gradients and hydration-stable target connectors.                                                                                                            | Gradient sampling can stay render; connector/style projection is a possible later UI seam. Preserve serialization precision.                                                                                                    |
| `render/src/index.ts`                  | Current internal package export surface used by both adapters.                                                                                                                     | Audit imports before any move; avoid publishing helpers just because the UI package uses them.                                                                                                                                  |

## Vue ↔ React anatomy and duplication map

Both adapters construct the same two-plane product, but React split several Vue template sections
into private components. In the table, `=` means the present semantic behavior and markup role
correspond; `≈` marks structural or lifecycle differences that need a parity assertion. The
recommended owner refers to the _future common contract or styling_, not necessarily a shared DOM
renderer. Vue paths below are under `packages/vue/src/components`; React paths are under
`packages/react/src`.

| Concept                         | Vue implementation                                                    | React implementation                                                                       | Equivalence / actual difference                                                                                                                  | Future owner                                                  |
| ------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Instrument root/title           | `GamutPlane.vue` `.plane-instrument`, `section`, hidden `h2`          | `GamutPlane.tsx` `.gamut-plane-react`, same elements                                       | `=`; `useId()` in each framework; React additionally merges safe section props/ref/style                                                         | UI part/style; adapter owns IDs and public root integration   |
| Coordinate selector/options     | `GamutPlane.vue` `.plane-instrument__view-control` and radio buttons  | `components/CoordinateViewControl.tsx` `.gpr-plane-instrument-view-control`                | `=` roles, roving tab stop, arrow wrap/focus; Vue `defineModel`, React controlled/default view                                                   | UI anatomy/selection semantics; adapter state/focus refs      |
| Workspace, field, controls      | `GamutPlane.vue` three `plane-instrument__*` wrappers                 | `GamutPlane.tsx` three `gpr-plane-instrument-*` wrappers                                   | `=` layout roles; names only in CSS                                                                                                              | UI parts/style                                                |
| Field/plane wrapper and surface | `ColorPlane.vue` `.color-plane`, `.color-plane__surface`              | `components/ColorPlane.tsx` `.gpr-color-plane`, `.gpr-color-plane-surface`                 | `=` square surface/`role="application"`/tab stop; Vue template listeners versus React mounted native listeners                                   | UI parts/style and shared gesture policy; adapter lifecycle   |
| Canvas and render status        | `ColorPlane.vue` `canvas`, `.color-plane__render-mode`                | `components/ColorPlane.tsx` `canvas`, `.gpr-color-plane-render-mode`                       | `=` canvas hidden from AT, pending SSR shell, fallback notice; mounted setup differs                                                             | Render resource; UI notice part/style                         |
| Editable disc                   | `ColorPlane.vue` `.color-plane__domain-boundary`                      | `components/ColorPlane.tsx` `.gpr-color-plane-domain-boundary`                             | `=` only in OKLab, distinct from RGB gamut; CSS names only                                                                                       | Core geometry, UI part/style                                  |
| SVG guides and hits             | `ColorPlane.vue` `.color-plane__gamut`, visible and hit paths/circle  | `components/ColorPlane.tsx` `.gpr-color-plane-gamut` and equivalents                       | `=` P3 solid, sRGB dashed, labelled hit geometry; conditional template/JSX                                                                       | Render path data; UI parts/style/accessible labels            |
| Selected marker                 | `ColorPlane.vue` `.color-plane__marker--active`                       | `components/ColorPlane.tsx` `.gpr-color-plane-marker--active`                              | `=` opaque marker and `data-marker-role`; position from shared serializer                                                                        | UI part/style; render position                                |
| Target guide/connector          | `ColorPlane.vue` target marker/connector classes                      | `components/ColorPlane.tsx` matching `gpr-*` classes                                       | `=` conditional outside-only sampled guide; connector from render                                                                                | UI parts/style; render geometry                               |
| Planar warning/glyph            | `ColorPlane.vue` warning span; `GamutWarningGlyph.vue` SVG/scoped CSS | `components/ColorPlane.tsx` warning span; `components/GamutWarningGlyph.tsx` SVG/React CSS | `≈` same path/size/hidden semantics, but Vue glyph CSS is component-scoped and React glyph CSS is in package sheet; visibility mechanisms differ | UI icon geometry/part/style                                   |
| Axes                            | `ColorPlane.vue` two `.color-plane__axis` spans                       | `components/ColorPlane.tsx` two `.gpr-color-plane-axis` spans                              | `=` labels from core plane descriptor, same orientation                                                                                          | Core axis data; UI parts/style                                |
| Channel row/header              | `ColorChannelControl.vue` `.channel-control`, header/label            | `components/ColorChannelControl.tsx` `.gpr-channel-control`, header/label                  | `=` native label/numeric/range arrangement; React has required props where Vue uses defaults                                                     | UI parts/style; adapter render props                          |
| Native range/track field        | `ColorChannelControl.vue` track, gradient field, range input          | `components/ColorChannelControl.tsx` same                                                  | `≈` same native input/change intent, but controller/reconciliation implementations differ                                                        | UI range controller/parts/style; adapter lifecycle            |
| Sampled intervals/markers       | `ColorChannelControl.vue` gamut ranges, hidden marker labels, preview | `components/ColorChannelControl.tsx` same                                                  | `=` output of shared `channelGeometry`; conditional DOM syntax differs                                                                           | Render sampled data; UI parts/style                           |
| Linear warning                  | `ColorChannelControl.vue` warning span and `GamutWarningGlyph`        | `components/ColorChannelControl.tsx` same                                                  | `≈` same shared placement; Vue `v-show`, React inline `display`; same visual purpose                                                             | UI part/style/state                                           |
| Numeric inputs                  | `NumericInput.vue` in channel and a/b fields                          | `components/NumericInput.tsx` in both                                                      | `≈` local draft/Enter/change/blur/Escape intent; IME guard differs (below)                                                                       | Probably shared draft policy after tests; adapter DOM binding |
| OKLab coordinate readout        | `GamutPlane.vue` `.plane-instrument__coordinate-readout`              | `GamutPlane.tsx` `.gpr-plane-instrument-coordinate-readout`                                | `=` labels, a/b inputs and disc help                                                                                                             | UI part/style; core edit                                      |
| Target result                   | `GamutPlane.vue` `.plane-instrument__target-result`                   | `components/BoundaryTargetResult.tsx` `.gpr-plane-instrument-target-result`                | `=` same exact status versus sampled C/ΔC/swatch; component split only                                                                           | UI view model/parts/style                                     |
| Legend insertion                | Vue `field-legend` slot after `ColorPlane` inside field               | React `legend` node at same position                                                       | `=` host-owned content; API syntax is framework-specific                                                                                         | UI host part; adapter slot/prop                               |
| Screen-reader text/focus        | Vue `.sr-only`, scoped glyph, `data-pointer-focus`                    | React `.gpr-sr-only`, sheet glyph, `data-pointer-focus`                                    | `≈` same surface/range focus intent; CSS selector names differ, React has some explicit `dir="ltr"`                                              | UI CSS/semantics; adapter IDs/focus setup                     |

This is substantial authored duplication, not a claim of byte-identical HTML. The two adapter
stylesheets have 631 and 643 lines. An in-memory line comparison replaced only corresponding
class-name prefixes (`.plane-instrument`/`.gamut-plane-react`, `__`/`gpr-*` part spellings) before
`difflib.SequenceMatcher`: 628 lines aligned, ratio 0.9859. That number is **supporting evidence
only**: it counts repeated blank/property lines, leaves container-name differences intact, and does
not parse CSS or establish browser equivalence. The meaningful CSS differences are enumerated next.

## CSS duplication, tokens, and one-sheet strategy

`packages/vue/src/style.css` and `packages/react/src/style.css` align rule-for-rule for root
box-sizing/reset, view controls, field/surface/Canvas/SVG/domain/markers, axes, channel rows,
numeric/range controls, target result, focus-visible treatment, forced colors, RTL coordinate
direction, and the 39em/30em named-container queries. The current selectors depend on divergent
class spellings, so simply copying one sheet to the other package would leave one adapter unstyled.
Root container names also differ (`gamut-plane` versus `gamut-plane-react`) to keep both sheets
isolated. The React file includes 12 additional lines for the warning glyph that Vue keeps in
`GamutWarningGlyph.vue`'s scoped style. One `:has(...:focus-visible...)` selector is formatted
differently; it is the same condition. Vue's scoped glyph fill has an explicit fallback while the
React rule uses `var(--gp-status-outside)`; both roots define that variable. There is no evidence of
a framework-required _visual_ rule. Preserve scoped behavior by moving the glyph rule under the
canonical root/part selectors, with the same effective v0.3 value.

The duplicated root palette in both adapter sheets is exact: `--gp-foreground`, `--gp-quiet`,
`--gp-surface-0..3`, `--gp-hairline`, `--gp-user-accent`, `--gp-status-outside`, and
`--gp-cv-font-mono`. Both also define `--picker-plane-axis-space` (24px, 19px under 30em) and
`--picker-plane-max-size` (520px), plus per-control `--picker-*` placement variables supplied by
`ColorPlane`/`ColorChannelControl`. The only documented consumer customization hook is
`--gamut-plane-accent`; `--gp-*` and `--picker-*` are internal. Preserve that public distinction in
Phase 1B. `--cv-font-mono` is currently inherited from the app, but its instrument fallback is
local. The UI stylesheet should own one set of semantic instrument defaults with these exact
values: foreground, muted text, four surfaces, border, focus/accent, outside status, mono font,
control geometry and responsive layout. Keep dynamic marker/gradient/placement values as typed
per-instance inline CSS variables; they are not theme tokens. Do not introduce Open Props or a
house-style dependency. Later first-party themes may bridge semantic hooks, but exposing new
public customization variables needs its own API review.

`apps/web/src/app.css` independently defines matching palette literals as page-level
`--foreground`, `--quiet`, `--surface-0..3`, `--hairline`, `--user-accent`, `--status-outside`,
and `--cv-font-mono`; it also has app-only `--status-inside`, global font/reset, clipboard and
inspector styling. The same values explain present visual continuity, but the page tokens do not
become instrument dependencies. The app alone overrides instrument geometry at wide viewport
height (`--picker-plane-max-size` in `app.css`); retain this integration behavior during the
extraction and test it. A later house-style bridge can map page tokens to deliberate Gamut Plane
semantic hooks without changing the self-contained defaults.

### CSS distribution choice

**Use one authored `packages/ui/src/style.css`, then copy/build its compiled CSS to each adapter's
existing `dist/style.css` export.** Generated tarballs may contain identical CSS bytes; the source
must have only one author. Vue's Vite library build currently extracts CSS from the
`GamutPlane.vue` import to `dist/style.css`; React's `prepareBuild.ts` copies its source sheet.
Phase 1B should replace both paths with an explicit deterministic copy/compile from UI after the
UI build, and ensure Vue does not also re-extract a second source/import. Assert adapter output
bytes match the canonical built sheet (or document a deterministic transform if necessary). Keep
`./style.css` in both adapter `exports` and `sideEffects: ["**/*.css"]`.

| Option                                                            | Compatibility judgment                                                                                                                                                                                                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adapter `./style.css` containing self-contained generated CSS     | Recommended. Existing Vite, Nuxt `css: ["@gamut-plane/vue/style.css"]`, React Vite import, and Next layout import need no consumer migration or transitive CSS resolver behavior. The packed tarball already asserts `dist/style.css` exists. |
| Adapter CSS containing only `@import "@gamut-plane/ui/style.css"` | One tiny adapter file, but shifts resolution and CSS import ordering to Vite/Nuxt/Next and their CSS pipelines; the UI tarball must always be installed and exported. Do not use as the default without all four packed consumer proofs.      |
| Consumers import `@gamut-plane/ui/style.css` directly             | Breaks current adapter stylesheet ergonomics and makes every consumer know an internal package; not the first extraction milestone.                                                                                                           |
| Runtime JS imports UI CSS                                         | Risks Next/global CSS and Node SSR behavior. Current built JS entries are explicitly checked for no CSS import; keep that separation.                                                                                                         |

The private UI package may expose its built style subpath for internal build tooling, but that does
not establish a new consumer-facing import requirement. Update `scripts/packedConsumer.mts` and the
Vue/React packed runners to include/override/byte-check the new UI tarball in the dependency graph.
Check that the CSS is present in each adapter artifact, retained by Vite and Next, loaded before
scripts in Nuxt/Next hydration, and scoped to `[data-gp-root]` when both adapters coexist.

## Proposed shared UI authority and framework boundary

| Candidate                                                                                                           | Recommendation                                                                                             | Reason                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Part names and a small state-attribute vocabulary                                                                   | **Definitely UI**, private constants/types first                                                           | Prevent selector drift and make structural parity testable without coupling to classes. Do not export as public API merely for internal reuse.                                                                                                                                                                                               |
| One authored CSS and semantic instrument token defaults                                                             | **Definitely UI**                                                                                          | Current sheets are nearly identical, and ADR 0002 requires one self-contained visual authority.                                                                                                                                                                                                                                              |
| Warning glyph path/viewBox and other proven icon geometry                                                           | **Definitely UI**                                                                                          | Both warning components repeat `M8 1.5 14.25 13.5H1.75Z` with `viewBox="0 0 16 16"`. Share immutable path/geometry; adapters render native SVG; UI CSS owns paint. No runtime DOM renderer for one icon.                                                                                                                                     |
| Selection, warning, target-result labels, accessible instructions and display-only view models                      | **Probably UI**, extract where duplication remains after using render's current `createPickerPresentation` | The two root/plane components repeat label and markup composition, while numeric/color truth already has a shared owner. Avoid moving render's sampler or exact analysis just to enlarge UI.                                                                                                                                                 |
| Range native input/change and gesture policy                                                                        | **Definitely UI candidate**, after parity tests                                                            | `react/src/interaction/rangeInteraction.ts` imports no React and models publication, completion and interruption; Vue duplicates it in `ColorChannelControl.vue`. Use it as the seed, preserving native semantics.                                                                                                                           |
| Plane pointer controller                                                                                            | **Probably UI**, split only after tests                                                                    | React `planeInteraction.ts` is DOM-based, but currently also owns Canvas creation, ResizeObserver, DPR and field RAF. Extract gesture arbitration/geometry/publication ports; keep renderer resources in render and framework mount integrations in adapters. Do not transplant the whole file unchanged.                                    |
| Numeric draft controller                                                                                            | **Probably UI after behavior decision**                                                                    | Vue `NumericInput.vue` and React `NumericInput.tsx` each duplicate dirty/revision, validity, bounds, deduplication and restoration. Their IME behavior differs; first add a shared event-matrix test and decide the canonical behavior. The current framework-owned native input implementation can remain for the first CSS/part milestone. |
| Warning/slider collision geometry and instrument pixel constants                                                    | **Probably UI**, no urgent move                                                                            | Already shared in render; relocating is ownership cleanup, not prerequisite for one style authority. Keep CSS numbers and placement calculations synchronized if moved.                                                                                                                                                                      |
| `ColorValue`, representation catalog, exact gamut status, coordinate constraints, sampled tables, Canvas algorithms | **Elsewhere: core/render**                                                                                 | ADR 0001/0002 separate authored truth from sampled visualization and rendering resources.                                                                                                                                                                                                                                                    |

Adapters must retain Vue refs/computed/watch/`defineModel`, React hooks/controlled props/`useCommitted`,
native template/JSX rendering, event emissions/callback signatures, `useId()` associations, focus
element refs, and mount/unmount/SSR integration. React's `useCommitted.ts` protects mounted native
listeners from abandoned renders and fresh callback replacement; Vue's synchronous watchers and
VueUse scopes express different framework contracts. VueUse's existing `useResizeObserver`,
`useDevicePixelRatio`, and `useEventListener` are appropriate generic Vue mechanics, not domain
gesture policy. The shared UI controller may accept current committed inputs and lifecycle ports,
but should not own a React hook, a Vue composable, or a second authored color.

## Interaction responsibility map and observed gaps

| Responsibility                                              | Current Vue / React implementation                                                                        | Classification and Phase 1B direction                                                                                                                                                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One pointer, capture, point conversion, movement coalescing | `ColorPlane.vue` local pointer/RAF/bounds; `interaction/planeInteraction.ts` `down/move/schedule/point`   | DOM-specific, framework-neutral gesture policy. Split React controller around a committed-input port and apply to Vue only after exact feedback tests.                                                                                                    |
| Final synchronous publication and commit                    | Vue `finishPointer`/`emitLivePoint`; React `up`/`publish`                                                 | Shared policy; preserve final native pointer position and `change` before commit, even with queued RAF.                                                                                                                                                   |
| Escape, pointer cancel, capture loss, rollback              | Vue `cancelInteraction`; React `cancel`                                                                   | Shared gesture policy using original `ColorValue`; no global Escape listener. Release capture and silently dispose.                                                                                                                                       |
| Parent replacement and view interruption                    | Vue synchronous `watch` with `definingEquals`; React `reconcile()` after committed props                  | Shared comparison/transition semantics; adapter controls _when_ the current value/view becomes authoritative. Distinct definitions cancel without rollback; actual view change cancels, keeping last published color.                                     |
| Plane keyboard                                              | Both call core `keyboardPlanePoint` and `authorPlaneEdit`                                                 | Core owns point/edit math; UI may share key-to-action mapping and accessible instructions; adapter handles focused DOM event.                                                                                                                             |
| Native range input/change/pointer interruption              | Vue `ColorChannelControl.vue`; React `interaction/rangeInteraction.ts`                                    | DOM-neutral controller candidate. Keep latest frame, synchronous `change`, Hue preview and published-value restoration. Vue/React reconciliation difference below needs a test first.                                                                     |
| Numeric draft/IME/completion                                | Vue `NumericInput.vue`; React `NumericInput.tsx`                                                          | UI policy candidate, adapter binding and framework scheduling remain. Do not normalize behavior before parity evidence.                                                                                                                                   |
| Frame scheduling                                            | Both adapters schedule pointer/field/range frames; `fieldRenderer.draw()` is synchronous                  | Gesture/range scheduling can be shared; renderer invalidation key remains render; lifecycle start/cancel remains adapter integration.                                                                                                                     |
| Field invalidation                                          | Vue watches plane/fixed axis/preview/DPR; React `fieldInput` and `reconcile()`                            | Renderer decides sampled cache key; adapters trigger draw from committed/reactive inputs. A common input equality helper is optional, not a new color authority.                                                                                          |
| ResizeObserver, DPR, scroll/geometry invalidation           | VueUse in `ColorPlane.vue`/`ColorChannelControl.vue`; native observer/media/listeners in React controller | Generic browser mechanics with framework lifecycle. Preserve actual DPR, remeasure on reveal/resize, dirty bounds on capture-phase scroll, and cleanup. A shared lower-level DOM measurement helper is possible; do not force a common lifecycle library. |

Two source-level parity gaps require explicit tests and a small product decision before sharing
their controller paths:

1. `NumericInput.tsx` tracks `compositionstart`/`compositionend` and suppresses **all** completion
   while composing, including native `change`/blur; `NumericInput.vue` only ignores a keydown whose
   `event.isComposing` is true. A `change`/blur during composition can therefore complete in Vue.
   React's behavior has a direct test in `react/test/numericInput.test.tsx`; the Vue tests do not
   establish the same event sequence. Favor a composition-safe canonical policy after browser
   evidence; do not alter v0.3 behavior silently in the stylesheet/part commit.
2. React's `rangeInteraction.ts` `reconcile()` interrupts pending input when parent feedback differs
   from the last published value. Vue's `ColorChannelControl.vue` watcher updates
   `lastPublishedRangeValue` only when no value is pending and does not clear a pending frame on
   external replacement. A stale queued frame may therefore publish over a replacement in Vue.
   Existing Vue range tests cover blur/cancel/normal completion, while React has a differing external
   Hue test. Add a controlled-parent queued-frame parity test, then reconcile toward parent authority
   in a separate behavior commit if confirmed.

These are observed implementation differences with plausible behavioral consequences, not claims
that a browser regression was reproduced during this audit. Other structural differences (Vue
`v-show` versus React inline `display`, Vue scoped icon CSS, explicit React `dir="ltr"`) are
framework mechanics or selector/markup differences with presently matching intent; verify pixels,
computed direction and accessibility before declaring them equivalent.

## Accessibility and SSR/hydration constraints

Current semantics to preserve: a section labelled by a hidden `h2`; horizontal `radiogroup` with
radio buttons, roving `tabindex` and arrow navigation; a focused two-coordinate
`role="application"` surface with current-axis label and keyboard instructions; labelled native
ranges and numeric spinbuttons with help/warning `aria-describedby`; an SVG guide group with
labelled hit paths; decorative warning spans/glyphs hidden from AT; labelled selected and target
markers; exact target status text. Only the focused plane handles gesture Escape; dirty numeric
Escape is local and idle Escape reaches the host. Root/plane/range focus-visible styles use
`data-pointer-focus` to avoid a pointer focus ring. Keep the current `role="application"` contract
during extraction; manual screen-reader evaluation is a separate acceptance task. Add explicit
association/keyboard/axe parity tests, not a silent semantics redesign. A concern to track is
the IME gap above, not a reason to replace native inputs wholesale.

`GamutPlane.vue` and `GamutPlane.tsx` use framework `useId()` for title/control associations.
Distinct Vue app roots require distinct Vue `idPrefix`; separate React roots require matching
server/client `identifierPrefix`. Both server-render complete buttons, ranges, numeric values,
SVG guides, markers, target result and legend host. Capability starts `pending`; Canvas,
measurement, observers, media queries and listeners start only after mount/commit. React's
`useCommitted` and Strict Mode disposal prevent abandoned renders/stale callbacks and lifecycle
emissions. `render/src/geometry.ts` uses eight decimal places for CSS positions and
`render/src/presentation.ts` ten for connector angle; do not round authored `ColorValue`, change
those serializers, or introduce nondeterministic IDs/DOM order. CSS reserves a square field before
hydration and must load with the server document.

Highest-risk Phase 1B changes are changing the root/selector structure that controls square field
geometry, changing Vue's scoped icon CSS extraction, replacing JavaScript-free adapter CSS with a
transitive `@import`, moving client resources into render-time UI models, and altering React's
committed-prop handoff. Gate with the packed Nuxt delayed-script development/production/generated
tests and packed Next development/production/prerendered/root Strict Mode tests in addition to
Vite consumers. Assert retained node identities, ID relationships, focus/input values, field
dimensions, no hydration diagnostics, no lifecycle edits, and resource cleanup.

## Proposed canonical v0.3 part and state contract

Root: `<section data-gp-root data-gp-view="oklch|oklab">`. The following private
`data-gp-part` vocabulary describes semantic/style-bearing nodes, not every wrapper. The table
maps current CSS spellings; existing `data-*` test hooks may coexist through extraction. Use
native descendants/roles where they already express selection/definition rather than inventing
another part. `field-legend`/`legend` content remains host-owned inside the named host.

| Proposed part                                                       | Current Vue selector/component                                               | Current React selector/component                                                   |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `view-control`, `view-option`                                       | `plane-instrument__view-control`, radio buttons in `GamutPlane.vue`          | `gpr-plane-instrument-view-control`, `CoordinateViewControl.tsx` radio buttons     |
| `workspace`, `field`, `controls`                                    | `plane-instrument__workspace/field/controls`                                 | `gpr-plane-instrument-workspace/field/controls`                                    |
| `plane`, `surface`, `canvas`                                        | `color-plane`, `color-plane__surface`, Canvas in `ColorPlane.vue`            | `gpr-color-plane`, `gpr-color-plane-surface`, Canvas in `ColorPlane.tsx`           |
| `domain-boundary`, `gamut-guides`, `gamut-boundary`, `boundary-hit` | `color-plane__domain-boundary/gamut/boundary/boundary-hit`                   | corresponding `gpr-color-plane-*` classes                                          |
| `marker`, `guide-connector`                                         | `color-plane__marker`, `color-plane__target-guide-connector`                 | `gpr-color-plane-marker`, `gpr-color-plane-target-guide-connector`                 |
| `warning`, `warning-glyph`                                          | `color-plane__warning` / `channel-control__warning`, `GamutWarningGlyph.vue` | matching `gpr-*` warning classes, `GamutWarningGlyph.tsx`                          |
| `axis`, `render-status`                                             | `color-plane__axis`, `color-plane__render-mode`                              | `gpr-color-plane-axis`, `gpr-color-plane-render-mode`                              |
| `channel`, `channel-header`, `numeric-input`                        | `channel-control`, `channel-control__header/number`, a/b `NumericInput.vue`  | `gpr-channel-control`, `gpr-channel-control-header/number`, a/b `NumericInput.tsx` |
| `channel-track`, `channel-field`, `native-range`                    | `channel-control__track/field/range`                                         | matching `gpr-channel-control-*`                                                   |
| `gamut-interval`, `boundary-preview`                                | `channel-control__gamut-range/boundary-preview`                              | matching `gpr-channel-control-*`                                                   |
| `coordinate-readout`                                                | `plane-instrument__coordinate-readout`                                       | `gpr-plane-instrument-coordinate-readout`                                          |
| `target-result`, `target-heading`, `target-swatch`                  | `plane-instrument__target-result/target-heading/target-swatch`               | matching `gpr-plane-instrument-*`, `BoundaryTargetResult.tsx`                      |

The `field` part is also the legend insertion host: both adapters insert host content directly
after the plane there. Do not add a separate legend wrapper merely to mark a slot. Likewise,
`gamut-interval` represents each meaningful sampled interval, not its purely positioning parent.
Use a small set of orthogonal state/data attributes: root `data-gp-view`; gamut-bearing nodes
`data-gp-gamut="srgb|display-p3"`; marker `data-gp-marker="active|target-guide"`; axes
`data-gp-axis="x|y"`; channel `data-gp-channel="h|l|c"`; exact target result
`data-gp-status="inside|within-tolerance|outside"`; `data-gp-warning="true|false"` and
`data-gp-overflow="true|false"` where styled; pointer-focused surface/range
`data-gp-pointer-focus`. Keep native `aria-checked` and `disabled` as their own canonical states
rather than duplicating them. A future gamut set needs a separate contract; do not encode the
current two names into part names. Scope CSS under `[data-gp-root]` and these parts/states, with
no framework classes, global document rules, or consumer theme dependency. Preserve existing
external `data-*` hooks until tests/consumers are intentionally migrated.

## App-owned presentation classification

| Current source                                                                                                                         | Classification for later product work                                                                               | Phase 1B disposition                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `App.vue` `project-header`, `app-shell`, `instrument-layout`; `app.css` fonts, document reset, responsive page layout, metadata/assets | Page shell/demo presentation                                                                                        | Stay in app. The app's wide `100cqh` instrument-size override is an integration regression case.           |
| `GamutPlane` `field-legend` content: target radios, independent guide checkboxes and key                                               | Likely future compact instrument capability, with deeper choices progressively disclosed under ADR 0002             | Remain host legend for v0.3 parity; do not move now.                                                       |
| Inspector coordinate summary and exact sRGB/P3 status                                                                                  | Concise authored-color/status may become compact capability; detailed coordinates/status likely advanced inspection | Remain app-owned; exact facts still come from core, not sampled paths.                                     |
| Inspector OKLCH/Hex/sRGB/Display P3 rows, strict output rejection and boundary-preview swatches                                        | Output choices may become compact capability; full matrix/precision is likely advanced inspector                    | Remain app-owned. `colorPresentation.ts` display rounding never changes copied source text or color truth. |
| Clipboard fallback, copied state/announcement, Canvas capability fact                                                                  | Copy likely product capability; detailed capability/debug fact is app/demo inspection                               | Remain app-owned. Preserve failed-copy and focus restoration behavior.                                     |
| CSS boundary-key legend styling                                                                                                        | Demo/host presentation tied to current checkbox UI                                                                  | Remain app-owned until actual compact design.                                                              |

## Phase 1B parity evidence and gates

1. **Structural contract:** Add one deterministic DOM assertion suite per adapter using the same
   fixture/state table. Assert required part counts/order, view-specific conditional parts,
   `data-gp-*` values, legacy test hooks, labelled relationships, and absence of CSS-dependent
   extra wrappers. Do not compare full HTML snapshots or framework-generated ID strings.
2. **Behavior:** Reuse/extend `packages/vue/test/{pickerInteraction,instrumentHost,linearControl,planeInstrument}.test.ts`,
   `packages/react/test/{planeInteraction,rangeInteraction,numericInput,publicApi}.test.tsx`,
   shared core/render tests and both adapters' packed embedding/rendering/accessibility suites.
   Add paired cases for queued input plus parent replacement, IME `change`/blur, view change during
   capture, final pointer/range publication before commit, defining-equal cloned feedback, numeric
   draft restoration, guide visibility versus target, and focused Escape. Count callback/event
   order, not just final color. Assert exact status from core and sampled overlays separately.
3. **Visual:** Existing full-page app references in `apps/web/e2e/visual.spec.ts` and four React
   instrument references in `packages/react/e2e/parity.spec.ts` use different hosts/state setups;
   they are not a direct pair. Add a minimal Vue packed instrument screenshot fixture matching
   React's isolated host (or a common test harness loading both public tarballs) with the same
   font, width, color definition, view, guide flags, target, DPR 1, dark scheme and reduced motion.
   Assert Canvas capability/paint and stable layout before capture; compare the **instrument root**
   at fixed dimensions on each supported platform, alongside each adapter's preserved v0.3
   references. Required states: OKLCH baseline `[0.5,0.2,0.5]`; OKLab baseline; outside sRGB but
   inside P3 `[0.68,0.18,252]`; outside both `[0.62,0.52,45]`; each guide hidden/both shown;
   target changed with guide visibility independent; target marker/connector and slider preview;
   340px host, 623/624/625px threshold, and 200% text. These status examples were checked with
   `analyzeGamut` on the baseline built core; assert the status in the fixture so later core
   changes cannot silently repurpose a visual state. Record inspected differences, not a new
   tolerance chosen to make parity pass. Do not update current baselines without review.
4. **Accessibility/responsiveness:** For both public packed fixtures assert role/name/description,
   keyboard route and visible focus, scientific LTR behavior in RTL hosts, 280–800px containment,
   39em/30em container behavior, enlarged text, and no serious/critical axe findings. Manual
   screen-reader assessment remains separately necessary.
5. **Packaging/SSR:** Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
   `pnpm build`, `pnpm check:build`, `pnpm test:e2e`, `pnpm test:production`, `pnpm test:package`,
   `pnpm test:react-vite`, `pnpm test:nuxt`, and `pnpm test:next` on the stable extraction tree.
   Inspect UI/Vue/React tarball manifests, export targets, CSS bytes/side effects, dependency
   graph and installed artifact bytes. Verify Vue Vite, React Vite, Nuxt and Next load styles from
   existing public adapter paths, including server document before scripts. Keep the root Strict
   Mode resource-count/no-emission gate. Run `pnpm check:gamut-tables` to prove unchanged generated
   visualization data. CI's three jobs must pass on the exact Phase 1B commit before design work.

## Ordered Phase 1B migration sequence

Each row is a separately reviewable commit or checkpoint on `dev`. Run the narrow stated gate
first, then the full gate once the stable extraction tree is complete. Do not combine part/style
migration with gesture reconciliation, numeric IME changes, renderer moves, or new product layout.

| Step                                                                    | Changes / explicit hold                                                                                                                                                                                                                                                                                                                           | Main files and principal risk                                                                                                                               | Gate                                                                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1. Freeze comparable v0.3 evidence                                      | Add fixture/state definitions and structural/visual baseline capture instructions; no production changes, no baseline updates by default. Confirm exact status fixtures.                                                                                                                                                                          | Vue/React packed e2e fixtures/tests; risk of comparing unlike host fonts/sizes                                                                              | Existing packed browser checks and inspected screenshots/status assertions                                              |
| 2. Create private UI package skeleton                                   | Add `packages/ui` manifest, tsconfig/build and private part/type constants, with dependency order. No components or runtime behavior; no public API promise.                                                                                                                                                                                      | `packages/ui/*`, root `build:packages`, root workspace lock/config as needed; risk of broken build/pack topology                                            | UI type/build, root format/lint/typecheck, pack file inventory                                                          |
| 3. Define canonical parts on **both** adapters in a small markup commit | Add proposed root/part/state attributes while retaining old classes, DOM order and existing data hooks. Do not alter CSS/gestures. If separate adapter commits are needed, first commit temporary test coverage then finish both before visual judgment.                                                                                          | Vue templates, React JSX, part contract tests; risk of SSR attribute or focus/slot drift                                                                    | Component structural tests, server render smoke, focused keyboard/axe checks                                            |
| 4. Author canonical sheet and migrate Vue                               | Normalize selectors to parts, preserve v0.3 declarations/tokens/container thresholds, route Vue build to copy UI's built CSS to its existing `dist/style.css`, and remove Vue's old authored sheet/scoped glyph paint once the Vue output works. React stays on its current sheet for this checkpoint. Do not change app layout.                  | `ui/src/style.css`, Vue build/source import/glyph, Vue packing; risk of selector specificity, Vite CSS extraction, scoped glyph, focus and responsive drift | Compare Vue computed styles/screenshots to its v0.3 reference; Vue Vite and Nuxt packed gates, CSS tarball/export check |
| 5. Migrate React and finish one-sheet authority                         | Route React build to the same UI CSS bytes, remove React's old authored sheet, retain both adapter `./style.css` exports and include UI in the packed dependency graph. No consumer import changes.                                                                                                                                               | React `prepareBuild.ts`, manifest/packed scripts; risk of Next CSS loading, duplicate/missing CSS and cross-adapter cascade                                 | Assert adapter CSS byte equality; React Vite and Next packed gates, cross-adapter visual parity and co-import check     |
| 6. Share icon geometry and pure residual UI models                      | Move SVG path/viewBox and clearly duplicated labels/part metadata to private UI modules; adapters still render SVG natively. Leave core/render calculations where they are.                                                                                                                                                                       | Glyph components, optional UI model; risk of SVG/scoped-style or accessible-name drift                                                                      | Glyph/marker/axe tests and warning screenshot                                                                           |
| 7. Resolve and extract range logic, separately                          | First add queued-frame external replacement parity tests; decide canonical parent-authority behavior, then seed shared DOM-neutral range controller from React and bind Vue/React with lifecycle ports. Do not touch plane gesture or numeric draft in this commit.                                                                               | `react/interaction/rangeInteraction.ts`, Vue channel control, UI controller; risk of native input/change order and Hue endpoint/preview                     | Both focused range suites repeated, packed all-range behavior, view-interruption test                                   |
| 8. Decide numeric and plane-controller follow-up independently          | Add paired IME event test; if behavior needs reconciliation, make a dedicated change. Extract numeric draft only once canonical behavior is tested. Split React plane interaction from renderer/observer ownership before binding Vue; defer if parity cannot be proved without broad rewrite. Do not force these into the style-delivery commit. | Numeric components, plane interaction, VueUse/React lifecycle; risk of rollback/Strict Mode/hydration                                                       | Focused draft/pointer/parent-feedback suites, Nuxt/Next SSR/Strict Mode and packed browser gates                        |
| 9. Certify stable tree                                                  | Confirm adapter-authored CSS is gone, adapter `./style.css` exports remain, and no temporary transition aliases/artifacts remain. Review complete diff, then run all stable-tree gates listed above. No screenshot, generated-table or app layout updates without separately explained evidence.                                                  | CSS/build inventory and CI packaging checks; risk of a hidden second author or missing tarball asset                                                        | Exact final CSS source inventory, full parity and CI gate                                                               |

The UI package can be useful after step 5 even if step 8's harder controller extraction is
deferred: one part/style authority is the first safe milestone, while adapters remain
responsible for their proven lifecycle. Do not combine step 7 with step 8, or either with steps
3–5. Do not move `pickerPresentation.ts`, generated data, or `fieldRenderer.ts` during this
sequence merely to make package diagrams look simpler.

## Non-goals, risks, and decisions left open

No new popover, product layout, extra adapter, color space, gamut set, `ColorValue` or
`boundaryTarget` change, renderer algorithm, screenshot baseline update, Open Props, Zag,
third-party dependency, or public UI API is proposed here. ADR 0002 already accepts the direction;
no new ADR is required for the extraction audit.

Open before/within Phase 1B: confirm the canonical IME completion rule with browser evidence;
confirm external range replacement under a queued frame; verify exact CSS output equivalence
across Vite/Next and the effect of co-importing both adapter sheets; determine whether
warning/slider geometry moves only after shared stylesheet parity. Later redesign must separately
decide progressive disclosure, gamut-set
and representation APIs, semantic theme hook expansion, and any headless primitive adoption.
