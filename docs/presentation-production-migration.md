# Phase 2H.3 production presentation migration

The original sequence separated 2H.3 component adoption from 2H.4 duplicate legacy computation
removal. Phase 2H.1/2H.2 established reference identity, zero additional resolution, scoped
failures and the complete A–R matrix. Phase 2H.3 therefore transfers each certified authority
and removes its corresponding duplicate production work together. Public behavior remains v0.3.

## Authority ledger

| Checkpoint/family  | Before                                                                                                   | After and consumers                                                                                                                                                                                            | Equivalence and work evidence                                                                                                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: selection       | Accepted framework view also dispatched legacy presentation and orchestrator branches                    | `accepted.selection` through explicit adapter-local `currentView`; editor/control composition, plane identity, root attributes, selector and preview conditions                                                | Shared real `acceptedRevisionContract`, current selection invariant tests; rejected requests retain DOM/drafts/gestures, accepted switches invalidate semantic contexts                         |
| B: exact checks    | Accepted two-row analysis plus two direct legacy `analyzeGamut` calls                                    | `accepted.exactChecks` through `currentExactChecks`; Display P3 outside-only warning, target exact status/attributes; visible markers already resolved with those checks                                       | Independent render equivalence and real component work contract; one requested collection of two analyses, zero direct legacy calls                                                             |
| C: active field    | Accepted projection, both factory projections, child display projection and resource display projections | `accepted.editor`/`accepted.field` through `currentField`; raw point, representation, fixed coordinate, domain status, plane/sampler, marker, accessible coordinates, Canvas resource input and OKLab controls | Independent raw/constrained projection, label/style and help equivalence; exactly one active accepted projection, zero inactive presentation projection, no child/resource display reprojection |
| D: requested forms | Accepted forms plus factory reference/interval/marker work                                               | `accepted.guides`; `currentGuideDisplay` for intervals and `legacyTargetCompatibility` for visible reference/marker                                                                                            | All visibility/target/editor combinations; requested references and intervals sampled once; visible marker borrowed by identity; per-form failures remain failures                              |
| E: contours        | Accepted contour plus child contour build                                                                | Accepted `Float32Array` directly to `geometryToSvgPath(points, closed)` in render; child SVG receives paths                                                                                                    | Serializer arguments retain buffer identity and closed flag; byte-exact independent paths; one active builder call per visible guide, none for hidden guides, no child build                    |
| F: detail/target   | Complete eager factory shape, including unused opposite-editor outputs                                   | Separate active-editor detail and focused target compatibility                                                                                                                                                 | Independent 208 successful compositions and 36 failure comparisons; no replacement mega-object or generalized-view widening                                                                     |

The unchanged seven-field `AcceptedPresentationView` remains an adapter-local shallow projection.
No target, strings, gradients, callbacks, copied source/context or environment state is added.
`revision.source` and `revision.contextKey` remain integration facts. Core, UI and generalized
resolution implementations are unchanged. Scientific runtime code never moves into UI.

## Certified production work budget

`productionWorkContract.ts` mounts each real adapter for both editors, both targets and all four
guide visibility combinations: 16 cases per adapter. Counts are for one normal composition,
including resource setup. Strict Mode render re-evaluation is tested separately and is not
misrepresented as one composition. Let V be visible guides (0–2), and H be 1 if the target is hidden.

| Operation                   | Phase 2G/2H.2 path                                             | Phase 2H.3 path                                   |
| --------------------------- | -------------------------------------------------------------- | ------------------------------------------------- |
| Exact analysis              | Two accepted analyses plus two direct factory analyses         | Two accepted analyses; no direct factory analysis |
| Active display projection   | Accepted + factory + child, plus adapter resource display work | One accepted `resolveField` projection            |
| Inactive display projection | One factory projection                                         | Zero                                              |
| Guide references            | V accepted + two eager factory references                      | V accepted + H missing target reference           |
| Hue intervals, OKLCH        | V accepted + V factory                                         | V accepted                                        |
| Lightness intervals         | V accepted + V factory                                         | V accepted                                        |
| Contours                    | V accepted + V child                                           | V accepted; zero child                            |

The exact collection calls its owner-local analysis implementation twice. A root-module spy
cannot observe those internal calls: tests separately assert the collection's two canonical IDs
and zero direct root analysis calls. Geometry entry spies wrap the frozen catalog only in tests;
production catalogs remain untouched. Component tests then invoke the independent old factory
after checking the budget to compare actual accessible labels, target status and SVG bytes.

Observation accounting is deliberately separate. Accepted selection observes once; active field
projection performs its own legitimate owner-local conversion; requested guide resolution observes
OKLCH once when V > 0, plus OKLab once for the OKLab contour slice. Those owner-local prerequisites
remain unchanged. Current detail adds only one OKLCH companion observation for an OKLab editor;
OKLCH detail borrows the accepted observation. Hue-reference reconciliation reuses this same
observation. No persistent cache or pointer/pixel-loop composition is introduced.

## Remaining compatibility

`CurrentEditableDetail` contains active/opaque marker CSS, current Hue/Chroma positions, only the
active editor's gradients, and existing Hue/Chroma/disc help text. OKLab's fixed-Lightness stops
preserve the existing CSS-only 12-significant-digit C/H stabilization. It consumes accepted field
coordinates; it performs no field projection, exact analysis, guide resolution or sampling.

`LegacyTargetCompatibility` retains target label, guide Chroma/delta formatting, swatch, target
annotation and the consumed OKLCH Chroma marker. Visible targets reuse accepted reference/marker
facts. Hidden targets sample one reference directly through existing render guide support; they
never insert an ordinary request, analyze exact gamut, build a contour, sample intervals or create
a marker. Accepted checks supply hidden target exact status. OKLab produces no unused Chroma
display rows/marker; its generalized Chroma form remains intact.

Current failure bridges remain deliberate:

- Missing current selection/editor/field/check prerequisites are developer invariants.
- Projection failure keeps `RangeError("Selected color cannot be projected into the instrument")`.
- Unsuccessful required exact rows keep `RangeError("Selected color cannot be analyzed for picker gamut status")` without another analysis.
- Extended OKLab fixed Lightness keeps its successful raw projection, then the current target/reference requirement retains `RangeError("OKLCH lightness must be between 0 and 1")`.
- OKLab's supplemental OKLCH coordinates retain the old finite companion-projection check without another observation or selected projection.
- Vue's immediate Hue reconciliation retains its established observation-failure message, `Selected hue cannot be observed`; the composed visuals retain the old field/exact/target failure ordering before gradient serialization.
- Structural null, available empty intervals, missing check, exact-unavailable and exact-not-outside remain separate owner-native outcomes. No failure is converted to an empty success.

`createPickerPresentation` and `getBoundaryPresentation` remain unchanged, independent reference
implementations. Neither adapter's production source imports/calls them. The frozen Phase 2C
test oracle is unchanged. No current production blocker requires the legacy factory.

## Integration and package proof

The shared real component contract captures the accepted revision, accepted presentation and
rendered editor. It covers initial editors, switches both ways, controlled rejection, all guide
visibility combinations, target changes, outside-to-inside and defining-equal source feedback,
temporary rejected Hue then leave/return, queued plane/range/numeric invalidation and disposal.
Continuity checks compare actual control/plane/target nodes during nonsemantic changes.

React's Suspense test proves that new pure presentation families can evaluate speculatively
without changing committed DOM/resource facts or callbacks, then verifies a complete later
accepted installation. Existing root Strict Mode packed tests retain resource/listener/RAF and
silent-disposal assertions. Vue's local `defineModel` acceptance and controlled rejection remain
native framework behavior. VueUse resources are unchanged.

Nuxt and Next hydration suites additionally compare target-panel and guide markup byte-for-byte
before/after hydration, alongside existing IDs, values, focus, DOM reuse, initial Canvas pending,
independent-instance, request-isolation and resource checks. Existing full app and packed-adapter
keyboard, axe, rendering, responsive, host and visual suites remain authoritative. No baseline or
tolerance update is part of this migration.

The sole export-map extension is unsupported `@gamut-plane/render/internal/current`. Runtime:
`currentField`, `currentExactChecks`, `currentOklchObservation`, `currentEditableDetail`,
`currentGuideDisplay`, `legacyTargetCompatibility`. Types: `CurrentField`, `CurrentGuideDisplay`.
The packed helper certifies this exact inventory, root exclusion, ES-only declarations, installed
artifact graph integrity and real no-DOM Node execution from Vue/Vite, React/Vite, Nuxt and Next.
The Vue build externalizes the declared subpath. Public roots, props/models/events, style imports,
package versions, dependencies and generated gamut tables are unchanged.

## Revised Phase 2H.4

Compatibility Detail Reduction / Legacy Retirement now concerns hidden-target compatibility,
remaining gradients/current editor detail, help/warning/copy ownership, obsolete compatibility
shapes and explicit retirement decisions for the two independent legacy oracles. Those oracles
can remain test/reference code while they add independent evidence. Observation-only product UI,
generalized public APIs, mapping/output workflows, new science and compact redesign stay deferred.
