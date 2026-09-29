# React instrument parity

The Vue and React adapters implement the same instrument over core's exact color/plane contracts, render's shared visual contracts and UI's semantic anatomy/presentation authority. Phase 2I adds a public generalized state route beside the preserved legacy two-view contract. React keeps idiomatic controlled color, controlled/local generalized state, native section props/ref and a normal legend node. No public composable primitives are introduced.

The generalized route shares accepted resolution and editor interactions with legacy. Both adapters expose the four current representations, two admitted editors, null-editor inspection, independent exact checks and guide preferences. The reusable component owns the new controls. Packed Vite and server-rendered Next/Nuxt fixtures exercise the same state and observation surface; a rejected controlled request does not replace the accepted editor context. The legacy target and visual references remain unchanged.

## Private source responsibilities

| Module under `packages/react/src`      | Ownership                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `GamutPlane.tsx`                       | Public props, stable IDs, active model, root integration, channel callback wiring and product composition                             |
| `components/ColorPlane.tsx`            | Canvas/SVG/marker/target-guide/warning DOM, accessible surface, committed controller/renderer lifecycle                               |
| `interaction/planeInteraction.ts`      | Committed value/core authorship ports, adapter capture/focus, keyboard mapping and UI gesture integration                             |
| `interaction/planeResources.ts`        | Canvas renderer, field RAF, DOM geometry, marker/warning presentation, ResizeObserver, scroll/resize, DPR/media tracking and disposal |
| `components/ColorChannelControl.tsx`   | A complete linear control: label, range, numeric field, intervals, ticks, threshold context, measured warning placement               |
| `components/NumericInput.tsx`          | Native numeric markup, committed props and layout lifecycle for UI's shared draft controller                                          |
| `components/CoordinateViewControl.tsx` | Horizontal radiogroup, roving tab stop, wrapping arrow navigation and focus                                                           |
| `components/BoundaryTargetResult.tsx`  | Always-visible target status, sampled guide chroma/delta and actual guide-color swatch                                                |
| `components/GamutWarningGlyph.tsx`     | Decorative warning SVG                                                                                                                |
| `hooks/useControllableView.ts`         | Initial uncontrolled view and authoritative controlled view requests                                                                  |
| `hooks/useCommitted.ts`                | Publish props to native listeners only after a React commit                                                                           |
| `model/presentationStyle.ts`           | Private typed CSS-property construction, without broadening the public theme API                                                      |
| `model/acceptedResolution.ts`          | Accepted legacy-state bridge and synchronous generalized revision; fresh exact rows belong only to their source/state                 |
| `model/acceptedPresentation.ts`        | Seven-field readonly projection borrowing the accepted revision facts without new resolution                                          |
| `model/currentView.ts`                 | Explicit admission of the two current accepted representation/editor pairs                                                            |

The private `@gamut-plane/ui` package supplies the part/state vocabulary, authored v0.3 stylesheet, warning glyph geometry and separate plane/range/numeric DOM controllers to both adapters. `mountPlaneGesture` owns one pointer, origin/expected feedback, pending/latest point, coalesced live publication, synchronous final publication, exact rollback and callback-silent disposal. Its ports leave core authorship/equality, adapter geometry/presentation, capture, focus and keyboard outside UI. `mountRange` owns native range input/change distinction, live RAF, expected feedback, parent interruption, pointer preview and callback-silent disposal. `mountNumericInput` owns only draft metadata, composition/completion policy, value/precision reconciliation and silent disposal; the native number input owns text. React keeps committed-prop/layout-effect integration and pointer-focus hooks.

There is no whole-product context, giant hook, render-time resource allocation or redundant color state. Event callbacks do not depend on consumer memoization. A suspended/abandoned render cannot replace committed callbacks. Mutable interaction and renderer resources belong to one mounted instance and are disposed silently.

Phase 2G composes generalized resolution during render from the accepted view, then carries its
source and `representationId:editorId` key through the existing committed child props. Controlled
requests never update this authority without parent acceptance. Control keys additionally contain
channel/operation identity. Vue implements the same deterministic composition in a computed value
while retaining `defineModel` ownership and VueUse resources. The shared `acceptedRevisionContract`
runs real components through rejection, both accepted transitions, outside-to-inside replacement,
defining-equal feedback, all guide combinations, target independence and silent queued teardown.
The React harness runs at the root of Strict Mode. The concurrent-render test suspends an OKLab
revision and proves that subsequent native pointer/keyboard work still authors committed OKLCH.

## Shared visual extraction

Both adapters consume one accepted presentation view and render's separate `internal/current`
families. Accepted selection, exact checks, active field and requested guide forms are production
authorities. Children consume the field projection and serialized accepted contour buffers without
repeating their construction. Active-editor detail supplies gradients/CSS; UI supplies unchanged
help, gamut-target labels, warning interpretation and numeric formatting. `currentTargetVisual`
reuses visible facts or samples one missing hidden-target reference. The former
`pickerPresentation.ts`/`boundaryPresentation.ts` implementations are retired from runtime and
retained as frozen test fixtures alongside literal golden vectors. `channelGeometry.ts`
consolidates concrete interval/threshold/warning geometry, and
`presentation.ts` constructs CSS gradients and guide connectors. See the
[production migration ledger](presentation-production-migration.md) for consumers, work counts,
failure bridges, suspended-render and node-continuity evidence.

Generated table settings/bytes and Canvas sampling algorithms remain unchanged. The table digest is `sha256:4c73cef992515b5876e309f7bce90cd418217c7a576f54cfcead380eb416ce15`.

## Vue product oracle

Paths in the first column are under `packages/vue`. React test paths are under `packages/react`, unless a shared package is named.

| Vue contract / oracle                                                                                                                                                           | React or shared proof                                                                                                                        | Classification                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `test/planeInstrument.test.ts`: complete ColorValue channel edits, alpha, both views and a/b geometry                                                                           | `test/planeInteraction.test.tsx`, `numericInput.test.tsx`, `rangeInteraction.test.tsx`; packed `e2e/embedding.spec.ts`, `parity.spec.ts`     | Equivalent React tests                         |
| Same suite: Hue preview activation/completion/interruption, no preview in other modes                                                                                           | `rangeInteraction.test.tsx`, `planeInteraction.test.tsx`; packed `e2e/rendering.spec.ts`                                                     | Equivalent React tests                         |
| Same suite: target result, boundary disclosure, marker roles, hidden-target visibility and exact/sample overlap                                                                 | `publicApi.test.tsx`, `presentation.test.tsx`, `planeInteraction.test.tsx`; shared render model and packed browser visibility proof          | Equivalent React tests plus shared pure model  |
| `test/pickerInteraction.test.ts`: rectangular/disc gestures, final point, rollback, keyboard and radial bounds                                                                  | `planeInteraction.test.tsx`; packed embedding cancellation and native editing                                                                | Equivalent React tests                         |
| `test/instrumentHost.test.ts`: parent replacement, foreign pointer, teardown, view interruption                                                                                 | `planeInteraction.test.tsx`; packed external replacement and root Strict Mode                                                                | Equivalent React tests                         |
| `test/linearControl.test.ts`: latest native input, synchronous final change, cancellation/blur, no invented commits/cancels                                                     | `rangeInteraction.test.tsx`; packed all-range native input/change test                                                                       | Equivalent React tests                         |
| Same suite: numeric draft completion, overflow and accessible warning descriptions                                                                                              | `numericInput.test.tsx`, `presentation.test.tsx`; packed drafts for H/L/C/a/b                                                                | Equivalent React tests                         |
| Same suite: interval sections, threshold proximity and warning side/collision decisions                                                                                         | `packages/render/test/channelGeometry.test.ts`, `pickerWarningPlacement.test.ts`; React uses those helpers, with DOM warning/interval checks | Shared pure tests plus React integration       |
| `test/interactionAffordance.test.ts`: warning glyph/hidden decorative semantics                                                                                                 | `presentation.test.tsx`; warning screenshot and packed axe                                                                                   | Equivalent React tests                         |
| `test/canvasDpr.test.ts`: backing sizes and runtime resolution invalidation                                                                                                     | Packed `e2e/parity.spec.ts` DPR 2.5 and Next root Strict Mode DPR test                                                                       | Equivalent React browser tests                 |
| `test/rendererPerformance.test.ts`: visible/fixed axis invalidation, coalescing, preview sampling/reuse and actual quality fallback                                             | `planeInteraction.test.tsx`, `presentation.test.tsx`, `rangeInteraction.test.tsx`; packed rendering                                          | Equivalent React tests over unchanged renderer |
| Generated-table accuracy, coordinate projection, conversion, serialization, keyboard and sampled-guide algorithms                                                               | Existing core tests and render table/geometry tests; deterministic table regeneration gate                                                   | Shared core/render proof                       |
| `e2e/embedding.spec.ts`: visible independent fields, host font/reset/palette, IDs/focus, drafts, alpha, cancellation, resize/scroll/reveal                                      | React's adapted `e2e/embedding.spec.ts`, through installed public tarballs                                                                   | Equivalent React browser tests                 |
| Same suite: 280/340/623/624/625/800 widths, container fallback, 200% text and focus                                                                                             | Same React browser suite, using the accepted 39em threshold                                                                                  | Equivalent React browser tests                 |
| `e2e/rendering.spec.ts`: open/closed guides, stable visible-axis geometry, fixed-axis changes and Hue preview                                                                   | React's adapted `e2e/rendering.spec.ts`                                                                                                      | Equivalent React browser tests                 |
| `e2e/accessibility.spec.ts`: both views, narrow host, labelled controls and serious/critical axe gate                                                                           | React's adapted `e2e/accessibility.spec.ts`                                                                                                  | Equivalent React browser tests                 |
| `nuxt-consumer`: actual delayed-script server document, retained nodes/IDs/focus/values/geometry, independent requests, route remount, narrow/reveal/resize and Canvas fallback | Packed `next-consumer/e2e/hydration.spec.ts` in development/production plus prerendered route                                                | Equivalent React/Next SSR tests                |
| Nuxt-specific generated query exclusions, Vue component mounting, VueUse scope disposal and `v-model` event syntax                                                              | Next static-route checks, React root replay/resource checks and idiomatic callbacks cover product behavior                                   | Framework-specific mechanisms do not transfer  |
| Scientific RTL direction                                                                                                                                                        | `e2e/rtl.spec.ts` for Vue and React `e2e/parity.spec.ts`                                                                                     | Shared product fix tested in both adapters     |

React-specific tests additionally cover native section/ref protection, controlled/default view initialization, read-only controlled view, callback freshness, abandoned concurrent rendering, Strict Mode status deduplication and separate instance ownership. Full color objects are compared rather than relying on identity.

## Semantics and presentation

The focused two-dimensional plane retains Vue's `role="application"`: one native slider cannot describe two editable coordinates, and a generic group does not express the custom keyboard editor. The role is restricted to that surface; the selector and native form controls retain their own semantics. Labels explain axes/current coordinates and keyboard editing; warning text is part of control descriptions. There is no global Escape handler. Automated axe/keyboard proof does not substitute for manual screen-reader acceptance.

The single stylesheet in `packages/ui/src/style.css` preserves the accepted local dark surface, host font, gradients, markers, target-guide connector, focus and warning geometry. Both adapter `./style.css` artifacts contain its copied bytes and selectors are scoped to `data-gp-root`. Available component width owns the 39em transition: at the default 16px font, 623px is one column and 624/625px are two. Enlarged text raises the threshold; disabling the named container retains a usable single column.

Four existing React references cover OKLCH, OKLab, narrow layout and out-of-Display-P3 warning/target guide. The [Phase 1B foundation record](ui-foundation-phase-1b.md) adds twelve matched Windows captures per adapter and semantic parity checks. No approved Vue or React references were replaced. Renderer/sampling algorithms are unchanged, so no new timing benchmark is claimed.

## External consumption and lifecycle proof

The ordinary Vite consumer and Next App Router consumer install actual core/render/UI/React tarballs outside the workspace. Manifests/ESM/declarations/CSS/README/LICENSE are inspected, private artifact paths are content-addressed, and installed private-package files are checked against tarball bytes. No source alias, private deep import, SSR suppression or manual renderer initialization is used.

Next loads the server document and CSS while scripts are held, records actual nodes and relationships, then checks their retention after hydration. Both views include controls, guides, target result and legend before scripts. Root Strict Mode counts all plane/track observers and native plane/control/window/resolution listeners through setup/cleanup/setup and unmount. Teardown emits no edit, rollback, completion or cancellation.

Use the [testing commands](testing.md) for reproducible evidence. This parity record does not set package versions; publication, deployment, alpha controls, uncontrolled color and public composable primitives remain outside its scope.
