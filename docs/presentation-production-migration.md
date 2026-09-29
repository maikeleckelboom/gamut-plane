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

## Phase 2H.4: independent retirement evidence

The checked-in [`presentationGoldens.json`](../packages/render/test/fixtures/presentationGoldens.json)
is reviewed literal data, not a test-time generator. Its source is the frozen pre-migration v0.3
composition fixture copied from `0b82cef9e5a111a98d98e6a9ae0ab9d666b5cf2b`, corroborated by
the released `main` baseline and unchanged browser references. Expected projection, CSS, exact
statuses, target panel, marker, copy and failure messages are literal. Only large gradient and
visible contour strings use literal SHA-256 digests; tests hash candidate strings, never derive
expected digests. Golden edits require review. There is no regeneration command.

Eight successful cases cover ordinary OKLCH and OKLab, missing Hue with transparent alpha and a
hidden target, raw Hue 720, an outside-sRGB visible marker, a P3-only color with hidden sRGB
target, an outside-disc OKLab color, and the within-tolerance fringe. Four additional vectors
freeze projection, exact-analysis, bounded-Lightness and finite companion-coordinate failures.
The [golden test](../packages/react/test/presentationGoldens.test.ts) checks the frozen fixture
and production render/UI composition separately against the same literals. The broad
[`currentPresentation` test](../packages/render/test/currentPresentation.test.ts) compares 208
successful current compositions and 36 failure combinations with the frozen fixture. The
[target matrix](../packages/render/test/targetResolutionEquivalence.test.ts) retains the 432
editor/chroma/target/visibility/exact-status combinations formerly exercised through the shipped
boundary factory. Core, table, browser and visual tests remain separate evidence layers.

Before legacy runtime deletion, the 12 golden vectors, frozen factory equivalence,
current-production equivalence, web screenshots and packed Vue/React Vite visual references
passed. No visual baseline or tolerance was updated.

## Current helper ownership ledger

| Original helper/responsibility                                                                                     | Classification                | Final owner and action                                                     | Reason                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `currentField`: require the accepted active field and preserve projection errors                                   | CURRENT PRODUCT COMPATIBILITY | Render `internal/current`: retain                                          | One small assertion over render-owned field facts; moving it would duplicate the failure bridge across adapters. Product admission remains in adapter `currentView`. |
| `currentExactChecks`: require both successful current exact rows                                                   | CURRENT PRODUCT COMPATIBILITY | Render `internal/current`: retain                                          | Twelve-line fail-fast bridge uses accepted exact rows without re-analysis. A new UI subpath or two copies would worsen ownership.                                    |
| `currentOklchObservation`: one OKLab companion observation and finite-coordinate check                             | CURRENT PRODUCT COMPATIBILITY | Render `internal/current`: retain                                          | Current OKLab CSS, target sample and Hue reconciliation still consume OKLCH; reuse one observation and preserve the old failure boundary. No persistent cache.       |
| `currentEditableDetail`: active CSS, opaque marker CSS, positions and active-only gradients                        | CURRENT PRODUCT COMPATIBILITY | Render `internal/current`: reduce                                          | These are render visual facts for current editors. Remove all help copy; never create inactive-editor gradients.                                                     |
| `currentGuideDisplay`: contour buffer to SVG path and ordered visible interval lanes                               | LONG-TERM RENDER              | Render `internal/current`: retain                                          | Deterministic visual serialization of accepted guide facts, with no second sampling or contour build.                                                                |
| `currentGuideValue`: unavailable-form failure interpretation                                                       | CURRENT PRODUCT COMPATIBILITY | Render private helper: retain                                              | Keeps the current fail-fast boundary for required visual forms; it is not an exported runtime member.                                                                |
| `legacyTargetCompatibility`: missing hidden reference, borrowed visible marker, CSS and Chroma position            | CURRENT PRODUCT COMPATIBILITY | Render `currentTargetVisual`: reduce/rename                                | One focused hidden sample or borrowed visible facts; no exact analysis, label, decimal formatting or product result model.                                           |
| `legacyTargetCompatibility`: target labels, marker label, result formatting, status wording and accessibility copy | UI / PRODUCT POLICY           | UI `targetGamutUi`, `currentTargetPresentation`, `currentTargetCopy`: move | Pure product policy over primitive numbers, status and CSS strings. UI has no render dependency.                                                                     |
| Shipped `pickerPresentation`/`boundaryPresentation` factory implementations                                        | LEGACY-ONLY                   | Retire from render runtime/root; retain frozen test fixtures               | No production or packed consumer; tests use the frozen fixture and literal goldens.                                                                                  |

`currentEditorHelp` and `currentEditorCopy` own unchanged Hue, Chroma and OKLab disc copy.
`currentWarningVisible` owns the Display P3 outside-only warning interpretation. UI target metadata
is distinct from representation metadata even when labels match. The UI helper preserves four
decimal places, JavaScript rounding, positive-delta visibility, and tolerance-as-visually-inside
without changing three-state accepted exact status. Adapters own DOM, the Unicode minus sign for
displayed delta, component lifecycle and accessible attribute placement.

The final render `internal/current` runtime surface remains six focused exports:
`currentField`, `currentExactChecks`, `currentOklchObservation`, `currentEditableDetail`,
`currentGuideDisplay`, `currentTargetVisual`. It retains `CurrentField` and
`CurrentGuideDisplay` as type exports. Export count is unchanged because focused target reference
sampling remains justified; the mixed `legacyTargetCompatibility` export is gone. The sibling
export map remains unsupported and separate from the public root.

## Legacy factory retirement and remaining work

The consumer audit searched production source, package roots, tests, fixtures, scripts, packed
Vite/Nuxt/Next consumers, READMEs and architecture documents. Only tests, historical documents
and render root exports referenced the two shipped factories. No adapter or packed fixture used
them as a runtime contract. `createPickerPresentation`, `getBoundaryPresentation`,
`displayGamutLabel`, `BoundaryPresentation` and `BoundaryGuideVisibility` are retired from
production and root declarations; their names remain only in frozen test fixtures. Package
checks assert retired JS/declaration files are absent from tarballs and the installed root/internal
inventories, ES-only declarations and no-DOM Node execution are exact.

Visible targets borrow the accepted guide reference and marker; hidden targets sample exactly
one missing focused reference so the target panel remains available. Accepted checks alone
supply exact truth. A hidden target adds no ordinary guide, check, contour or interval work and
no target marker. `CurrentEditableDetail` still builds one active editor's gradients; OKLab
still observes one companion OKLCH representation. Interaction-time projections for rollback,
non-accepted origins and keyboard edits remain valid and untouched. The accepted seven-field
presentation, public adapter APIs, styles, generated tables and interaction controllers remain
unchanged. Phase 2I product behavior remains deferred.

## Work and artifact accounting

Measurements compare the clean `826932b` starting tree with the Phase 2H.4 tree using the
repository-pinned Node 24.16.0 and pnpm 11.9.0. LOC counts physical production source lines;
packed sizes are the actual `.tgz` byte lengths. Web JS compares the built app's single JS asset
using raw bytes and Node `gzipSync` bytes under the same environment.

| Measure                                             |    Before |     After |
| --------------------------------------------------- | --------: | --------: |
| `packages/render/src/current/` production LOC       |       283 |       256 |
| Shipped legacy picker and boundary presentation LOC |       245 |         0 |
| `internal/current` runtime exports                  |         6 |         6 |
| Render package `.tgz`                               |  84,279 B |  81,114 B |
| Vue package `.tgz`                                  |  19,979 B |  20,031 B |
| React package `.tgz`                                |  22,438 B |  22,447 B |
| Web production JS, raw                              | 240,980 B | 241,769 B |
| Web production JS, gzip                             | 114,672 B | 114,965 B |

The small adapter/web increases accompany shared UI product policy; the unused shipped render
factories are removed. Size alone does not establish a runtime performance change. Real component
work tests still certify one accepted two-row exact collection, one active field projection, one
guide resolution, one contour/reference/interval operation per visible guide, and exactly one
additional reference sample for a hidden target. They also preserve zero inactive display
projection and no child contour rebuild. React speculative rendering is counted separately.
