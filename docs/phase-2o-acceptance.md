# Phase 2O acceptance: Field viewport

## Human acceptance and repository integration: 8 October 2026

Phase 2O has been accepted for repository integration under the revised empirical visual-approximation contract. Formal continuous/topological certification is future research and no longer blocks this acceptance. Exact gamut Status, bounded deterministic work and explicit detected numerical/traversal failure remain independent requirements.

Integration re-established `dev` at `d726a65fc3a44010c2edc92f92406fbc7f9a1136`, fetched `origin/dev` and confirmed no divergence. All 472 candidate files matched the local closeout's final SHA-256 input manifest, including source, tests, configuration, dependencies and visual references. The complete local matrix below is reused evidence from that closeout, not newly executed integration verification. Integration only corrects documentation, including core's stale claim of an explicit error bound; production code, tests and references remain unchanged. Fresh formatting, lint and diff checks validate those corrections.

The 115 changed/new files form one cohesive feature commit: camera and adapter wiring, numerical guide integration, permanent regression/acceptance tests, reviewed visual references and supporting documentation. Ignored `.artifacts/` evidence and all other local build/cache/configuration artifacts remain excluded and preserved locally. The local closeout and implementation reports below describe their historical uncommitted snapshots; their earlier Git authorization and readiness statements do not describe this integration.

Local verification, empirical numerical acceptance, independent engineering review and human acceptance are separate from exact-SHA remote CI certification. The final integration report records the pushed commit and its GitHub Actions results. This integration authorizes no release, tag, package publication or manual deployment.

## Current closeout: 8 October 2026

The user explicitly approved **Outcome B** and replaced the original continuous symmetric Hausdorff bound and exhaustive boundary-component requirement with a rigorous, reproducible, empirically validated visual-approximation contract. This approval is recorded in [ADR 0004](decisions/0004-field-viewport.md#approved-acceptance-revision-8-october-2026), [spec §16.1](phase-2o-field-viewport-spec.md#161-contract), architecture and the [permanent testing protocol](testing.md#perceptual-guide-acceptance-protocol). No further formal-certification product decision is pending.

Scope: built-in sRGB/Display P3, nominal OKLCH L/C rectangle and OKLab a/b disc, fields <=480 displayed CSS px and zoom 1x–8x. Each successful fixed acceptance fixture must measure <=1 CSS px in both sampled directions at 480 px/8x, including actual Float32 and parsed production SVG output. Success retains bounded deterministic work and strict numerical/traversal failure. No coarse fallback, stale contour, invented editor edge, known incomplete success or contradicted spatial Reference is allowed. Exact gamut Status remains independent and authoritative.

The [independent review](phase-2o-independent-review.md) correctly rejected the previous formal contract. The [certification investigation](phase-2o-certification-investigation.md) retains Outcome B, failed proof obligations and partial certificates. Its multi-second prototypes are preserved research evidence, not production code or normal tests. Historical evidence below is not fresh closeout verification.

### Baseline and preservation

Branch `dev`, HEAD `d726a65fc3a44010c2edc92f92406fbc7f9a1136`; initially 87 modified tracked files, 28 individual untracked files (25 porcelain entries because one directory is collapsed), no staged changes. All existing implementation, screenshot references and ignored evidence were preserved. Node 24.16.0 and repository-pinned pnpm 11.9.0 were used on Windows. No staging, commit, push, merge, tag, publication or deployment is authorized or performed.

Ignored `.artifacts/phase-2o-closeout-20261008/` holds `baseline.json` (all starting input hashes), `initial-status.txt`, final matrix logs, numerical JSON records, browser captures and final input/preservation manifests. The final manifest distinguishes closeout files from pre-existing work. Production source, configuration, dependencies, lockfile and screenshot references must remain byte-identical to this starting snapshot.

### Permanent acceptance evidence

Existing owners were extended: render's `perceptualGuides.test.ts` replaces its smaller one-direction sweeps with four bidirectional gamut/geometry rows; `perceptualOracle.ts` specifies fixtures and independent direct texel membership searches. `tracedGuides.test.ts` covers actual production rejection of synthetic disconnected traversals, both explicit failure reasons after a previous success, spatial Reference suppression, unchanged exact Outside and subsequent recovery. Core retains numerical ray/interval tests; camera/UI/adapter/browser owners retain the established architecture and interaction regressions.

The fixed protocol densely covers yellow/blue cusp regions, notch and neighboring fold/tangent behavior, black/white points, near-black/white and explicit near-degenerate unavailability. Both raw Float32 and parsed `geometryToSvgPath()` output are measured in both directions. Memo eviction checks deterministic recomputation and serialization. Known notch-ray crossing counts protect observed traversal without claiming globally complete topology. See [testing](testing.md#perceptual-guide-acceptance-protocol) for exact slices, sampling densities, searches, bisection counts and failure messages.

There are 93 L/C and 35 a/b slices per gamut: 255 successful traces and the one explicitly unavailable slice below. The permanent matrix measures 357,248 independent boundary samples and 314,710 contour samples across both representations. Each contour segment includes both endpoints and three interior fractions; boundary sampling is fixed independently of those segments.

Maximum sampled Euclidean error in CSS px at 480 px/8x (B = sampled target boundary, P = geometric contour):

| Gamut / geometry | Float32 B→P | Float32 P→B |  SVG B→P |  SVG P→B |
| ---------------- | ----------: | ----------: | -------: | -------: |
| sRGB L/C         |    0.490642 |    0.491595 | 0.493095 | 0.493137 |
| sRGB a/b         |    0.532382 |    0.532455 | 0.530426 | 0.531279 |
| Display P3 L/C   |    0.499071 |    0.499373 | 0.503836 | 0.503880 |
| Display P3 a/b   |    0.511666 |    0.511559 | 0.528592 | 0.528473 |

The maxima are identical in the tested Windows Node 24.16.0 and Linux Node 24.17.0 runs. This is observed agreement between those two environments, not a general engine-equivalence guarantee. The focused Windows owner run took 65 seconds; Linux took 38 seconds. This is appropriate for ordinary CI and does not include any certification prototype. Trace timings inside these tests are observational and contaminated by test/oracle workload, not new isolated performance evidence.

The initial new reverse grid missed acute near-white feasible wedges; uniform/logarithmic refinement plus a gray-directed membership search repaired that test oracle. An initial topology assertion used same-ray displacement, which exceeds normal distance near tangencies; the final assertion retains exact crossing counts and the agreed nearest Euclidean metric. Those failing development logs remain preserved. No production threshold, screenshot threshold or detected defect was suppressed.

### Product, visual and performance findings

Fresh Windows pinned-Chromium inspection collected 92 captures: all four editor families at 320/390/440/480 px hosts in Fit, 1.5625x and 8x, all eight 8x edges/corners at 480 px, and enlarged text/open Gamuts/forced colors at 320 px. All 12 contact sheets were inspected, followed by four additional full-size cursor-anchored 8x perceptual captures with authored marker, Reference endpoint/connector and normal/forced colors. There are 96 fresh captures in total; they support visual review rather than prove every dynamic frame.

Measured instrument overflow was zero in all 92 matrix captures; marker diameter stayed 18 CSS px. The supplemental anchored check retained a visible Reference in both perceptual fields and unchanged authored definition/event counters. Native wheel sensitivity and whole-pixel mouse coordinates were accounted for; the independent marker projection check allows only propagated 1/64 px DOMRect layout quantization at 8x. Early supplemental audit assumptions failed and their logs remain preserved. Fields, axis ranges, contours, markers, connectors, OKLab disc, native RGB Areas and offscreen-selection clipping remained coherent. No visual/CSS change or screenshot reference update was justified; all 60 references and thresholds match the starting tree byte-for-byte.

The real browser matrix covers Fit/100%, cursor anchoring, intermediate/max zoom, Space-primary/middle-button pan, inverse editing after camera movement, bounds/clipping, resize/scroll/capture/blur, narrow/enlarged layouts, keyboard and focus. Vue/React owner tests retain equivalent semantics and committed-state behavior; installed React and Next Strict Mode add their native/lifecycle sentinels. Forced colors are Chromium emulation, not a physical high-contrast display.

All 114 runtime source files match the closeout baseline hashes. No production dependency, API, tracer, guide/exact work route, cache, renderer or interaction change occurred. Fresh camera resource tests retain one coalesced presentation, viewport/DPR backing dimensions and zoom-independent structural work. The earlier isolated 0.297–0.886 ms trace medians and guide-on/off comparisons remain **historical evidence**, with no consistent guide-induced increase in that review; they were not rerun or promoted to a universal latency claim. Since product inputs are unchanged, the test/document additions introduce no product interaction cost. The approximately 65-second focused numerical owner and 37-second final Linux owner remain test-only CI work. Existing full-field Hue/RGB costs above a 60 Hz frame and physical-device limitations remain unchanged.

### Final verification

All final gates below completed with exit zero. Browser/SSR/packed checks ran sequentially on their documented ports. Final production build retained the same JS/CSS asset hashes across both closeout gate runs.

| Command                                             | Fresh result                                                                                                                                                                                               |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify:prepush`                               | Passed on final tests: format, lint, five package builds, all types, 924 tests / 86 files, web production build and artifact inspection. Core 241, UI 193, render 184, Vue 142, React 147, web 17.         |
| `pnpm test:e2e`                                     | Passed: 132 Windows Chromium tests, including visual, viewport and resource owners.                                                                                                                        |
| `pnpm test:production`                              | Passed: 2 production browser tests.                                                                                                                                                                        |
| `pnpm test:package:built`                           | Passed: packed imports/inventories/types/no-DOM/SSR and 3 Vue browser tests.                                                                                                                               |
| `pnpm test:react-vite:built`                        | Passed: packed imports/inventories/types/no-DOM/SSR and 6 React browser tests/two parity images.                                                                                                           |
| `pnpm test:nuxt:built`                              | Passed: actual typecheck/SSR, 8 dev, 8 production and 6 static tests; 2 server-only tests intentionally skipped in static mode.                                                                            |
| `pnpm test:next:built`                              | Passed: actual typecheck/SSR, 8 dev, 8 production and 10 root Strict Mode tests.                                                                                                                           |
| Core `typecheck:domain-nodom`, `test:packed-domain` | Both passed. Packed internal/root exclusions and numerical notch intervals remain checked.                                                                                                                 |
| Generated gamut tables                              | Passed inside render tests; generated input unchanged.                                                                                                                                                     |
| Final Linux numerical/traversal owners              | Passed: 19 tests on Node 24.17.0 in pinned Playwright v1.61.1 Noble.                                                                                                                                       |
| Pinned Linux visual process                         | Passed: frozen pnpm 11.9.0 install, package build, `fonts-dejavu-core`, 132 web tests and 6 packed React tests/two parity images, pinned Playwright v1.61.1 Noble / Chromium 149.0.7827.55 / Node 24.17.0. |

The first converged `verify:prepush` passed 923 tests. Adding the direct disconnected-traversal regression invalidated that render test evidence; its focused check and a complete final `verify:prepush` passed with 924 tests. Production/adapter/browser inputs did not change. No failed aggregate is represented as passed by a focused retry. Final evidence documents are completed afterward and receive fresh formatting/diff/preservation checks; executable and generated inputs remain unchanged.

### Exact closeout files

Only these 13 existing product-tree paths changed relative to the recorded starting snapshot (some were already untracked Phase 2O files):

- `README.md`
- `packages/render/README.md`
- `packages/render/test/perceptualGuides.test.ts`
- `packages/render/test/perceptualOracle.ts`
- `packages/render/test/tracedGuides.test.ts`
- `docs/phase-2o-field-viewport-spec.md`
- `docs/phase-2o-acceptance.md`
- `docs/phase-2o-independent-review.md`
- `docs/phase-2o-certification-investigation.md`
- `docs/decisions/0004-field-viewport.md`
- `docs/architecture.md`
- `docs/testing.md`
- `docs/performance.md`

No product file was added or removed during closeout. Final branch/HEAD remain the baseline; 87 tracked changes and 28 individual untracked files remain, with nothing staged. Ignored logs/captures/scripts/manifests are local acceptance evidence, not transient product files.

### Acceptance verdict

**Phase 2O is ready for final human acceptance under the revised empirically validated visual-approximation contract.**

There is no remaining demonstrated implementation or acceptance-test blocker under that approved contract. This verdict is empirical product readiness, not formal continuous/topological certification, release/publication readiness or a substitute for final human review. The repository remains uncommitted.

### Evidence limits and future research

Finite chroma/parameter/directional sampling can miss narrow features, tangencies or components. The independent oracle uses the same pinned conversion library/model but never production ray roots, event signatures, assembly or refinement. Successful geometry is not a continuous all-point maximum, exhaustive component discovery, formally certified topology, exact arithmetic/root result or cross-engine numerical-equivalence claim. The metric is full-domain Euclidean centerline distance, before viewport clipping; it excludes stroke pixels/antialiasing and unsupported larger fields/third-party geometries.

The specifically expected sRGB a/b L=0.9999 `approximation-budget` result and both gamuts' L=1e-13 / 1-1e-13 failures remain unavailable; they have no successful contour accuracy claim. Every other matrix fixture must succeed and meet both limits. Exact black/white canonical points and supported empty forms remain separate successes. Hue/Lightness slider intervals retain their historical sampled tables and do not acquire the field accuracy contract.

Formal component arrangements, exceptional endpoint/model reconciliation, conservative enclosures and continuous reverse witnesses remain possible future research, conditional on a viable interactive budget. No new roadmap phase or runtime subsystem is introduced. Physical Mac/Option-wheel/trackpad, touch hardware, manual screen readers, real high-contrast display and Firefox/WebKit are not part of the pinned Chromium closeout evidence. Local gates do not imply release, publication, deployment or exact-SHA remote CI readiness.

## Historical implementation report

The remainder is the original implementation record, with numerical terminology corrected where it could imply a certificate. Its measurements and executed commands are historical. The independent review superseded its source/accuracy/verification conclusions; the approved contract and fresh closeout above govern current acceptance.

Status: implementation complete, revised after independent review (see [Review round](#review-round-blockers-a-b-questions-c-d)), and locally verified. This is an implementation record, not release or external-review acceptance. Nothing was committed, tagged, published or deployed. The decision is [ADR 0004](decisions/0004-field-viewport.md); the proposal and its audit are [the spec](phase-2o-field-viewport-spec.md) and [source audit](phase-2o-source-audit.md).

## Starting and final state

|                |                                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Starting point | `dev` at `d726a65fc3a44010c2edc92f92406fbc7f9a1136`, clean worktree. `origin/dev` was fetched and identical, so there was no drift from the audited SHA. |
| Final state    | The same commit with uncommitted working-tree changes, left for review. Nothing was committed or pushed.                                                 |
| Baseline       | `pnpm verify:prepush` passed on the untouched checkout before any change.                                                                                |

## Decisions on Q01-Q09

| ID  | Decision and evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q01 | Mathematics, the DOM-free camera store and presentation helpers live in `packages/render/src/viewport/`, exposed as `@gamut-plane/render/internal/viewport`. UI drives them through the structural `PlaneViewportPorts` and imports nothing from render. `scripts/packedConsumer.mts` already forbids `core`/`render` references in UI's packed runtime and passed; it now also asserts the new export, its root exclusion and its exact member list from the installed tarballs.            |
| Q02 | The pointer registry holds per-controller tokens (`setPointerOwnership(element, active, owner)`, default owner the element, so existing callers are unchanged). Edit and pan decide from the same pure `claimsViewportPan(event, spaceArmed)` and each declines while the other is active (`PlaneGestureInput.declines`). Tests mount them in both registration orders and prove an idle controller's `reconcile`/`interrupt`/`dispose` leaves a pan's ownership intact.                     |
| Q03 | `createViewportCamera` separates `requested` from `presented` and exposes `presented` to everything its `present` callback applies. The callback draws the raster, positions the active marker and applies every overlay from one pose. Pointer or keyboard color gestures read `presented` and call `discardPending()`. Camera-dependent DOM is imperative and re-asserted after framework patches (Vue `onUpdated`, React layout effect), so a camera frame causes no framework re-render. |
| Q04 | 8x is kept. See [quality and resources](#quality-and-resources).                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Q05 | In both parents `ColorPlane` is not keyed by editor, so one instance survives editor changes and is unmounted only when the field is unavailable. The camera resets to Fit on an accepted geometry-id change (Vue post-flush watcher, React `reconcile`), is preserved across colour, fixed-coordinate, Reference, Status, Boundary and rejected requests, and is disposed on unmount.                                                                                                       |
| Q06 | Each adapter keeps its own measurement (Vue's fallback to `getBoundingClientRect` sizes versus React's strict content box). Only the inverse camera mapping was added after the existing normalization; no measurement policy was unified.                                                                                                                                                                                                                                                   |
| Q07 | Controls are a row below the bottom gutter, never over the colour field. Vertical axis end labels are right-anchored so a longer zoomed range grows into the instrument's own padding, with a 12px size cap. The new browser test `zoomed axis labels stay out of the field` checks 320px/100%, 320px/200% and 480px text. It found a real 0.6px spill on Linux (DejaVu metrics), fixed by the cap and anchor, not by relaxing the assertion.                                                |
| Q08 | Space arming is scoped to the focused plane (document `keyup`/`blur`/`visibilitychange` listeners exist only while armed). Hover-Space was not implemented because it cannot be proven safe in nested hosts. Middle-button pan works without focus. Physical Mac Option/trackpad behavior is unverified (see below).                                                                                                                                                                         |
| Q09 | The stale RGB Reference sentence in `architecture.md` now describes the actual nearest-slice policy and its independence from camera crop. The policy itself, `native-rgb-guides.md`, and the historical 2N records are unchanged.                                                                                                                                                                                                                                                           |

## Implemented sequence

2O.0 reconciliation and ADR; 2O.1 pure contract (`math.ts`, `camera.ts`, `presentation.ts`); 2O.2 visible-window raster sampling and cache identity, plus one coherent presentation route in both adapters; 2O.3 ownership seam, pan lifecycle and inverse editing; 2O.4 controls, Alt/Option-wheel, scoped keyboard, hidden-selection explanation and axis ranges; 2O.5 lifecycle, resource and quality evidence; 2O.6 documentation and gates.

## Evidence by matrix row

| Row     | Owner and result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V01-V03 | `render/test/viewport.test.ts`: independent examples (centered 2x maps `(0.25, 0.75)` to `(0, 1)`; Fit to 2x about `(0.2, 0.8)` gives center `(0.35, 0.65)`; 8x extreme centers `0.0625`/`0.9375`), inverse round trips over [-3, 3] at `1e-12`, finite-input rejection, unclamped anchors versus documented bounded drift, true no-op at the ceiling, stepped zoom returning to the exact canonical Fit, pan sign and scale, pose independent of pixel size.                                                                                                                                   |
| V04-V06 | `render/test/fieldViewportRaster.test.ts`: all eight samplers receive window coordinates with the fixed value preserved and orientation that matches the fitted field; pan, zoom and slice change the cache key independently; the disc buffer repaints only for a new window. The camera never reaches `referenceDisplay`, so the RGB Reference endpoint stays independent of crop; point, line and empty contours are untouched because paths keep their data and only the view box changes.                                                                                                  |
| V07-V09 | `ui/test/viewportInteraction.test.ts` (30 tests): intent, both registration orders, ownership survival, wheel modifiers/cancelability/popup/zero-delta/limits, pan release, chorded release, secondary transitions, Escape/cancel/lost capture, capture failure, window blur/hiding, disposal and release of only its own capture, keyboard routing and refusal during gestures.                                                                                                                                                                                                                |
| V10-V13 | `vue/test/planeViewport.test.ts` (13) and `react/test/planeViewport.test.tsx` (17): presented-frame ordering, inverse editing including a drag past the surface, pointer-before-frame discarding the zoom, frozen camera during a gesture, rollback restoring the camera-projected marker, same-geometry preservation and editor-change reset, rejected controlled request, two instances, unmount, React Strict Mode and abandoned Suspense transitions, bursts of 20 wheel events using one frame, and zero parent re-renders (React `Profiler`, Vue `renderTriggered`) for camera-only work. |
| V14-V16 | `apps/web/e2e/viewport.spec.ts`, real Chromium: off-center Alt-wheel with independent window arithmetic; ordinary and Ctrl wheel untouched; middle and Space pan with exact-zero callbacks (`#events` counters); edit after pan; pointer press with an unpresented wheel (held RAF); chorded Space release; marker, view box, outline and axis ends from one pose; all six RGB Areas in both gamuts; the OKLab disc; CSS-scaled host; resize; hidden-then-visible surface.                                                                                                                      |
| V17     | Keyboard-only zoom/Fit/Space-arrow pan and plain arrows still authoring; Escape idle does not reset; focus stays on a button that reaches its limit (`aria-disabled`, not `disabled`); axe is unchanged in the existing accessibility specs; label containment at 320/480px and 200% text; forced-colors button styles.                                                                                                                                                                                                                                                                         |
| V18     | The packed React host runs one installed camera interaction. The packed inventory asserts the export from tarballs. Nuxt and Next render and hydrate the new markup; Next Strict Mode's exact listener counts were updated from 18 to 36 (nine viewport listeners per plane).                                                                                                                                                                                                                                                                                                                   |
| V19     | `viewportResources.spec.ts` plus raster tests: backing size identical at every zoom (also at DPR 2), identical gradient and stop counts per frame, at most one scheduled frame per camera step, zero React/Vue re-renders.                                                                                                                                                                                                                                                                                                                                                                      |

Totals after the review round, against the baseline: core 238 to 246 (8 traced-guide tests); UI 153 to 189; render 121 to 167 (4 traced-guide resolution tests); Vue 122 to 135; React 124 to 141; web unit 17; web Chromium e2e 104 to 131 (27 new: 23 in `viewport.spec.ts`, 4 in `viewportResources.spec.ts`).

## Gates run

Run sequentially on the final tree after the review round (packages rebuilt by `verify:prepush` before the packed gates). Packed gates ran from PowerShell because Git Bash's GNU `tar` treats `C:` as a remote host, an environment limitation independent of this change.

| Command                      | Result                                                                                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify:prepush`        | exit 0 (format check, lint, build, typecheck, all unit/component suites, web build, `check:build`)                                                                                                 |
| `pnpm test:e2e`              | 131 passed, 0 failed, 0 retried (Windows Chromium); 131 in the pinned Noble image with `fonts-dejavu-core` (127 passed before adopting the 4 reviewed enlarged-text references, which then passed) |
| `pnpm test:production`       | 2 passed                                                                                                                                                                                           |
| `pnpm test:package:built`    | exit 0, 3 passed                                                                                                                                                                                   |
| `pnpm test:react-vite:built` | exit 0, 6 passed (also exit 0 in the Noble image)                                                                                                                                                  |
| `pnpm test:nuxt:built`       | exit 0, 8 / 8 / 6 passed                                                                                                                                                                           |
| `pnpm test:next:built`       | exit 0, 8 / 8 / 10 passed                                                                                                                                                                          |

In the review round: a render test helper typed its contour too narrowly (typecheck, fixed); two useless spreads and a constant loop condition were flagged by lint and fixed; the four enlarged-text references failed as intended after the gutter change and were regenerated after review. Earlier focused failures, encountered and resolved on the way, not hidden: a `role="status"` announcement region collided with the app's own status lookup and its `[aria-live]` violated the repository's "no live-region spam" tests, so it was removed; the plane Tab-order test now expects the viewport buttons that follow the plane; the Next Strict Mode listener counts were updated; one Linux-only label spill was fixed in CSS. No threshold, science constant or readiness contract was relaxed. A CI run for the exact final SHA has not been observed, because nothing was committed.

## Visual references

Layout changes intentionally (one control row; narrower y gutter text). Windows: 25 app references and one React parity reference were regenerated; Linux: the same 25 plus one React reference, generated in `mcr.microsoft.com/playwright:v1.61.1-noble` with `fonts-dejavu-core`. They were viewed before adoption (compact 440px, native RGB Area at 320px, OKLab enlarged text, outside Reference excursion, React parity): the field, contours, markers and typography are unchanged; the controls row sits under the x labels at the right edge. Release/social assets and every other reference are untouched.

Review round: the four enlarged-text references per platform (`oklab-direct-enlarged`, `gamuts-enlarged`, `shell-enlarged-popup`, `generalized-editable-enlarged-text`) were regenerated on Windows and in the Noble image after side-by-side review. They are 10 px shorter because the field is 10 px smaller, and the vertical end labels are back at the full label size; nothing else moved. The traced guides change the drawn boundaries by well under a pixel at 1x for the hues and lightnesses in the references, so every other reference still passes within the unchanged 0.3% threshold and none was regenerated for them. The visible guide corrections are in zoomed views and at the blue and yellow cusps, as quantified in [blocker A](#a-guide-fidelity-under-zoom). Zoomed states were reviewed from throwaway captures at 1x, 4x and 8x for OKLCH, OKLab and sRGB R/G; no zoomed screenshot is committed because the structural tests assert the same facts.

## Quality and resources

Measured in headless Chromium on Windows (386px viewport, DPR 1), three runs of `viewportResources.spec.ts`; these are context-specific timings, not a frame-rate claim.

| Field     | Backing store           | Gradients / stops per frame | Median camera-frame JS, 2x / 4x / 8x |
| --------- | ----------------------- | --------------------------- | ------------------------------------ |
| OKLCH L/C | 386 x 386 at every zoom | 386 / 15,440                | 17-19 / 17-19 / 33-36 ms             |
| OKLab a/b | 386 x 386               | 80 / 1,920                  | 3.5-4.0 / 3.5-4.0 / 4.4-4.9 ms       |
| sRGB R/G  | 386 x 386               | 386 / 15,440                | 20-21 / 21-22 / 39-41 ms             |

Allocation, gradient counts and scheduling are the same at every zoom. **Corrected in review:** the earlier claim that cost "depends on the visible region, about 18 ms for some windows and about 33 ms for others" was a measurement artifact. Headless Chromium on this Windows host slows every renderer process about 2x a few seconds after load, including JS-only and Canvas-only control pages with no app code. In headed Chromium camera frames cost the same as the pre-existing fixed-coordinate redraw. See [blocker B](#b-sustained-viewport-redraw). At DPR 2 the backing store is exactly twice the CSS size before and after 8x. Hot spots were not optimized further.

**Superseded in review:** the first submission kept the table-interpolated perceptual guides and reported only a horizontal chroma metric. The review measured real normal displacement of up to 45 px (near white) and 241 px (blue cusp) at 8x. Perceptual guides now use bounded-work numerical tracing with the empirical accuracy target. See [blocker A](#a-guide-fidelity-under-zoom). The raster samples the visible window at viewport-sized backing resolution; this does not assert exact per-pixel colorimetry.

## Review round: blockers A, B, questions C, D

An independent review accepted the viewport architecture but found two blockers and two presentation questions. Raw tables, methods and probes are in [Phase 2O review evidence](phase-2o-review-evidence.md). The architectural boundaries were kept unchanged:

- the camera is ephemeral and outside `ColorValue`/`GamutPlaneState`;
- requested versus presented is authoritative;
- input uses the inverse presented pose;
- camera actions emit no color/state/check callbacks;
- geometry changes reset Fit;
- UI has no runtime render dependency;
- Vue and React share all of the changes below, because they live in core, render and the shared stylesheet.

### A. Guide fidelity under zoom

**Root causes.** There were three, the last of which the review had not identified.

1. **Cusp truncation near white:** 65 lightness rows (1/64 spacing) cut across the sharp yellow cusp. At h 109.5 the normal displacement was 5.6 px at 1x and 45 px at 8x. Lightness sampling explains it entirely: the exact-hue chord has the same error.
2. **Hue blending at the blue cusp:** bilinear blending across 3° hue columns of the sRGB blue cusp. Cusp L moves from 0.493 to 0.459 between 264° and 267°. Displacement was 30 px at 1x and 241 px at 8x.
3. **Notches a single max chroma cannot represent:** near the sRGB blue vertex (a/b slices around L 0.40-0.48) and near black at those hues (L/C slices), one chroma ray leaves the gamut, re-enters and leaves again, so the true slice has a notch. A table, `findMaximumChroma` and any max-chroma-per-ray scheme keep one arbitrary crossing. The old guide drew a chord across the notch. A first adaptive prototype built on `findMaximumChroma` still measured 78 px at 8x there.

**Historical implementation decision** ([spec §16](phase-2o-field-viewport-spec.md#16-review-blocker-a-guide-fidelity-under-magnification)). Core computes numerical ray crossings; render now owns slice tracing (`packages/render/src/perceptualGuides.ts`):

- Candidate crossings use floating-point cubic root queries and membership tests, not exact root arithmetic.
- Detected corner and fold signature changes are localized to 1e-13 of the slice parameter; finite seeds do not prove all events were found.
- Discovered branches are refined using a midpoint/chord threshold of half the visual target; this is not a continuous bound.
- Discovered branches are stitched into a visual approximation, including observed notches. L/C black-side loops precede the main black-to-white chain; detected incomplete traversal fails.

The numerical refinement target `GUIDE_FIDELITY_BOUND` = 1/(8 × 480) corresponds to 1 CSS px at 480 px/8x. The original report treated measured small errors as meeting an all-point bound; the independent review correctly rejected that inference. The approved closeout now checks both finite directions. Work remains bounded and exhaustion reports `approximation-budget`. Geometry remains camera-independent (I06). The perceptual Reference endpoint and Chroma slider use the same numerical ray intervals, including two intervals inside an observed notch. Reference/contour agreement is sampled evidence, not exact coincidence at every zoom. Exact Status decides when an excursion shows. Finer tables, per-frame viewport refinement and a table-seeded hybrid were evaluated and rejected (§16.5).

**Results** (independent texel-based oracle, 0.3-1.1 million crossings per gamut and plane):

| Guide                      | Field     | max error 1x / 4x / 8x (386 px field) | max at 8x, 480 px | p95 at 8x (386 px) |
| -------------------------- | --------- | ------------------------------------- | ----------------- | ------------------ |
| previous table, sRGB       | OKLCH L/C | 33.0 / 132.1 / 264.2 px               | 328.5 px          | 8.65 px            |
| previous table, sRGB       | OKLab a/b | 16.2 / 64.9 / 129.8 px                | 161.4 px          | 0.61 px            |
| previous table, Display P3 | OKLCH L/C | 14.9 / 59.8 / 119.5 px                | 148.7 px          | 3.92 px            |
| previous table, Display P3 | OKLab a/b | 25.3 / 101.2 / 202.4 px               | 251.7 px          | 0.66 px            |
| traced, sRGB               | OKLCH L/C | 0.050 / 0.201 / 0.402 px              | 0.499 px          | 0.139 px           |
| traced, sRGB               | OKLab a/b | 0.054 / 0.214 / 0.428 px              | 0.533 px          | 0.192 px           |
| traced, Display P3         | OKLCH L/C | 0.050 / 0.201 / 0.401 px              | 0.499 px          | 0.132 px           |
| traced, Display P3         | OKLab a/b | 0.051 / 0.206 / 0.411 px              | 0.512 px          | 0.201 px           |

Cost per uncached slice (Node, this machine): L/C mean 0.5-0.6 ms (max 2.3 ms) with 108 vertices on average (max 364); a/b mean 1.2-1.4 ms (max 7.8 ms) with 255-311 vertices (max 386). There were no budget failures across 1,150 slices. A one-entry memo per gamut and plane kind means dragging inside a plane never retraces.

### B. Sustained viewport redraw

**Reproduction.** A controlled benchmark reproduced the review's drift: the same editor, field, DPR and redraw sequence, 200 frames per fresh page, in the production and dev builds, for OKLCH, OKLab, sRGB R/G and Display P3 R/G. In headless Chromium OKLCH camera frames at 4x went from 20.9 ms (median, frames 1-20) to 30.4 ms (frames 180-200) in production and from 19.1 to 34.3 ms (frames 80-100) in dev. sRGB went from 21.5 to 37.2 ms. **The 1x fixed-coordinate redraw, which involves no camera, drifts the same way** (production OKLCH 19.6 to 36.6 ms).

**Isolation.**

- Instrumented runs show the native Canvas share and the JS share both roughly doubling (prod OKLCH camera: native 20.3 to 40.1 ms, JS 4.4 to 8.7 ms).
- A Canvas-only page with no app code degrades the same way, from 17 to 36 ms, even with identical color strings every frame.
- A JS-only page that builds the same strings without Canvas degrades from 2.8 to 5.6 ms.
- `--disable-renderer-backgrounding` and the related flags do not change any of this.
- In headed Chromium none of it happens. JS-only stays at 2.6-2.7 ms and Canvas-only at 17-18 ms, with occasional slow windows up to 36 ms that are unrelated to the app. The real app shows no sustained growth in either build: OKLCH camera at 4x is 18.1, 17.8 and 17.4 ms (prod) and 17.0, 16.2 and 21.0 ms (dev) across the three windows.

**Root cause.** The drift is an execution-environment effect of headless Chromium on this Windows host: the whole renderer process slows a few seconds after load. It is not the viewport implementation, the field renderer, or a resource or lifecycle leak. Heap, DOM nodes and listener counts were already shown to be flat.

**Product relevance.** In headed Chromium a camera frame costs the same as the pre-existing redraw that a fixed-coordinate change triggers at 1x. OKLCH is 17.4-18.1 ms per camera frame versus 17.2-24.2 ms per fixed-coordinate redraw. OKLab is 3.2-3.4 ms versus 2.8-4.1 ms. sRGB and P3 are 17.5-26.8 ms versus 18.6-25.5 ms. The viewport adds no per-frame cost and no sustained defect was demonstrated, so nothing was optimized. Column-gradient fields remain above a 16.7 ms budget per full redraw, as they were before Phase 2O.

### C. Enlarged-text axis labels

The 12 px cap on vertical end labels only hid a layout shortfall. At 200% text the left gutter was clamped to 42 px, while a six-character zoomed label at the shared 14 px size needs about 50 px plus its 4 px gap. That produced the 0.6 px Linux spill. The cap is removed, and the gutter's upper clamp is raised from 42 to 56 px. The gutter keeps tracking `1.625rem`, so at the default text size it is unchanged (26 px), and only text above 162% gets a wider gutter (52 px at 200%). Labels stay in the gutter and never overlay the field. The existing `zoomed axis labels stay out of the field` browser test (320 px at 100% and 200%, 480 px) passes on Windows and Linux. Four enlarged-text references changed intentionally on each platform: the field is 10 px smaller and the vertical labels are back at the full label size. Forced-colors coverage passes unchanged.

### D. Gamuts popup placement

There is no change. The popup opens upward only when `below < height && above > below`. In the 440 px references (1440x1000) the new 35 px control row moves the trigger from 765 to 801 px, cutting the space below from 227 to 191 px, under the popup's 205 px. With the row removed, or with a 1100 px viewport, it opens downward. The enlarged-text references flip with or without the row, as they did before Phase 2O. In every case the popup stays inside the viewport, adjacent to its trigger and readable. Focus behavior is unchanged: a pointer click leaves focus on the trigger, and the keyboard path enters the popup. That is the existing top-layer contract working as designed rather than a regression, and the control row is necessary layout, so the placement is left as is. The trade-off: in short viewports the open popup covers the field whose boundaries it toggles. That was already true before the row was added.

## Deviations from the proposal

- No live announcement region. The repository forbids `[aria-live]` inside the instrument, so discrete actions are reflected by the visible zoom readout and the `aria-describedby` status text.
- The camera's `presented` pose is already the new pose while its `present` callback runs (and reverts if the callback throws), so every layer applied in one frame reads one pose.
- Vertical axis end labels are right-anchored at the shared label size; the left gutter's upper clamp is 56px instead of 42px so enlarged text keeps room for them. `--picker-plane-controls` adds one control row of layout height.
- Perceptual guides use render-owned numerical visual tracing with the empirical target in spec §16; Reference/Chroma use core's numerical ray intervals. These internal exports do not add a public headless API.
- The pointer-registry signature gained an optional owner argument; the camera adds internal `data-gp-viewport-zoom`, `-armed` and `-panning` attributes. Neither is public API.

## Remaining manual checks and limitations

- Option+wheel and trackpad scroll on a physical Mac, physical touch devices (single-pointer editing is covered only by unit logic and desktop Chromium), real screen readers and a real high-contrast display were not available; forced-colors coverage is a Chromium emulation.
- Firefox and WebKit were not run. Chromium evidence is not claimed as all-browser coverage.
- Pinch, inertia, rotation, hover-Space arming, Fit Reference/boundaries, a controlled or persisted camera and a public headless API are out of scope.
- At 200% text and maximum zoom a six-character Y end label extends about 2.5 px into the instrument's own 12px left padding; a flush host with zero padding would clip that much.
- Hue and Lightness slider intervals still interpolate the sampled table. They are not magnified by the camera; making them exact was out of this review's scope.
- The approved guide contract covers fields up to 480 CSS px; larger displayed fields have no acceptance claim.
- Same-engine deterministic numerical recomputation/serialization is tested; exact arithmetic/roots and equivalent results across every engine are not claimed.
- Release, external review and CI on the exact final SHA remain separate steps.
