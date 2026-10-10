# Phase 3C.1-R: Spatial continuity and interaction refinement

Starting source: `47cdb364719650c33d1d60016e71e07686869d90`, clean `dev`, matching freshly fetched `origin/dev`.

This is an application presentation refinement. The authored `ColorValue`, core conversion and membership, Float64 section solver, scientific tolerances, radial mesh, GPU upload boundary, and compact instrument implementation are unchanged. Observations below describe exercised behavior; design judgments are not claims from user research.

## Independent audit

The initial audit used the real `/spatial` application, its native controls, keyboard camera interaction, and browser screenshots before implementation. Existing browser journeys supplied additional mouse, responsive, accessibility, and geometry evidence. Baselines cover 1600×1250, 1366×768, 390×900, 320×700, and enlarged text. The baseline laptop captures were subsequently reproduced from an isolated copy of the starting application source, using the unchanged built workspace packages.

| Priority | Observed problem                                                                                                                               | Cause and classification                                                                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | Show selected leaves independently chosen lightness and returns to Follow.                                                                     | Recovery owns section selection in the host. Interaction defect: visibility and inspection intent are different operations.                                                         |
| High     | Rotating across the horizon exchanges the removed volume; approaching a pole replaces the volume with a different composition.                 | Camera direction chooses the cut sign on every frame; an independent 20° threshold chooses section-only presentation. Both are presentation heuristics, not scientific necessities. |
| High     | The default L/C field and horizontal a/b section have different outlines and directions.                                                       | Both are scientifically correct but their relationship is implicit. Correspondence problem, not a conversion defect.                                                                |
| High     | On laptop layouts, the section controls and explanations precede the editor, pushing its editing controls below the scene.                     | Host composition problem. The compact instrument itself does not need a new anatomy.                                                                                                |
| Medium   | The aligned section competes with whole-volume silhouettes and an oversized footprint; a small section can be dominated by unrelated outlines. | Visual hierarchy judgment supported by the rendered states. A whole-volume silhouette is not a lightness contour.                                                                   |
| Medium   | Scrubbing after alignment can make the section very small, while another alignment command changes its scale again.                            | Initial alignment also fits the current extent. Stable scientific comparison and detailed fitting are different camera intentions.                                                  |
| Medium   | An off-plane marker can occupy almost the same screen position as its projection when viewed along L.                                          | Necessary consequence of orthographic projection. The absent depth dimension needs a textual relationship, not a falsified position.                                                |
| Medium   | Keyboard rotation leaving the lower pole can reverse azimuth.                                                                                  | Rotating a Cartesian offset through the pole before OrbitControls reconciles its spherical frame. Actual interaction defect.                                                        |

The audit retained the solid/dashed contour identities, true-position marker, hidden-marker ring, drop line, exact membership ownership, and reduced-motion behavior. An empty or point section, a narrow near-black section, and an out-of-gamut marker are legitimate outcomes. Surface faceting, approximate GPU membership, and unqualified physical P3 reproduction remain experimental limitations.

## Alternatives and chosen interaction model

The chosen model separates three existing intentions: **edit the color**, **choose the inspected lightness**, and **change how the scene is viewed**. It adds no editor, color engine, or general camera-mode selector.

- **OKLab a/b starts the spatial host.** Its field and the followed section share the same constant-L plane. The initial authored definition remains OKLCH; choosing a representation never reauthors it. The main compact application and package defaults are unchanged.
- **OKLCH remains available.** Contextual host copy explains that chroma moves radially in a/b and lightness moves vertically. A radial guide was considered but rejected for this refinement: it would add another line identity before demonstrating that a second visual reference is needed. A complete hue half-plane remains out of scope.
- **Alignment uses a common comparison frame.** Automatic refitting during scrubbing was rejected because it conceals area differences. Fit section is an explicit alternative when detail matters.
- **Cut side is persistent intent.** Gesture-only latching would defer a flip to release and still surprise users. The cut is instead retained across gestures, reversals, camera resets, color edits, and gamut changes until Flip cut or View section explicitly establishes another side.
- **Recovery uses an explicitly disclosed outline presentation.** A camera move alone cannot reveal a point inside an opaque solid from every direction. Following the color would discard inspection intent. Hiding the surfaces while retaining contours, volume outlines, the footprint, and the true marker solves the visibility problem without changing either selection.
- **No transition animation.** State changes remain immediate and independently actionable. The first orbit after explicit alignment returns to the volume composition; it is a deliberate composition boundary, not a claim of continuous geometry morphing. Reduced motion uses the same path.

## Camera and cut semantics

| Action          | Camera                                                                                                | Presentation                                                                                   | Scientific / inspection state          |
| --------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------- |
| View section    | Looks from below along +L, +a right, +b up; common centered ±0.45 a/b comparison extent               | Section-only; enables the lower cut for subsequent orbit                                       | Preserved                              |
| Fit section     | Fits only visible section bounds in the current orientation, with margin and the existing zoom limits | Preserved                                                                                      | Preserved                              |
| Fit visible     | Fits visible gamut bounds and the selected marker in the current orientation                          | Preserved                                                                                      | Preserved                              |
| Home            | Restores the established oblique whole-gamut camera                                                   | Restores surfaces; leaves section-only presentation; preserves cut side                        | Preserved                              |
| Orbit           | User-owned orientation and scale                                                                      | Leaves section-only presentation; never flips the cut or automatically returns to section-only | Preserved                              |
| Pan / zoom      | User-owned framing                                                                                    | Keeps section-only presentation if aligned                                                     | Preserved                              |
| Flip cut        | Unchanged                                                                                             | Exchanges the explicit upper/lower removed half-space                                          | Preserved                              |
| Show selected   | Fits gamut and selected point in the home orientation                                                 | Hides body and cap; keeps truthful outlines and marker                                         | Preserved, including Inspect lightness |
| Restore surface | Unchanged                                                                                             | Restores body/cap; marker may become occluded again                                            | Preserved                              |

Section or color changes do not move the camera. Repeating View section restores the same comparison scale for the same canvas aspect, regardless of lightness. Fit section deliberately excludes an off-plane marker: otherwise a remote selected point would prevent inspection of a small contour. Show selected and Fit visible address the marker independently.

Keyboard orbit now modifies a bounded Y-up spherical frame, keeping the camera away from the singular poles. Pointer orbit remains owned by OrbitControls. Alignment ends when the camera direction actually changes, not on a 20° presentation threshold; pan and zoom retain it. No easing, damping, idle rendering loop, or geometry regeneration was introduced.

The cut label names the removed half-space. Cut controls are unavailable in section-only and recovery presentations, where no volume surface is drawn. Viewing the retained side may occlude the section: this is now an honest consequence of a stable cut, with Flip cut available when the user wants the other half removed.

## Selected color, section, and recovery

The marker remains `(a,L,b)` from the accepted observation. Neither recovery nor fitting projects, clamps, maps, or authors it. The filled marker and hollow hidden ring retain their depth-tested meanings. The drop line has no second marker at its endpoint.

During independent inspection, a contextual relationship reports selected L, section L, and signed ΔL. It makes out-of-plane displacement explicit even when projection collapses the drop line. Exact membership and numerical extents remain available under **Color and section details**. Empty, point, and unavailable section outcomes remain visible without opening the disclosure.

The persistent recovery button changes from Show selected to Restore surface in place, preserving keyboard focus. Both the stage caption and summary disclose that surfaces are hidden. Home and View section also restore surface presentation as part of their explicit view command. Ordinary edits, section scrubs, comparison changes, and camera gestures do not silently cancel recovery.

## Hierarchy and responsive composition

In oblique view, the volume, section location, and true marker lead; the footprint and removed-volume ghost supply context. In aligned view, only the cap, actual current-L contours, marker, and any genuine drop line remain. Whole-volume silhouettes, footprint, spatial axes, and projected plane tag are suppressed. The caption states +a right / +b up. Solid sRGB and dashed Display P3 line identities are retained independently of color.

Section controls now sit directly beneath the scene. The compact instrument occupies its own adjacent column from the top, with a bounded correspondence note. Its internal components and stylesheet are unchanged. Detailed extents move into a native disclosure. The desktop host uses a narrower editor column, allowing the editing field and lightness control to remain visible with the scene at 1366×768.

Sticky positioning is restricted to desktop widths and heights of at least 760px, with a viewport-sized stage. Short and narrow layouts use normal document flow; opening detailed facts also releases sticky positioning. Phone canvases use a square aspect so the equal-unit projection fits its orientation references; the introduction stacks instead of squeezing its copy beside the heading. Narrow layouts retain scrolling rather than compressing the scientific scene into a miniature. Simultaneous full editor/scene visibility is not promised on a 320px phone or a short zoom-equivalent viewport.

## Architecture and implementation

- `spatialApp.vue`: host-only OKLab default, compact control composition, correspondence and ΔL text, exceptional-state disclosure, direct camera recovery call.
- `spatialScene.ts`: explicit cut intent, aligned presentation, disclosed recovery presentation, Fit section, and visibility policy. These remain local renderer presentation state, separate from `sectionModel`.
- `spatialCamera.ts`: bounded keyboard orbit. Existing equal-unit orthographic projection and fitting mathematics remain authoritative.
- `sectionPolicy.ts`: removes obsolete camera-sign cut selection and near-normal composition heuristics; retained clipping and occlusion helpers keep their scientific/presentation distinction.
- Tests: new complete interaction journeys; older fixtures explicitly request OKLCH where that representation is the subject, and explicitly choose the upper cut where required by their occlusion fixture.

No new dependency, public export, conversion path, section-cache key, scientific tolerance, mesh generator, shader mapping, scheduler, or resource lifetime was added. Existing VueUse resize, event, and visibility ownership was retained; this refinement did not require a new generic browser primitive. SSR allocation boundaries, lazy spatial imports, context restoration, and disposal remain covered by existing gates.

## Browser evidence and recordings

Evidence is generated from real Chromium rendering, not mockups. Local full-resolution files and logs are under `.artifacts/phase3c1r/`:

- `before/`: starting-source captures, including Shape/Color, section alignment, independent inspection, hidden marker, and 1600/1366/390/320px workspaces.
- `after/`: corresponding final-source captures and existing spatial numerical/browser evidence.
- `sequence/interaction.webm`: editing L/C/H, moving the section, alignment, independent L 0.136 inspection, pointer orbit, in-gesture reversal, release, and selected-marker recovery.
- `sequence/000-…032-*.png` and `frames.json`: 33 captured interaction checkpoints, with camera matrices, cut intent, marker position, section lightness, upload counts, and section-computation counts.
- `final-video-review-*.png`: seven contact sheets of every decoded recording frame for continuity inspection.

Reviewable evidence is committed with this document:

- [Laptop workspace](evidence/phase-3c1r/workspace-1366.png).
- Oblique cut-away: [Shape](evidence/phase-3c1r/desktop-follow-shape.png) and [Color](evidence/phase-3c1r/desktop-follow-color.png).
- Aligned command: [Shape](evidence/phase-3c1r/desktop-section-view-shape.png) and [Color](evidence/phase-3c1r/desktop-section-view-color.png).
- [Independent inspection](evidence/phase-3c1r/desktop-inspect-0.3.png), [hidden marker](evidence/phase-3c1r/desktop-marker-hidden.png), and [recovery](evidence/phase-3c1r/desktop-show-selected.png).
- [390px](evidence/phase-3c1r/workspace-390.png) and [320px](evidence/phase-3c1r/workspace-320.png) workspaces.
- [Interaction recording](evidence/phase-3c1r/interaction.webm) and [33 checkpoint facts](evidence/phase-3c1r/interaction-checkpoints.json).

The 9.92-second recording contains 248 decoded frames at 25 fps. All were inspected in chronological contact sheets, not just the checkpoints. The initial frame briefly precedes the first section commit. Accepted lightness changes move the section and marker; chroma and hue edits move the marker without recomputing the same lightness section. Alignment changes composition immediately. Independent inspection retains comparison scale. The first pointer orbit restores the volume once; subsequent horizon crossing and in-gesture reversal retain the same removed half-space. Home and recovery are explicit discrete commands. Recovery reveals the true marker and drop line while retaining L 0.136. There is no claim of an animated or continuous composition morph.

Workspace comparisons use matched viewport dimensions and the unchanged Home camera. Aligned comparisons deliberately show the changed framing command: the old command fitted the section, while the new one establishes a common scale. They must not be treated as a matched-scale measurement of geometry. Shape and Color comparisons retain the existing sRGB-preview qualification; screenshots do not establish display-color accuracy.

Reproduction after building packages (run browser work separately from package rebuilds):

```powershell
$env:SPATIAL_SCREENSHOTS = "$PWD/.artifacts/phase3c1r/after"
$env:SPATIAL_REFINEMENT_EVIDENCE = "$PWD/.artifacts/phase3c1r/sequence"
$env:SPATIAL_MATCHED_EVIDENCE = "$PWD/.artifacts/phase3c1r/after"
pnpm --filter @gamut-plane/web exec playwright test e2e/spatial.spec.ts e2e/spatialSection.spec.ts e2e/spatialRefinement.spec.ts
```

## Validation record

Windows x64, Node 24.16.0, pnpm 11.9.0, Playwright Chromium. Software-rendered browser results are not physical-GPU performance evidence.

- `pnpm verify:prepush`: passed; 1,287 unit/component tests, formatting, lint, package builds, type checks, production build, and eager/lazy graph checks.
- Focused new behavior checks: stable camera through section scrubbing; fitting without numerical recomputation; inspection-preserving recovery and restoration; both camera hemispheres and reversals with fixed cut intent; mouse interaction sequence; laptop co-visibility and short-height normal flow.
- An intermediate 34-case spatial run had 32 passes and two invalidated checks. A concurrent package rebuild replaced Vite inputs and caused a navigation/context destruction during lifecycle and orbit tests. Both passed the immediate `--last-failed` rerun after the build. This is retained as an execution-environment failure, not relabeled as a clean aggregate pass or a product flake.
- The complete local browser suite passed: 219 tests, including compact instrument regressions and both context-menu cases at the previously reported line 319. This run preceded the final contextual-copy, unobservable-state, and narrow-layout corrections.
- After the copy and unobservable-state corrections, all 35 spatial browser tests passed, including the stronger recorded pointer journey through both hemispheres. After the final phone-only layout adjustment, all four affected visual, responsive, enlarged-text, and accessibility checks passed. Earlier broad evidence is not presented as a rerun on those later trees.
- The final production build, lazy-import artifact inspection, and three served-production tests passed after the final layout adjustment.
- Exact-commit CI status is reported at delivery. Its required jobs include the full Linux browser suite, installed Vue/React consumers, and Nuxt/Next SSR, hydration, generated output, and Strict Mode. No pending CI result is asserted here.

Camera-only checks compare computation and upload counters; they establish no additional numerical section work for the tested actions. The recording starts with one computation, reaches two after the lightness edit, three after inspecting L 0.5, and four after L 0.136; all subsequent orbit, reversal, Home, and recovery checkpoints stay at four. Mesh-resource identities remain unchanged. Existing idle-render, burst/latest-accepted-state, DPR, cap-edge, exact-contour, resize, context loss/restoration, disposal, accessibility, keyboard, extended-color, and compact visual-regression checks remain in the suite, with unchanged visual thresholds.

## Remaining limitations and Phase 3C.2 entry

This is a design judgment supported by exercised interactions, not a usability study. It does not establish that every user will immediately infer every coordinate relationship. Small constant-L sections remain small at comparison scale; fitting is intentionally explicit. Restoring opaque surfaces can hide an interior marker again. Recovery keeps the existing finite zoom and camera-depth limits; arbitrarily extreme finite coordinates are not a newly qualified camera domain.

The first orbit from an explicitly aligned view restores spatial context immediately. This is a discrete, explainable presentation change, not a smooth morph. Geometry no longer swaps half-spaces at the horizon, and free orbit no longer enters or exits section-only composition at angular thresholds. No physical GPU, thermal, Safari/Firefox WebGL, or physical Display P3 qualification is claimed.

Phase 3C.2 should begin with a separate hue-section geometry and result contract: radial half-plane rather than full plane, C≥0, achromatic hue ownership, exact/core validation, provenance, empty/degenerate/unavailable semantics, and resource bounds. It must preserve one authored color and independent inspection, reuse the explicit camera/cut/recovery semantics, and prove representation correspondence in complete browser journeys. A hue direction cue should be justified by observed need before adding another persistent geometric layer. Do not infer that this refinement qualifies a hue-section solver or licenses a second editor.
