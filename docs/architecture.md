# Architecture

This document describes the v0.3 product-semantic baseline and the completed Phase 1B shared UI foundation. [ADR 0002](decisions/0002-vnext-instrument-architecture.md) records the accepted direction. The [Phase 1B foundation record](ui-foundation-phase-1b.md) documents that work. Phase 2A's [product capability model](vnext-product-capability-model.md) and [ADR 0003](decisions/0003-vnext-product-capability-model.md) define the capability and state boundaries. Phase 2B adds immutable internal core definitions in `packages/core/src/capabilities/` for existing representations, channels, primary editors, semantic edit operations and geometries. Phase 2C consumes editor/geometry definitions through render-owned field and guide support. Phase 2D adds shared UI metadata and current product admission consumed by both adapters. Phase 2E adds the internal generalized product-state policy. Phase 2F adds owner-local scoped core/render resolution alongside the frozen legacy presentation. Phase 2G integrates generalized resolution internally; Phase 2H.1/2H.2 certify the accepted presentation view and Phase 2H.3 makes it production authority. Public adapter APIs and v0.3 presentation remain unchanged; public generalized APIs and visual redesign remain future work.

## Layer boundaries

The standalone app imports Vue and core. Vue and React import core, the internal `@gamut-plane/render` package, and the private framework-neutral `@gamut-plane/ui` package. Core has no dependency on any adapter or browser layer.

- `packages/core` (`@gamut-plane/core`) owns ColorValue authorship and observation, exact gamut analysis, CSS input/output policy, plane geometry, keyboard math, boundary search and sampled-guide interpolation. It has no Vue, DOM or Canvas dependency.
- `packages/render` (`@gamut-plane/render`) owns the shared Canvas renderer, its local sampling/buffer resources, generated visualization data, SVG/CSS geometry serializers and shared pure warning/channel placement. It imports core, with no Vue or React dependency.
- `packages/ui` (`@gamut-plane/ui`) owns current representation labels, primary admission/order, editor companion composition, ordinary control labels/bounds/steps/precision, canonical semantic instrument parts/states, authored v0.3 stylesheet, shared warning glyph geometry, native range/numeric policies and one plane pointer gesture controller. Its controllers are DOM-specific but have no module-evaluation DOM access. UI has a declared core dependency for type-only capability relationships; emitted runtime JavaScript has no core, render or framework import. It is not a supported consumer API.
- UI also owns pure generalized selection, checked-gamut and requested-guide state validation. Guide IDs stay render-owned and enter the generic UI policy as a supplied ID family at adapter composition; UI has no render dependency. Accepted state is frozen, serializable IDs and arrays, with no authored color or directional destination.
- `packages/vue` (`@gamut-plane/vue`) owns the complete `GamutPlane` instrument, controls, component lifecycle, pointer capture, geometry measurement, presentation, keyboard/focus integration, Canvas resources, numeric markup and product events.
- `packages/react` (`@gamut-plane/react`) owns the complete native React instrument: composition, controlled color integration, view ownership, pointer capture, geometry measurement, presentation, keyboard/focus integration, Canvas/environment resources and committed-prop integration. It has no Vue dependency. The standalone app remains Vue.
- `apps/web` consumes both public package entries. It owns the page shell, selected-color inspector, exact status presentation, boundary legend/checkboxes, clipboard feedback, metadata, social/deployment assets and application tests.

The app imports built public package entries. Its `@` alias resolves only app code. The Vue component owns its renderer.

## Distribution and public API

All packages export built ESM JavaScript and declarations from `dist`. Core, render, UI and React use TypeScript compilation with Node-compatible relative import extensions. React's entry and component retain `"use client"`; React and its JSX runtime are external imports. Vue uses Vite library mode with Vue, VueUse, core, render and UI external; `vue-tsc` emits declarations. Public adapter exports restrict module access; internal declarations support adapter types without creating public subpaths.

Core additionally declares `@gamut-plane/core/internal/capabilities`, built from `packages/core/src/capabilities/index.ts`. This is an **unsupported internal sibling-package contract**, not a consumer API or installation entry. Its original runtime exports are `editorDefinitions` and `geometryDefinitions`, with their `EditorDefinition`, `EditorId`, `GeometryDefinition`, `GeometryId` types. Phase 2D adds only the types `RepresentationDefinition`, `ChannelDefinition`, `ChannelId`, `EditOperationDefinition` and `EditOperationId` for UI's correlated metadata contracts. Render imports this declared package subpath at runtime; UI uses `import type`; core's root remains unchanged. The entry and its declarations require no DOM types or browser globals and are checked in an isolated packed core consumer. Adapter tarball tests resolve the transitive core artifact through ordinary package exports. Representation/channel and edit-operation runtime catalogs remain owner-local.

Phase 2F added the core-owned `GamutCheckResult` type. Phase 2G additionally exports the existing
`analyzeRequestedGamuts` function from that same unsupported entry. Render declares its matching
`internal/capabilities` entry with exactly `guideDefinitions`, `resolveEditorVisualSupport`,
`resolveField`, `resolveRequestedGuides` and directly related types. Packed Vue, React/Vite,
Nuxt and Next graphs compile these entries with ES-only libraries and execute them in Node.
Root exports remain unchanged. Neither UI nor render acquires a reverse dependency.

Core is independently distributable with `@texel/color` as its one runtime dependency. Vue depends on core, render, UI and VueUse; Vue 3.5+ is a peer, never a second bundled runtime. VueUse owns ResizeObserver, DPR tracking and scoped scroll-listener cleanup outside the shared gesture. React depends on core, render and UI, with deliberate React / React DOM 19.3.x peers (tested 19.3.0). Each adapter retains lifecycle and resource integration; UI owns native range, numeric-draft and plane pointer policy.

Vue exports `GamutPlane`, `ColorValue`, `GamutPlaneView` and `CanvasColorSpaceStatus`, plus `style.css`. React exports the same selected-color type. Each component accepts a required defining color value; changing view observes it, while edits author a new value in that plane. See the [Vue API reference](../packages/vue/README.md#component-api) and [React API reference](../packages/react/README.md#component-api). Renderer constants, table paths, preview flags and IDs are internal.

The plane model defaults locally to `oklch`; `v-model:plane` gives the parent ownership. View changes never convert or republish the authored color. Boundary props default to true. `field-legend` accepts host-owned explanatory or visibility controls without exposing renderer state. Canvas capability describes the granted context, not display hardware; `pending` is the initial shell state.

The artifacts contain built output, package metadata, README and MIT license. Core and render declare no side effects; UI and adapters mark CSS as side-effectful so bundlers retain it. All manifests use `private: true`. Local consumers override versioned private dependencies with their tarballs, as shown in the [installation instructions](../README.md#install-local-packages). Registry installation is not part of this private-artifact verification.

## Styling and host ownership

`packages/ui/src/instrumentMetadata.ts` describes four representation labels and exactly two
current primary choices, ordered OKLCH then OKLab. `editorUi` contains frozen ordered companion
tuples: Hue/Lightness/Chroma for `oklch-lc`, fixed Lightness/a/b for `oklab-ab`. Both adapters bind
these rows to their existing native markup; no generic renderer or executor is introduced.
Hue range and number reference `oklch-hue-edit`; OKLCH L/C reference `oklch-channel-patch`;
OKLab L references `oklab-channel-patch`; a/b reference `oklab-disc-coordinate`. Numeric Chroma
has no maximum, while its slider spans 0–0.4. These are UI policies, not ColorValue validity.
The adapters retain their existing normalization, coordinate-helper/point authorship, Hue
references, dynamic render facts and lifecycle. Channel/operation keys preserve semantic identity.

UI's `currentEditorByView` is the current product bridge. Render retains its bounded internal
bridge to avoid a reverse UI dependency or signature churn; a cross-package test requires the
two to agree. Metadata existence does not admit RGB to the selector. There is no new selection,
checked-gamut or guide-array public adapter API and no availability behavior change. The internal
`instrumentState.ts` policy validates all four representation selections, admitted editor pairs,
checked gamut sets and requested guide sets independently. `selectionFromCurrentView` converts
the two legacy views; `legacyCheckedGamuts` records current unconditional exact checks. Existing
guide booleans map through render's owned guide IDs at composition; `boundaryTarget` stays outside
ordinary view state. Defaults are initialization-only and adapters still own request acceptance.
Direct metadata, state and type tests, the same native composition suite in both adapters, and
packed declaration/runtime checks
cover this boundary; existing structural, screenshot, accessibility and hydration gates remain.

`packages/ui/src/style.css` is the only authored instrument stylesheet. Adapter builds copy its built bytes to their own `dist/style.css`; consumers retain `@gamut-plane/vue/style.css` or `@gamut-plane/react/style.css`. It supplies the accepted local dark defaults and inherits the host font. Only `--gamut-plane-accent` is a supported customization property. Internal `--gp-*` and geometry variables are implementation details. Shared selectors are scoped to `[data-gp-root]`. No package rule changes document themes, body/html, generic controls or focus outside the instrument. Scientific surfaces/ranges explicitly retain left-to-right coordinate direction in RTL hosts. The app's document resets, fonts and page palette stay in `app.css`.

The root owns the named inline-size container `gamut-plane`. A complete one-column base layout becomes two columns at 39em (320px field + 270px controls + 34px gap at the default font size). Enlarged text raises that threshold. Below 30em, supplementary text/readouts adapt. Host width, not viewport width, owns these decisions; without container queries the one-column layout remains usable.

Vue and React `useId()` supply stable title/control IDs within their respective roots. Separate Vue applications sharing a document should configure distinct `app.config.idPrefix` values. Separate React roots use distinct `identifierPrefix` values, with the same prefix on the server and during hydration.

## Server rendering

Importing any ESM entry needs no browser globals. The instrument server-renders its complete supported UI: controls, accessible labels, authored values, marker, SVG guides and a CSS-reserved field. UI builds the canonical CSS file; adapter builds copy it into each separate stylesheet export. The built JavaScript entry has no CSS import. Consumers load their adapter stylesheet through their framework's ordinary global CSS mechanism.

Canvas context work, measurements, ResizeObserver, DPR tracking, scroll listeners and frame scheduling begin after mount. VueUse retains ownership of observer/listener cleanup. Capability is deterministically `pending` through server rendering and initial client rendering. Lifecycle setup and teardown never publish edits. Mutable color/draft/gesture/sampling/renderer state is per instance; generated lookup tables are shared visualization data.

CSS geometry serializes projected positions to eight decimal places and connector angles to ten. This presentation precision avoids hydration warnings caused by last-bit differences in transcendental math between Node and browser V8 versions. It does not change authored values, core projection/gamut math, SVG contour precision or Canvas sampling.

The independent packed Nuxt fixture verifies development diagnostics, production SSR and generated-page hydration, including retained DOM/IDs/focus/geometry, both views, out-of-gamut values, nondefault alpha, independent requests, narrow/revealed/resized hosts, route remounts, Canvas fallback and visible post-hydration painting. It uses ordinary `v-model` and global CSS; no SSR bypass is part of the package contract.

## Interaction lifecycle

There is one authored color in the parent. The component has temporary gesture state and numeric drafts, not a second persistent color model.

| Input or event                                               | Behavior                                                                                                                                                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plane pointer down/move                                      | One pointer owns the gesture. Store only its latest point and publish at most once per animation frame.                                                                                                                                     |
| Pointer up                                                   | Discard the scheduled callback, publish the final point synchronously, then emit one `commit`. Subsequent capture loss is inert.                                                                                                            |
| Pointer cancel, unexpected capture loss, active-plane Escape | Discard queued work, emit the gesture's starting color through `update:modelValue`, then `cancel`; never `commit`.                                                                                                                          |
| Different parent color                                       | End the plane gesture without rollback, discard pending work and emit `cancel`. The parent's replacement stays authoritative.                                                                                                               |
| View changes during a plane gesture                          | End the gesture and discard its pending point. Retain the last published color without a commit; never reinterpret an old point through the new view.                                                                                       |
| Plane keyboard coordinate edit                               | Publish and commit the edited value immediately.                                                                                                                                                                                            |
| Native range input/change                                    | UI coalesces live input per frame. `change` cancels pending work, reads the final native value and lets the adapter publish live color before commit. Cancellation/blur discards pending work and restores the last published native value. |
| Range parent feedback                                        | Expected feedback, including Hue 360 normalized to 0, preserves native preview. A different authored value interrupts pending/active work, wins over stale input and ends reported pointer preview once.                                    |
| Numeric input                                                | Native number input holds the draft without publishing while typing. Enter, native change or blur completes a valid edit once outside IME composition. Bounds apply on completion; invalid/empty drafts restore current formatting.         |
| Numeric Escape                                               | Discard a dirty draft without changing the color; emit `cancel`. Idle Escape bubbles to the host. Active composition suppresses numeric Enter/Escape/change/blur; composition end itself does not complete.                                 |
| Unmount                                                      | Cancel queued pointer/range/draw work and release pointer capture. Shared plane, range and numeric disposal invoke no consumer callbacks. The product resets Hue preview on view change.                                                    |

Plane feedback uses `definingEquals`, so a separately constructed value with the same defining space, channels and alpha acknowledges the gesture. A different definition supersedes it even if its observed color matches. Parents should feed accepted updates back promptly rather than replaying delayed stale values.

`packages/ui/src/interaction/numericInteraction.ts` owns the sole numeric-draft policy for channel and OKLab fields. Its native listeners track dirty/revision/composition state; value or precision reconciliation discards a draft silently, and bound-only changes do not. Both adapters retain markup and product callbacks. Vue server-renders the initial value through a directive without binding live draft text; React uses committed props in its layout lifecycle. `GamutPlane.vue` calls `authorPlaneEdit` for channel and constrained a/b edits. Numeric values are not round-tripped through hex or a sampled guide.

`packages/ui/src/interaction/rangeInteraction.ts` is the single authored range controller. Its internal `RangeInput` describes authored value, bounds, optional normalization and live/completion/pointer-interaction callbacks. `mountRange` attaches native listeners after mount and returns `reconcile` and callback-silent `dispose`. Vue mirrors the controller's reconciled native value into its template binding; React uses its committed props and layout effect. Pointer-focus attributes remain adapter-owned. Pointer cancellation, capture loss and blur do not emit product `cancel`.

`packages/ui/src/interaction/planeGesture.ts` owns the sole plane pointer state machine: ownership, exact origin, expected feedback, pending/latest point, one RAF, final synchronous publication, rollback, interruption and silent disposal. Its generic ports receive current authored value, accepted `representationId:editorId` semantic key, adapter geometry, core authorship/equality and adapter presentation/callback operations. The shared binding attaches pointer listeners after mount. Capture is still adapter-owned: React requires its methods, while Vue feature-detects them. The controller does not choose a common capture-failure policy. Each adapter retains its own zero-layout geometry fallback, marker/warning positioning and keyboard mapping. `ColorPlane.vue` retains VueUse ResizeObserver, DPR and scroll integration; React's `planeResources.ts` owns renderer, field RAF, resize/scroll, resolution tracking and presentation. Escape is handled on the focused surface only, not by a global key listener.

The app checks native `writeText` rejection and the legacy `execCommand` boolean result before showing clipboard success. It uses VueUse for the feedback timeout. The installed VueUse clipboard helper does not expose the legacy fallback's failure result, so the app handles the write directly.

## Exact facts and visualization guides

Exact three-state Display P3 and sRGB gamut status is calculated directly from the selected `ColorValue`. It is not sampled from a contour.

`ColorValue` owns authored identity. `projectColorToPlane` observes it; `authorPlaneEdit` creates a new definition in the selected edit space. Plane geometry owns axes, constraints and contour coordinates. The accepted revision owns selected observation, exact results, active field and requested guides. `packages/render/src/current/` adapts those owner-native facts and supplies only missing current visual detail. The unchanged `pickerPresentation.ts` independently derives the former complete output as an equivalence oracle. A hue-less observation remains `h: null`; the field receives a separate numeric hue of `0`. Vue and React own lifecycle and temporary edit references.

`analyzeGamut` receives the original selected `ColorValue` for both sRGB and Display P3 and returns the full `inside | within-tolerance | outside` status. `getPickerGuide` interpolates observed numeric OKLCH coordinates against one table for maximum chroma, guide delta and guide color. `packages/render/src/boundaryPresentation.ts` combines those separate inputs only for visual derivation: it filters contour-adjacent channel intervals by visibility and positions the sampled target guide for either plane. No table lookup or reconstructed OKLCH value decides exact status.

`packages/render/src/capabilities/fieldSupport.ts` binds core's `oklch-lc` and `oklab-ab` editors to their core geometry definitions and the existing combined plane/sampler objects. `currentView.ts` translates only the current `oklch`/`oklab` views into those editor IDs. `pickerPresentation.ts` resolves its plane through that relation and uses the referenced core geometry operations; the original shared plane identity, both eager projections, exact checks, gradients, return shape and throws remain intact. The legacy sampler's broad `PickerPlaneId` type is unchanged: correlated editor/geometry types reject mismatches, and direct tests prove each referenced sampler's identity, plane ID and mathematical function correspondence.

`guideSupport.ts` owns `srgb-boundary` → `srgb-gamut` and `display-p3-boundary` → `display-p3-gamut`, referencing the unchanged generated tables. Each guide supports both current editors: contour, Lightness intervals, Chroma intervals, sampled target marker and guide reference/swatch; Hue intervals exist only for `oklch-lc`. Forms reference existing operations, with target positioning using core geometry. Support records are frozen; existing shared plane objects and table buffers retain their current identity and contracts. `boundaryPresentation.ts` resolves reference sampling, interval availability and target positioning from these rows, separately from the old visibility booleans and singular target. It still orders visible interval references Display P3 then sRGB and gates the marker on visibility plus independently supplied exact `outside` status.

Both adapters consume accepted guide forms. `currentGuideDisplay` serializes each resolved contour buffer by identity, preserving `closed` and Display P3-before-sRGB visual order. `ColorPlane` receives the resulting SVG paths and accepted active field; it performs no presentation projection or contour construction. OKLab retains generalized Chroma form facts but creates no unused Chroma display rows or slider marker. The plane target marker, Lightness intervals and target reference panel remain consumed. Capability composition stays outside Canvas sampling and pointer hot paths. No generalized public selection/check/guide API or graceful unavailable UI is introduced.

Contours, channel intervals, boundary-guide swatches and target guides interpolate precomputed `Float32Array` data. They are approximate reference geometry and never map the selected color. Target selects the reference gamut; visibility controls its visual overlays without erasing exact status. An outside-only target guide appears only for exact `outside` status when that gamut's guides are visible. The picker treats `within-tolerance` as visually contained, so the Display P3 warning appears only for `outside`. `mapToGamut` alone maps a color; strict `serializeCss` and `serializeHex` may reject `within-tolerance` through `boundary-tolerance`.

## Scoped capability resolution (Phase 2F)

The generalized path has no global success, support or readiness flag. Accepted UI state contains requests only. Core's existing `represent(value, representationId)` already returns a correlated `ColorResult<ColorRepresentation<S>, ConversionError>` without needing an editor. `capabilities/requestedGamuts.ts` adds `analyzeRequestedGamuts(value, requested)`: one retained `{ gamutId, result }` row per supplied canonical ID, in order, each analyzing the original authored value. Empty requests perform no analysis. Failed rows remain typed failures, never `outside`, and never suppress later rows.

Render's `capabilities/editorResolution.ts` separates `resolveEditorVisualSupport(editorId)` from `resolveField(value, support)`. Null is a non-error no-request. A technical editor resolves core definition/geometry independently of an optional field relation. Missing field support is structural; conversion/projection failure is value-unavailability with the original `ConversionError`. Successful raw projection includes fixed-coordinate facts and marker-domain membership. Missing Hue remains null while sampling can use the existing achromatic zero-Hue slice. OKLab fixed Lightness outside 0–1 is unavailable without clamping; an out-of-domain raw marker alone does not invalidate a field.

`capabilities/guideResolution.ts` resolves every requested guide and each implemented form independently. A row can lack an editor or editor/guide relation without deleting its request; a missing Canvas field relation does not gate a supported guide. Guide support now references core editor geometry and existing contour functions independently of `fieldSupport.ts`. Resolved rows carry independent contour, Hue/Lightness/Chroma interval, reference and target-marker outcomes. OKLab's Hue intervals are structurally absent (`null`). A conversion failure retains its `ConversionError`; an out-of-range visualization Lightness carries that coordinate. A successful empty interval set is still available. Extended L/C Lightness can leave its contour and Lightness intervals usable while reference/Hue forms are unavailable. An OKLab contour can survive failed OKLCH observation, and guide forms do not inherit a failed field marker projection.

The sampled target marker requires the supplied matching exact check to succeed with `outside`. Missing checks, successful `inside`/`within-tolerance`, and failed exact checks have distinct marker results. No guide invokes hidden exact analysis. Empty guide requests do no observation or table sampling. Structural support records are never modified. Resolution is deterministic, DOM-free and outside sampling loops; Canvas readiness remains separately pending until adapter mount.

Both adapters now compose these families in their private `model/acceptedResolution.ts` modules.
The small identical synchronous composition is deliberately adapter-local: no package owns all
three lower layers and no new engine is needed. One accepted ColorValue and one frozen accepted
state produce source, state, semantic context key, observation, checks, editor, field and guides.
Only that call's newly computed exact rows enter guide resolution; callers cannot inject old
rows. Defining-equal feedback may recompute while `definingEquals` still governs gesture ownership.
The React-hosted `scopedCapabilityContract.test.ts` now exercises both production helpers,
including observation-only fixtures and the retained adversarial low-level misuse proof.

`selectionFromCurrentView` remains the product bridge; `legacyCheckedGamuts` stays independent
of the canonical guide requests translated from the two visibility booleans. `boundaryTarget`
and Canvas readiness stay separate. React renders from accepted `useControllableView` state and
commits the revision's source/context through its existing child committed-props cells. No
render-phase revision becomes native interaction authority. Vue uses one computed revision over
`modelValue`, the actual `defineModel` plane and visibility props. A bound update listener with an
unchanged parent prop rejects the request; without that binding Vue's existing local model
acceptance remains intact.

The plane gesture key is now `representationId:editorId`; control keys append channel and operation.
Accepted context changes dispose old drafts/ranges and interrupt queued plane work, even when
scalar values are equal. Rejected requests retain controls and gestures. Hue references are reset
from the accepted source on an accepted context change, preventing a temporary reference from
replaying into a later context; the existing framework-specific Hue editing paths remain intact.
No controller or Canvas resource policy changes. VueUse continues to own existing resize/DPR/scroll
mechanics; this migration adds no generic browser primitive.

## Accepted presentation production authority (Phase 2H.3)

Each adapter synchronously derives `presentAcceptedRevision(revision)`. Its unchanged seven
fields are `authored`, `selection`, `observation`, `exactChecks`, `editor`, `field`, and `guides`.
The selected editor, exact rows, field and guide facts retain revision reference identity.
There is no presentation store, copied source/context, readiness flag or added science in this view.
The A–R contract and zero-work evidence from 2H.1/2H.2 remain intact.

The explicit adapter-local `currentView` bridge admits only `oklch/oklch-lc` and `oklab/oklab-ab`.
Accepted selection controls editor composition, selector state, root attributes and previews.
Unexpected current selections throw an invariant error; observation-only selections remain
valid internally but are not current public rendering contexts.

The unsupported `@gamut-plane/render/internal/current` entry separates current compatibility
assertions, guide serialization, editable detail and target detail. It imports no UI state or
adapter type. Accepted exact rows supply warning/target truth, with no second analysis. Accepted
field supplies raw projection, representation, sampling fixed coordinate, domain status and the
existing plane/sampler. Requested guide rows supply intervals, references, target markers and
contour buffers, with no second ordinary sampling. Components preserve per-form distinctions;
current public composition still fails where the old eager factory failed.

`CurrentEditableDetail` supplies CSS, active-editor gradients, marker positions and existing help
copy. It reuses selected OKLCH observation, or observes OKLCH once for OKLab's supplemental visuals
and Hue reconciliation. `LegacyTargetCompatibility` reuses a visible guide's reference/marker;
when hidden, it samples only the missing target reference. It does not add requests, checks,
contours, intervals or a hidden marker. The current target panel and Display P3 outside-only warning
policy remain unchanged. Canvas readiness, resource ownership and interaction-time geometry stay
adapter-owned; resource reconciliation now reads committed accepted field facts.

`createPickerPresentation` and `getBoundaryPresentation` remain unchanged independent reference
implementations. Neither production adapter calls them. The frozen Phase 2C oracle remains intact.
The [migration ledger](presentation-production-migration.md) records each authority transfer,
consumer inventory, independent equivalence, measured work budget and retained failure bridges.
The [Phase 2H record](vnext-product-capability-model.md#3616-phase-2h3-production-migration-record)
refines the original adoption-then-removal sequence: certified authority transfer and corresponding
duplicate removal now land together. Phase 2H.4 concerns compatibility detail reduction and the
final retirement decision for the independent legacy oracles.

## Current presentation after Phase 2H.4

The accepted seven-field view remains the sole production selection, exact, field and visible-guide
authority. The unsupported render `internal/current` entry keeps six focused functions: field and
exact fail-fast assertions, one OKLab companion OKLCH observation, active-only CSS/gradients,
accepted-guide display geometry, and `currentTargetVisual`. The target helper borrows visible
reference/marker facts or samples one missing hidden reference. It owns no label, help, decimal
formatting or product result object.

Private UI owns current editor help, gamut-target metadata, warning interpretation, target copy,
four-decimal Chroma/delta formatting and visually-inside tolerance wording. It accepts only core
types and primitive render facts; render never imports UI. Adapters place accessible labels and
markup, retain their framework lifecycles, and supply exact target status from accepted checks.
The current target panel remains available when its guide is hidden without adding a hidden
ordinary guide/check/contour/interval request.

The former `createPickerPresentation` and `getBoundaryPresentation` implementations and their
root exports are retired. Their frozen v0.3 compositions remain test-only, supplemented by
literal checked-in golden vectors. The [Phase 2H.4 record](presentation-production-migration.md#phase-2h4-independent-retirement-evidence)
contains the ownership ledger, consumer audit, work budget and package evidence. Public adapter
APIs, accepted view, interaction controllers and visual contract remain unchanged.

## Generated tables

The render package owns checked-in tables at `packages/render/src/generated/gamutTables.ts`. Its native TypeScript generator calls the built public core entry, emits deterministic little-endian Float32 payloads and records the settings and digest. Both adapters consume this single artifact. Import decodes the payloads; it does not search or generate boundaries at startup. The React extraction preserves the payloads, settings and digest.

`pnpm check:gamut-tables` regenerates in memory and fails when the checked-in artifact is stale. After changing the algorithm or settings, run `pnpm --filter @gamut-plane/render generate:gamut-tables` and include the generated file and relevant test changes in the same commit.

## Renderer boundary

`packages/render/src/fieldRenderer.ts` owns Canvas context negotiation, drawing buffers and field invalidation keys. It receives only the numeric plane sampler capability, reuses a mutable OKLCH-shaped field sample and conversion scratch, and never creates `ColorValue` per sample. Its factory is called only during each adapter's mounted/committed setup, and its synchronous `draw` introduces no extra frame queue. Each adapter owns DOM integration and frame coalescing. Disposal clears renderer references; React Strict Mode's second setup creates a fresh renderer. See [Performance](performance.md) for sampling dimensions, caching and preview behavior.

## Native React instrument

`GamutPlane` requires `value` and `onValueChange`, with optional `onValueCommit`, `onCancel` and `onCanvasColorSpaceChange`. It exposes both complete coordinate views, all channel controls, numeric drafts, warnings, sampled guides, a controlled `boundaryTarget`, independent boundary visibility/details and a host `legend`. View follows conventional `view` / `defaultView` / `onViewChange` ownership; color remains controlled-only. Native section props/ref are supported with protected internal semantics and merged class/style. See the [public API](../packages/react/README.md).

React renders pure markup, guides and hydration-safe `useId` associations. A layout effect publishes committed props to the interaction binding; abandoned renders cannot replace its callbacks or color. A separate committed effect mounts the adapter resource binding and shared pointer gesture, then reconciles them from committed props. Cleanup cancels pointer/field work, releases capture and disposes resources without emitting edits. The child consumes the accepted field and serialized accepted contours; committed resource updates reuse that projection. Consumers do not need memoization.

The orchestrator composes private components, one accepted revision/view, and render's separate current visual families. `ColorPlane` owns DOM/SVG and connects UI's gesture to committed props through `planeInteraction.ts`; `planeResources.ts` owns React's renderer/environment resources and DOM geometry/presentation. UI's controller owns pointer arbitration, expected feedback, coalescing and rollback/interruption, without Canvas/resource ownership. `ColorChannelControl` mounts UI's shared range controller and composes its numeric input. `NumericInput` mounts UI's shared numeric controller while the native element owns temporary text. No context object or hook contains the complete product. The [source/coverage map](react-parity.md) details these boundaries.

Pointer-up and native range change discard queued work and synchronously publish the actual final value before `onValueCommit`. Native input remains coalesced live delivery. Numeric Enter/change/blur deduplicate one completed draft. Defining-equal feedback preserves gesture ownership; different definitions and actual view changes cancel without rollback. Escape/capture loss restore the exact `ColorValue` origin. Teardown never calls consumers. Committed Canvas status notifications avoid unchanged Strict Mode replay duplicates.

Both adapters retain `role="application"` on the focused two-dimensional editor. A native slider represents one scalar and would misdescribe this two-coordinate keyboard surface; a generic group would not express its custom arrow-key interaction. No clearly superior tested replacement was identified. The role stays narrowly scoped with explicit labels/instructions, native controls outside it, and no global Escape interception. Automated keyboard/axe tests cover both views; manual assistive-technology validation remains separate.

The Next App Router fixture supplies a `ColorSnapshotV1` from a Server Component and restores it in an ordinary Client Component using `useState`. The package's preserved client boundary and ordinary layout CSS import are sufficient for server HTML and hydration. A separate root Strict Mode fixture verifies repeated setup/cleanup, coalescing, external ownership and queued-work disposal through the packed public component.
