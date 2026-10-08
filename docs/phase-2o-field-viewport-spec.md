# Phase 2O: Field Viewport

Status: implemented and human accepted under the visual-approximation contract revised on 8 October 2026. Local closeout and repository integration evidence are distinguished in [Phase 2O acceptance](phase-2o-acceptance.md). The original planning snapshot below remains historical.
Repository: `maikeleckelboom/gamut-plane`, `dev`.
Inspected commit: `d726a65fc3a44010c2edc92f92406fbc7f9a1136`.
Prepared: 7 October 2026.
Companion: [source audit and evidence](phase-2o-source-audit.md).

## 0. Authority and how to use this document

The approved direction is to implement zoom before new views, picker geometries, color models or a public headless API. This document turns that direction into a concrete implementation proposal against the inspected source.

**Hard requirements** are the authored-state invariants, shared Vue/React semantics, truthful geometry, browser-shortcut protection, dependency boundaries and explicit exclusions below. **Proposed defaults** include the 8x ceiling, bounded camera, lifecycle reset policy, control arrangement and keyboard-pan extension. They are recommendations made during this design, not historical user decisions. Claude should adopt them unless a repository-backed conflict is demonstrated. **Engineering questions** in section 14 must be resolved with code or test evidence, not silently guessed.

Do not interpret a source snapshot as a guarantee that `dev` has not advanced. Fetch the current branch, record its SHA and reconcile relevant changes before editing. Preserve unrelated local work. Do not reset the working tree to this historical SHA.

The planning environment could read the pinned source through the GitHub connection but could not clone GitHub into its container. Repository builds, unit tests, browsers and performance measurements were not run. The companion math check verifies proposed equations only. No repository or remote changes were made while preparing this handoff.

## 1. Product outcome and scope

A user can magnify and explore an existing editing field while retaining the same color, coordinate system, gamut facts and editing operations. Ordinary primary-pointer editing continues to work at every supported zoom. Magnification reveals a smaller part of the same field, not a new color domain.

The feature applies to the eight currently admitted editors: `oklch-lc`, `oklab-ab`, `srgb-rg`, `srgb-rb`, `srgb-gb`, `display-p3-rg`, `display-p3-rb` and `display-p3-gb`. Inspection has no manufactured field or camera UI.

The desktop surface provides pointer-anchored Alt/Option-wheel zoom, Space-primary-drag and middle-button pan, visible zoom controls, Fit and keyboard equivalents. Existing touch editing and usable native buttons must continue to work; multi-touch viewport gestures are deferred.

Out of scope: new spaces, polar H/C, classic picker, alternative Field Views, multi-reference redesign, mapping/output workflows, persisted or controlled camera APIs, public headless APIs, rotation, inertia, camera animations, new dependencies, a new package, an infinite canvas, automatic marker following, Fit Reference and Fit visible boundaries. Do not use this phase to redesign the instrument shell or clean up unrelated code.

## 2. Non-negotiable invariants

| ID  | Requirement                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I01 | A camera-only action never authors, maps, clamps or serializes a replacement `ColorValue`. It emits no color change, commit or cancel callback.                                                             |
| I02 | A camera-only action does not request or mutate `GamutPlaneState`, whose dimensions remain selection, checked gamuts, visible guides and Reference.                                                         |
| I03 | Geometry projection, domain containment, constraint, point authoring, untouched channels, alpha, powerless-hue handling and defining equality remain core responsibilities.                                 |
| I04 | Raster samples, paths, domain outline, hit paths, markers, connectors and axis readouts use the same camera snapshot and coordinate convention. This does not require one enclosing DOM transform.          |
| I05 | Input applies the inverse camera before the existing geometry constraint and editor operation. Camera math itself does not constrain a color/field point.                                                   |
| I06 | Camera-only updates do not request exact gamut analysis, resolve new guide contours, choose a new Reference endpoint or change guide availability. Raster resampling is expected and is a separate concern. |
| I07 | Raw RGB marker overflow and the existing perceptual authored-marker policy remain intact. A camera must not pin an offscreen marker to its edge.                                                            |
| I08 | Cropping is not `Outside`, `Unavailable`, `Paused`, an empty slice or a different editor domain. Those semantic facts retain their current meanings.                                                        |
| I09 | Editing and panning never own the same pointer sequence. Existing pointerup publication, exact-origin rollback, controlled rejection and callback-silent disposal remain correct.                           |
| I10 | Ordinary wheel and Ctrl/Cmd-wheel are not intercepted by the camera. Alt plus Ctrl/Meta also belongs outside this feature.                                                                                  |
| I11 | Importing packages has no DOM effects. React native authority comes only from committed work; replay, abandoned render and disposal cannot leak resources or callbacks.                                     |
| I12 | The fitted field retains the current colors, orientation, marker policy and domain presentation. New controls may change layout height; this is not permission to alter existing color/render behavior.     |
| I13 | Vue and React share camera mathematics and gesture policy. Neither RGB nor perceptual editors get separate zoom implementations.                                                                            |
| I14 | Work and retained memory do not grow with the area of a hypothetical zoom-expanded full-domain canvas. No unbounded camera-frame cache is introduced.                                                       |

Exactness must be stated correctly. Camera actions preserve the exact authored source, including signed zero and missing components. A screen-to-field floating-point round trip is tested within a declared tolerance, not promised to preserve every bit. Passing the same explicit field point to the same editor operation must still give the same operation result.

## 3. Ownership and dependency design

The current dependency direction matters: render depends on core, while UI owns native interaction and product policy without importing runtime render or color-science implementations.

| Owner            | Phase 2O responsibility                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core             | Existing geometry and edit contracts. A comment clarification for `PlanePoint` is appropriate; camera state does not enter color definitions or geometry identities.         |
| Render           | Pure normalized-camera projection helpers, camera-derived visual geometry, visible-region raster sampling and the viewport-aware field cache key.                            |
| UI               | Input intent and arbitration, modifier/wheel normalization, pan gesture lifecycle, keyboard/controls policy, labels, anatomy and shared CSS. No Canvas creation or sampling. |
| Vue/React        | Per-instance camera ownership, committed lifecycle, measurement, applying a coherent visual frame, native markup and framework callback bridges.                             |
| Web/packed hosts | Product, native-browser, packaging, hydration and performance evidence.                                                                                                      |

**Proposed implementation seam:** add a small DOM-free render-owned viewport module, exposed through a deliberately internal sibling-package subpath, for example `@gamut-plane/render/internal/viewport`. Adapters already depend on both render and UI. The UI controller receives typed callback ports such as snapshot, zoom, pan, restore and present; it must not import render to implement camera mathematics. Passing the derived sample window into `FieldRenderer` is preferable to giving the renderer product state.

Exact filenames and port signatures are implementation choices. Do not add a public consumer camera API merely to connect sibling packages. A structural snapshot type in a generic UI controller is acceptable; a second independently maintained transform implementation is not. Avoid growing `planeGesture.ts` into a universal interaction framework.

The existing core `PlanePoint` comment calls its coordinates a normalized viewport position. With a movable camera, clarify that these are normalized **field/editor coordinates**, not the new visible viewport coordinates. Keep the existing type and runtime contract unless a genuine incompatibility is demonstrated.

## 4. Coordinate model and pure operations

### 4.1 Coordinate spaces

Use four explicit concepts: native event client coordinates, normalized visible-viewport coordinates, normalized field coordinates, and editor/color coordinates. DPR affects the backing raster, not the meaning of a field point.

The current adapters already measure a border-adjusted content box and account for axis-aligned CSS scale. Preserve that route. Convert client coordinates to normalized viewport coordinates using the measured displayed content box, then invert the camera. Only then call `field.geometry.constrain(...)` and the existing `authorEditorPoint(...)` route.

Do not call `constrain` before inversion. For example, a captured drag beyond the visible viewport can still correspond to a valid field point elsewhere in the larger editor domain. Do not add a separate clamp to the visible window. Rotation/skew support is not claimed by the existing measurement route and is not a 2O expansion.

### 4.2 Proposed state

```ts
// Internal conceptual contract. Naming may follow repository conventions.
type FieldViewport = Readonly<{
  zoom: number;
  center: Readonly<{ x: number; y: number }>;
}>;

// Derived, not a second independently mutable camera.
type FieldSampleWindow = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;
```

The canonical fitted state is `zoom = 1`, `center = { x: 0.5, y: 0.5 }`. All eight current fields use a square normalized enclosing frame. A zoom of 2 shows half the normalized range on each axis. It is not a claim about physical monitor pixels or color accuracy.

For field point `p`, normalized viewport point `q`, center `c` and zoom `z`:

```text
q.x = 0.5 + z * (p.x - c.x)
q.y = 0.5 + z * (p.y - c.y)

p.x = c.x + (q.x - 0.5) / z
p.y = c.y + (q.y - 0.5) / z

left   = c.x - 0.5 / z
top    = c.y - 0.5 / z
width  = 1 / z
height = 1 / z
```

Local CSS-pixel position is `(q.x * localWidth, q.y * localHeight)`. Client-space input normalization instead uses the displayed content-box dimensions, including any supported outer CSS scaling.

### 4.3 Anchored zoom and bounds

For normalized viewport anchor `a`, first obtain `p = viewportToField(old, a)`. Clamp the requested zoom to the supported interval, obtaining the **effective** new zoom `zNew`. Compute:

```text
cNew.x = p.x - (a.x - 0.5) / zNew
cNew.y = p.y - (a.y - 0.5) / zNew
```

Then apply camera bounds. The anchor is preserved before bounds are applied. At an edge, especially on zoom-out, bounds can prevent exact anchoring. That exception is deliberate and must appear in both the tests and documentation. Do not write an unconditional anchored-zoom assertion that contradicts bounded panning.

**Proposed defaults:** minimum 1x, maximum 8x. At zoom `z`, each center component is constrained to `[0.5/z, 1 - 0.5/z]`. At 1x return the exact canonical fitted state. Camera bounds refer to the enclosing normalized field square, not a gamut and not the OKLab disc. They prevent arbitrary empty canvas beyond the field, without changing editor constraints.

A capped zoom request whose effective zoom equals the current zoom is a true no-op: it must not recenter. Canonical Fit clears pending camera requests so a delayed wheel frame cannot undo it.

### 4.4 Pan

For a local CSS-pixel drag displacement `(dx, dy)` from an established gesture origin:

```text
cNew.x = cOrigin.x - dx / (localWidth  * zOrigin)
cNew.y = cOrigin.y - dy / (localHeight * zOrigin)
```

Alternatively, convert displayed client displacement to normalized viewport displacement first. Do not mix client displacement with unscaled local dimensions. Content follows the pointer. Compute movement from a stable/rebased origin, not rounded previous-frame CSS values. Apply the same camera bounds.

At 1x, pan intent is recognized as pan and becomes a no-op. It must not fall through into a color edit or middle-button autoscroll.

### 4.5 Operation contract

Provide pure equivalents of fit, constrain viewport, field-to-viewport, viewport-to-field, zoom at anchor, pan by displacement, sample-window derivation and viewport containment. Return read-only values; reuse the previous value for true no-ops where practical. Reject invalid/nonfinite state and invalid sizes at the boundary. Native handlers must fail safely rather than introducing NaN transforms or uncaught exceptions.

No rounding is applied to camera state for display. Percentage and axis formatting never feed back into the mathematics.

Independent examples: at centered 2x, field `(0.25, 0.75)` maps to visible `(0, 1)`; zooming canonical Fit to 2x around `(0.2, 0.8)` produces center `(0.35, 0.65)`; at 8x the extreme valid center components are `0.0625` and `0.9375`.

## 5. Fit, lifetime and camera reconciliation

Fit means **fit the complete editor field's normalized enclosing frame**. For OKLab this includes the full existing disc inside its square frame. It does not fit a Reference, contour, selected marker or changing gamut availability.

Use one Fit action. In this first version, Reset 100% and Fit have identical semantics, so do not add two duplicate controls. The fitted state is the default on initial render and SSR.

| Transition                                                 | Proposed camera policy                                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Authored color changes, same accepted editor/geometry      | Preserve camera. Existing edit arbitration still handles externally replaced colors.                                  |
| A fixed coordinate changes, including extended RGB values  | Preserve camera; repaint the new slice through the same window.                                                       |
| Reference, Status or Boundary changes                      | Preserve camera; use newly accepted facts without hidden camera-driven requests.                                      |
| A controlled editor/state request is rejected              | Preserve the current camera and gesture context.                                                                      |
| A different editor/geometry is actually accepted           | End camera interaction and reset to Fit before presenting the new geometry. Never project old queued work through it. |
| Enter Inspect or the editable field is genuinely unmounted | Dispose camera resources; a subsequently mounted field begins at Fit. No per-editor history in 2O.                    |
| Resize or DPR change while idle                            | Preserve normalized center and zoom; remeasure and repaint.                                                           |
| Transient zero-size/hidden surface, still mounted          | Retain the last valid pose; do not accept spatial input or divide by zero. Repaint when measurable.                   |
| Unmount/remount                                            | Dispose silently; remount at Fit.                                                                                     |
| Explicit Fit                                               | Discard pending camera work and present canonical Fit atomically.                                                     |

A same-geometry source replacement need not cancel a pan: the camera is independent of authored color. A geometry replacement must. A measurement change during pan must not cause a jump; the simple safe policy is to end pan at the last presented pose and make the old pointer tail inert. A tested rebase is acceptable instead. This is not permission to change the existing color-drag resize policy.

Use stable accepted geometry/editor identity for camera reconciliation, not object allocation, viewport size, `fixed`, a selected gamut or every accepted presentation revision. Establish the actual lifetime at the current adapter call sites during preflight.

## 6. Rendering and presentation

### 6.1 Visible-region raster sampling

Do not implement settled zoom by enlarging the existing raster. `fieldRenderer.ts` currently samples the whole normalized square and sizes the visible canvas from its bounds; a scaled ancestor can also accidentally enlarge the backing allocation.

Keep the visible canvas attached to the stable viewport box. Extend `FieldRenderInput` with a derived sample window or equivalent internal render input; identity/default behavior must remain compatible with existing call sites. For every sample position `q` produced by the existing column-gradient or disc-gradient algorithm, sample the field at `p = viewportToField(camera, q)`. Use the existing sampler, fixed coordinate, granted Canvas color space and serialization route.

Keep the 1x path visually compatible. Preserve current preview/full-quality meaning and fixed/varying invalidation rules. Camera motion does not automatically become a hue-range preview or a color-edit gesture. Start with RAF-coalesced viewport resampling; do not add tiled rendering, workers, speculative full-domain buffers or new quality states without evidence.

The field cache key must include all current inputs plus the sample window/camera identity. A change in pan invalidates the raster even at unchanged zoom. A pure varying-coordinate edit or Reference/Status/Boundary change must still reuse an unchanged camera-and-slice raster. Retain bounded cache ownership, not one entry per wheel event.

Use source-coordinate assertions to verify sample orientation and fixed-channel preservation. Pixel colors alone are not a color-science oracle. The renderer's current fixed-grid disc sampling is important: sampling that grid over the smaller window increases coordinate resolution without allocating a full 8x canvas.

### 6.2 Spatial layers

| Layer                                              | Camera treatment                                                                                            | Screen-size behavior                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Canvas                                             | Sample the visible field window.                                                                            | Backing size follows visible dimensions and DPR, not zoom-expanded domain area.   |
| Gamut paths and hit paths                          | Derive SVG viewBox or equivalent path transform from the same window. Keep original path data and topology. | Preserve non-scaling visual strokes and useful hit widths.                        |
| OKLab domain outline and its hit geometry          | Project the existing domain outline through the camera.                                                     | Keep border/stroke weight stable. It is an editor-domain indicator, not a gamut.  |
| Authored and Reference markers                     | Apply camera projection to their existing world/field point.                                                | Preserve marker size, border and shadows in CSS pixels.                           |
| Reference connector                                | Transform the original endpoints and let the surface clip the segment.                                      | Preserve stroke width. Do not invent endpoints at viewport edges.                 |
| Warning glyph                                      | Place relative to the camera-projected marker using measured viewport-local dimensions.                     | Preserve glyph size/gap. Do not pull a hidden marker into view to show a warning. |
| Axis names, end labels, controls and render status | Keep outside the camera transform.                                                                          | Preserve ordinary UI typography and target sizes.                                 |

The inspected OKLab presentation has a square clipped surface with a separate disc outline. It does **not** apply a circular surface mask. Do not introduce one as a supposed prerequisite for zoom. Likewise, do not leave the disc outline fixed at the screen edges when the field moves.

A genuine point/line RGB contour stays a point/line. Successful empty contours remain successful empty. Cropping must not close a path, join disconnected visible fragments or fabricate a square edge as a gamut boundary.

### 6.3 Reference and offscreen semantics

The current RGB Reference is chosen from the genuine contour restricted to the nominal editor square. In that existing policy, “visible” means the nominal editor domain, not this new camera crop. Do not rerun nearest-point selection against a moving viewport. Keep `referenceDisplay(...)` independent of the camera.

A Reference point can remain spatially available but become offscreen. That does not suppress its exact warning, remove a requested guide or mark the Boundary Paused. Clip its spatial annotation normally. A connector may cross the visible region while one or both markers are outside it; preserve the genuine segment.

Distinguish an in-domain selected point hidden by the camera from raw RGB coordinates outside the editor domain. Fit can reveal the former; it cannot recover the latter. Preserve the existing numeric-overflow recovery copy. Add a restrained accessible explanation for camera-hidden selection, without pretending that camera position changes domain membership. Do not mutate `data-outside-instrument` for viewport cropping. If new `data-*` diagnostics are needed, use separate concepts and do not make internal debug state a public API.

### 6.4 Axis readouts

`planeAxisEnds.ts` currently displays fixed nominal min/max values. At nonidentity camera states, edge labels must describe the visible coordinate ranges. Use declared axis bindings/directions or geometry-derived numeric range facts, then let UI format them. Do not put core runtime color math into UI.

For the shipped orientations, X increases to the right and Y decreases down the screen. Examples at centered 2x: OKLCH C spans 0.1 to 0.3 and L spans 0.25 at the bottom to 0.75 at the top; OKLab a/b span -0.2 to 0.2; RGB varying channels span 0.25 to 0.75. Verify all six RGB bindings, not just R/G.

Do not derive disc axis labels by constraining a corner to the disc: that changes the coordinate being labeled. Keep unrounded numeric extents separate from display text. Preserve current endpoint strings at Fit, suppress display-only negative zero and avoid overlapping gutter text at 320px/enlarged text. An axis range does not imply every point in that Cartesian rectangle is editable in the disc.

## 7. One coherent presented camera

This is a required architecture acceptance, not an optional polish task.

Current code mixes declarative SVG/marker markup with imperative marker previews and RAF Canvas drawing. Adding a reactive zoom value independently to those routes can produce an updated marker over an old raster, or hit-testing against a camera not yet visible.

Maintain an explicit distinction between requested camera work and the last **presented** camera snapshot. Here, presented means coherently applied to the raster and all spatial DOM/readouts for the browser's next paint, not proof of physical display scanout. There is one logical camera model; a pending command and an applied snapshot are scheduling state, not competing color models. On a camera frame, draw the raster and update spatial overlays/readouts from the same next snapshot before it is exposed as presented. Coalesce continuous camera input into at most one scheduled presentation frame. Events with different anchors must be composed in event order; do not collapse them into one last-anchor delta incorrectly.

For a new pointer gesture, interpret its initiating event against the last coherently presented camera, not an unpresented wheel request. The proposed policy is to discard any pending, unpresented wheel zoom before establishing the edit/pan origin. Do not first flush a different camera and then reinterpret the same click as though the user had aimed at that new image. During a color pointer gesture, freeze camera changes; pointerup uses that same camera and existing final-coordinate priority. A keyboard color edit also discards pending camera-only work before following the existing authoring route. Fit replaces pending work with canonical Fit rather than replaying it. Pan completion may present its final camera displacement because that operation authors no color. Do not reinterpret an already queued field point through a later camera.

If a host color/guide update occurs before the camera frame, consume the latest **committed** semantic facts together with the chosen camera snapshot. Never expose speculative React props to native listeners. Stale frames from an old geometry, unmounted component or cancelled gesture must be inert.

Claude must choose and document the narrowest implementation of this barrier in Vue and React. Avoid gratuitous `flushSync` calls on every wheel event. If camera-specific DOM presentation is imperative, declarative rerenders, rollback, controlled rejection and Strict Mode replay must not overwrite it with an old transform. If it is declarative, prove the Canvas and input synchronization explicitly.

## 8. Native input, focus and arbitration

### 8.1 Ownership

The existing `mountPlaneGesture` does not check `event.defaultPrevented` before starting, and the existing pointer registry is a boolean WeakSet per element. Adding another listener that calls `preventDefault()` is therefore not a complete arbitration design.

Use a single explicit per-surface owner/intent decision, or a narrow start-veto/claim seam shared by the edit and pan routes. Resolve intent before point conversion, focus, capture or any edit preview. Existing default edit behavior must remain unchanged for non-pan input. Ownership may not depend on listener-registration order or `stopImmediatePropagation` as an accidental lock.

`hasInstrumentPointer(...)` must regard active pan as pointer ownership so Coordinates, Area, Gamuts and context-menu surfaces cannot steal the interaction. An idle edit controller must not clear the active pan owner's registry entry during reconcile/disposal. Investigate this precise case before accepting a second controller. Do not let one controller release another controller's capture.

| Input                                                  | Behavior                                                                                |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Primary pointer, no pan intent                         | Existing color edit, using inverse camera then geometry constraint.                     |
| Space + primary mouse drag                             | Pan; no edit preview, color change, color commit or color cancel.                       |
| Middle-button drag                                     | Pan; suppress the owned surface's middle-button default behavior.                       |
| Alt/Option + wheel, no Ctrl/Meta                       | Pointer-anchored camera zoom when the field can own it.                                 |
| Ordinary wheel, Ctrl/Meta-wheel or Alt+Ctrl/Meta-wheel | Camera leaves it untouched.                                                             |
| Secondary button / ContextMenu / Shift+F10             | Existing gamut context-menu route; not a pan or zoom command.                           |
| Existing touch/pen primary input                       | Retain editing behavior with correct inverse coordinates. No new pinch/pan recognition. |

A gesture retains its mode for its pointer sequence. Pressing Space halfway through a color drag does not switch it to pan. Releasing Space during a Space-pan ends pan at its latest position; subsequent movement/up from that same physical sequence must not turn into color editing. Middle-pan persists until its initiating button is released.

During an active pointer-pan, reject wheel/button/keyboard zoom and Fit until it ends; do not change its scale mid-gesture. Ignore color-authoring keys while pan owns the pointer. Space-arrow keyboard panning is an idle-pointer route, not a second owner during mouse pan. Home/End do not author while Space is armed.

A camera request while a plane or range color gesture is active must not change the camera. An otherwise camera-owned Alt-wheel can be consumed as a no-op during that gesture; browser Ctrl/Meta zoom remains untouched. Do not queue a surprise zoom to run after the color commit.

### 8.2 Pan completion and cancellation

Pan has its own viewport-origin snapshot. On pointerup, apply the latest valid displacement before ending ownership. Explicit Escape, pointercancel and unexpected capture loss restore the viewport origin only. They never invoke the color gesture's rollback or emit color cancellation. Geometry replacement and unmount discard old work without restoring an old viewport into a new field.

On window blur, document hiding or loss of the relevant focus context, clear Space state and end pan safely at its last presented pose; do not leave a stuck hand cursor. Capture acquisition failure must unwind pan ownership without editing. Only release capture that this binding owns.

Handle chorded mouse buttons using `buttons` and the initiating button's release, including release reported as pointermove. Preserve the existing primary-release behavior and delayed context-menu suppression. Test right/middle chords in a real browser rather than assuming a pointerup occurs for every button release.

### 8.3 Wheel details

Attach the wheel listener to the surface, not the page, with explicit non-passive behavior. Check current ownership, modifiers, `defaultPrevented`, cancelability and valid measurement before adopting the event. A noncancelable event is not accepted as camera zoom. At zoom limits, a valid claimed Alt-wheel remains consumed without camera movement; normal wheel continues to scroll.

Normalize `deltaMode` explicitly. A starting tuning proposal is pixels as provided, line units multiplied by a named 16px policy and page units by the measured viewport height, with finite bounded per-event deltas. A continuous exponential scale such as `2 ** (-deltaPixels / 480)` is a starting sensitivity, not a hardware fact. Tune the named constants only with recorded wheel/trackpad evidence. Keep event-order semantics when coalescing. Ignore zero vertical deltas rather than inventing horizontal-wheel zoom.

Do not steal focus merely to wheel-zoom a hovered plane. In particular, no unrelated numeric draft should commit because a wheel handler focused the field. Events in an open owned popup must not leak into field zoom.

### 8.4 Keyboard and accessible controls

Provide a compact group of ordinary native buttons and a readout: `minus`, percentage, `plus`, `Fit`. A proposed discrete factor is 1.25; central zoom buttons use the viewport center, not a stale mouse location. There is no editable zoom number in 2O. Fit's accessible name explains that it fits the editor domain.

Plane-focused `+`/`=` and `-` zoom around the center; `0` invokes Fit. Support the equivalent numpad key values. Ignore Ctrl/Meta/Alt variants and composition. Existing Arrow/Home/End editing and Shift-coarse editing remain unchanged when Space is not armed.

**Proposed accessibility addition:** while Space is armed on the focused plane, arrows pan the viewed region by 10% of the viewport span; Shift increases that to 25%. Define direction as moving the camera toward the pressed arrow, which moves field content oppositely. This provides a keyboard pan route without taking existing ordinary color-edit keys. Do not reinterpret these keys in inputs, menus, sliders or buttons.

Space arming is scoped to the field interaction context, not a page-wide mode. Plane focus is the minimum supported route. Hover-based arming may also be implemented only when focus is neutral and no native control/draft/popup owns the key; prove that it cannot hijack another control's Space activation or the host page. Space keyup cleanup may use temporary document listeners after arming. Document any platform limitation instead of globally swallowing Space.

Escape first belongs to an open instrument popup, then to an active gesture. With no popup or active gesture it propagates to the host even if zoomed. Do not add an implicit “first Escape resets zoom” rule. Existing host dialogs/popovers must retain their close behavior.

Keep focus stable during control updates. Clicking a native viewport button may legitimately blur an already active numeric draft and complete that draft under the existing input contract. That separately attributable numeric transaction is not camera authorship: do not suppress its normal blur behavior or attribute its color callback to zoom. Camera handlers themselves must never author; test camera-only callback silence with no pending numeric draft and separately test the draft-to-button transition. Controls remain usable by touch; ordinary one-finger color editing after a button zoom still works. The existing `touch-action: none` is not redesigned here, so do not claim native pinch behavior that the current surface does not provide.

Provide concise discoverable instructions and accessible descriptions; never make the only instructions a mouse-only title tooltip. Expose current zoom and useful visible ranges without a live-region announcement on every pan/wheel event. Announce discrete actions or a settled change at most, not the entire color label repeatedly. Test enlarged text and forced colors. New viewport controls must not inherit semantic read-only `GamutPlaneState` restrictions that do not apply to this local camera.

## 9. Implementation phases

### 2O.0: Reconcile and record decisions

Inspect the actual current `dev` and all applicable repository instructions. Run the applicable baseline checks, recording limitations honestly. Confirm the source map, dependency seam, field lifetime, arbitration and presented-frame design. Record accepted deviations/defaults in this spec and a small ADR or design note using the next available number. Do not add unrelated abstractions.

Exit: a specific source-backed plan, a bounded question register and no unresolved ownership contradiction.

### 2O.1: Pure viewport contract

Implement pure camera math and its internal exports, finite/size validation, bounds, sample-window derivation and known-value tests. Add inverse/anchor/no-op/resize-representation tests. Clarify coordinate terminology without moving camera state into core product facts.

Exit: independently checked mathematical contracts; no production-visible partial zoom.

### 2O.2: Coherent rendering composition

Extend visible-region raster sampling/cache identity. Integrate SVG, domain outline, HTML markers, warnings and dynamic axis facts with one presented snapshot in both adapters. Exercise zoomed poses through a test-only fixture or internal harness, not a public debug API. Cover OKLCH, OKLab and all RGB bindings with the same route.

Exit: no stale raster/overlay frame and no enlarged full-domain backing store; identity field behavior preserved.

### 2O.3: Editing and pan arbitration

Apply inverse mapping before core constraints. Implement the narrow edit/pan ownership seam and pan lifecycle. Verify pending-frame boundaries, exact-origin edit rollback, rejected controlled updates, pointerup coordinates, Space release and chorded buttons.

Exit: pan and editing cannot both act on one pointer sequence; camera-only callback counts are zero.

### 2O.4: User-facing controls and keyboard/wheel

Wire visible controls, Alt/Option-wheel, Fit, scoped keyboard zoom/pan, focus/copy and overflow explanations. Keep menus and browser shortcuts independent. Review small-host and enlarged-text layout without a general toolbar redesign.

Exit: usable desktop feature, touch-accessible controls and preserved existing single-pointer editing.

### 2O.5: Lifecycle, resource and quality certification

Finish React committed/abandoned-render and Strict Mode coverage, Vue synchronous reconciliation, two-instance isolation, SSR/hydration, resize/DPR and hidden-surface cases. Record bounded raster allocation and representative draw measurements at 1x/4x/8x. Review perceptual and RGB guide/raster quality at the selected ceiling.

Exit: all automated evidence attached; unavailable physical-device or assistive-tech checks explicitly listed, never replaced by claims.

### 2O.6: Closeout

Run the final relevant gates sequentially, inspect affected visuals, update architecture/testing/readme help and add a 2O acceptance report. Separate intentional viewport/control changes from existing failures. Leave the implementation reviewable on `dev` under the user's actual commit/push authorization. Do not merge `main`, tag, release or deploy as part of this handoff.

## 10. Source change map

Existing paths below were inspected except where the audit explicitly identifies a required follow-up read. New filenames are proposals, not claims that those modules already exist.

| Area               | Existing paths / proposed addition                                                                                                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Camera math        | Proposed `packages/render/src/viewport/` and `./internal/viewport` export; inspect export tests/packed validators before adding the entry.                                                                            |
| Raster             | `packages/render/src/fieldRenderer.ts`; camera-window and cache tests in render's existing test owner.                                                                                                                |
| Spatial geometry   | `packages/render/src/geometry.ts`, `current/referenceAnnotations.ts`, related current presentation helpers; follow-up reads required for their exact implementation details.                                          |
| UI interactions    | `packages/ui/src/interaction/planeGesture.ts`, `pointerOwnership.ts`; proposed narrow viewport interaction/arbitration module. Inspect the existing menu/selector/range controllers before changing ownership wiring. |
| Labels and styling | `packages/ui/src/planeAxisEnds.ts`, `parts.ts`, `style.css`; proposed viewport control/copy facts and narrowly added anatomy.                                                                                         |
| Vue                | `packages/vue/src/components/ColorPlane.vue` and actual parent field call sites/lifetime.                                                                                                                             |
| React              | `packages/react/src/components/ColorPlane.tsx`, `interaction/planeInteraction.ts`, `interaction/planeResources.ts`; preserve `hooks/useCommitted.ts` semantics and inspect that helper during preflight.              |
| Tests/docs         | Existing owner suites, web e2e and packed Vite/Nuxt/Next fixtures; `docs/architecture.md`, `docs/testing.md` and a new 2O acceptance report.                                                                          |

Do not modify guide science, RGB coincidence/approximation constants, gamut tables, mapping or authored operations just to make zoom tests pass. Root public component props/events and state serialization remain unchanged.

## 11. Test and evidence matrix

Use the repository's existing evidence ownership. Exhaustive pure/native-controller policy belongs at its owner; do not duplicate the entire matrix in both framework suites, packed consumers and screenshots.

| ID  | Evidence owner       | Acceptance                                                                                                                                                                                                                                   |
| --- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V01 | Pure viewport tests  | Independent numeric examples plus inverse round trips for field points inside and outside [0,1]; finite-input rejection; no implicit field clamp.                                                                                            |
| V02 | Pure viewport tests  | Unclamped anchor preservation; documented anchor drift when bounded; effective zoom at min/max is a no-op; Fit is canonical.                                                                                                                 |
| V03 | Pure viewport tests  | Correct pan sign, scale dependence, center bounds and normalized pose preservation through resize.                                                                                                                                           |
| V04 | Render tests         | All eight samplers receive inverse-camera coordinates with the correct orientation/fixed value; identity behavior remains valid.                                                                                                             |
| V05 | Render tests         | Camera pan/zoom invalidates raster cache; unchanged camera/slice reuses it; fixed changes repaint; varying/color comparison changes do not spuriously repaint.                                                                               |
| V06 | Render tests         | Point/line/empty contours retain topology; genuine offscreen geometry is clipped, not closed/replaced. RGB Reference endpoint remains independent of camera.                                                                                 |
| V07 | Shared UI tests      | Explicit edit/pan intent; no registration-order dependency; idle disposal cannot clear another owner's registry entry.                                                                                                                       |
| V08 | Shared UI tests      | Wheel modes/modifiers/cancelability; bounded no-op consumption; browser combos untouched; inputs/popups excluded.                                                                                                                            |
| V09 | Shared UI tests      | Pan up/rollback/capture failure/Space release/chorded buttons; color callbacks remain zero for every camera action and cancellation.                                                                                                         |
| V10 | Adapter tests        | Inverse editing and existing constrained behavior in all geometry families; raw RGB overflow and existing OKLab edge policy remain unchanged.                                                                                                |
| V11 | Adapter tests        | Pointerdown before a pending camera frame uses the presented pose and discards unpresented zoom; up uses the frozen pose; accepted color replacement before frame; rollback/rejection with no host rerender; no stale transform restoration. |
| V12 | Adapter tests        | Same-geometry color/fixed/Reference changes preserve camera; accepted Area changes reset; rejected requests do not; two instances are independent.                                                                                           |
| V13 | React/Vue lifecycle  | React abandoned work cannot control native camera; Strict Mode/unmount cancels listeners/frames/capture; Vue synchronous context reconciliation remains correct.                                                                             |
| V14 | Real browser         | Off-center Alt-wheel anchor, ordinary page scroll, unchanged Ctrl/Meta handling, middle/Space pan, edit after pan, true capture and primary-button chord release.                                                                            |
| V15 | Real browser         | Border-adjusted input under supported outer CSS scale, scroll, resize and DPR changes; zero-sized/hidden recovery without NaN or stale input.                                                                                                |
| V16 | Real browser         | Canvas/guide/marker/reference/domain-outline alignment at zoom; constant marker and stroke size; correct visible axis ranges.                                                                                                                |
| V17 | Accessibility/layout | Keyboard-only zoom/pan/Fit, existing color keys, Escape nesting, stable focus, 320/390/440/480px hosts, enlarged text and forced colors.                                                                                                     |
| V18 | Packed/SSR           | Installed exports and stylesheet; one representative Vue/React camera interaction; Nuxt/Next canonical SSR/hydration and independent instances.                                                                                              |
| V19 | Resource/performance | No zoom-squared backing growth, unbounded history/cache or redundant exact/guide work; bounded scheduling; representative measurements and quality review.                                                                                   |

For transform tests, use explicit known answers rather than testing only two potentially incorrect inverse functions against each other. A suggested pure normalized-coordinate absolute tolerance is `1e-12` over the bounded test range; justify any adjustment. Use scale-aware pixel tolerances for browser geometry and do not confuse SVG serialization precision with mathematical inverse precision. Bit-exact authored-state preservation is asserted independently.

For pointer editing, assert unchanged alpha and untouched coordinates as well as varying-coordinate accuracy. At a zoomed captured drag beyond the surface, retain core editor-domain constraints rather than clamping to the visible window. At nonidentity camera states, cancellation/rejection must restore the camera-projected accepted marker, not its old 1x position.

Use semantic readiness and observable geometry, not sleeps or incidental DOM shape. Screen assertions should read the displayed result rather than an earlier RAF recorder sample. Keep sparse visual sentinels: a representative rectangle, disc and native RGB excursion/cropping case are useful; multiplying every interaction into snapshots is not.

## 12. Validation commands and reporting

At the inspected commit, the repository uses Node >=24 and `pnpm@11.9.0`. Use the frozen lockfile and pinned Playwright/browser setup from `docs/testing.md`; confirm these against actual `dev`.

```sh
pnpm install --frozen-lockfile
pnpm verify:prepush
pnpm test:e2e
pnpm test:production
pnpm test:package:built
pnpm test:react-vite:built
pnpm test:nuxt:built
pnpm test:next:built
```

`verify:prepush` builds packages/web and runs format, lint, type, unit/component and artifact checks. It does not replace the browser, packed or SSR gates. There is no root `pnpm verify` script in the inspected manifest. Build affected packages and use focused owner tests during implementation; run the full applicable sequence after convergence. Packed/browser suites share local ports and must run sequentially. A failed build invalidates the assumption that later `:built` commands are testing the final source.

Run generated-table protection through its existing owner and verify no generated science data changed. Check private sibling exports in packed consumers rather than relying on workspace resolution. If a new export affects hardcoded package inventories, update those only for the intentional addition.

Do not relax screenshot thresholds or refresh references to hide a failed interaction. Review Windows and Linux visual changes using the repository's pinned environment; the docs call out the Noble image plus `fonts-dejavu-core` for Linux font parity. Changes to controls/axis text can legitimately alter screenshots, but a whole-baseline refresh is not automatically justified. Release/social assets remain separate.

Report start/final SHA or uncommitted working-tree state, changed files, decisions/deviations, each gate's exact outcome, affected visuals, performance observations and remaining manual checks. A focused retry is not an aggregate pass. Do not claim exact-SHA CI success without inspecting a run for that exact committed SHA. Do not call this feature released merely because local implementation passes.

## 13. Numerical quality and performance limits

Existing RGB curves carry a `1e-5` encoded-coordinate interpolation bound, with SVG serialization adding at most `5e-6` per normalized coordinate. Preserve those contracts and the depth/point budgets. For illustration, at 480 CSS pixels and 8x, the sum of those coordinate bounds scales to at most `480 * 8 * 1.5e-5 = 0.0576` CSS pixels per axis. This derived estimate concerns contour geometry only, not raster interpolation, anti-aliasing, color accuracy or perceptual-table fidelity.

Magnification cannot create more scientific certainty than the underlying sampled guides. Independently inspect perceptual curves/rastering and native RGB at the proposed ceiling. If existing perceptual sampling makes 8x misleading, report the evidence and propose a bounded quality change or a lower ceiling; do not silently change core science or claim exact visual truth.

Target raster work and allocation proportional to the visible viewport, DPR and existing quality policy, not to `(zoom * width) * (zoom * height)`. Record representative draw timings and retained-resource behavior using the repository's performance methodology after reading `docs/performance.md`. No blanket 60fps promise is made by this design. Start with one coalesced presentation pass, then optimize a measured bottleneck rather than building speculative infrastructure.

## 14. Bounded engineering question register

| ID  | Question and proposed answer                                                                                                            | Required evidence / gate                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Q01 | Pure math belongs in render; UI drives it through typed ports. Confirm the narrow internal export and controller shape.                 | Package dependency/type/packed checks before 2O.1 closes. No render-to-UI or UI-to-render cycle.                                            |
| Q02 | How should edit/pan claim ownership without the current boolean registry being cleared by an idle binding?                              | Inspect all ownership users; demonstrate start-order independence and disposal/capture safety before enabling pan.                          |
| Q03 | How are Canvas, SVG, marker, labels and inverse input committed as one presented camera in both frameworks?                             | Pointer-before-RAF, concurrent parent update, rejection and Strict Mode tests before public controls.                                       |
| Q04 | Does 8x give honest, useful detail for both raster algorithms and all existing guide families?                                          | 1x/4x/8x quality review, bounded allocation and measurements before accepting the ceiling.                                                  |
| Q05 | Where exactly is camera state retained or discarded by current ColorPlane parent lifetimes?                                             | Read actual parent call sites; test accepted/rejected selection, inspection, same-field source replacement and temporary zero size.         |
| Q06 | Can existing border/CSS-scale/zero-layout measurement differences be preserved safely, or is a small shared measurement seam necessary? | Paired real-browser evidence. Do not silently unify unrelated fallback policies.                                                            |
| Q07 | What compact placement and endpoint formatting fit current gutters at 320px/enlarged text?                                              | Visual and semantic layout review; no general toolbar redesign.                                                                             |
| Q08 | Is hover-Space arming safe in nested hosts, and how does Option-wheel behave on available physical hardware?                            | Focus/native-control tests; physical Mac/trackpad checks where available. Report unavailable hardware checks explicitly.                    |
| Q09 | Some general architecture prose still describes older RGB Reference compatibility, while current code uses nearest slice.               | Treat executable source and `native-rgb-guides.md` as the baseline; make a narrow documentation correction, not a reference-policy rewrite. |

Claude may settle an implementation seam with evidence and record the rationale. A required change to authored semantics, public API, science constants, major UX scope or dependency architecture requires an explicit proposal rather than a silent deviation. Unavailable manual hardware checks should not stop independent automated work, but remain limitations in acceptance.

## 15. Completion definition

Phase 2O is ready for review when zoom/pan/Fit work through the same field capability in Vue and React; all eight editors use the same camera contract; color/state/Reference truth is preserved; marker and input correctness survive cancellation, rejection and lifecycle replay; rendering remains coherent and bounded; required automated gates pass or have precisely documented external blockers; and the final evidence is attached to the actual implementation state.

It does not complete the rest of vNext. Field Views, classic wide-gamut authoring, additional models/geometries, richer Reference selection, mapping, Fit Reference/visible boundaries and the public headless layer remain separate future work.

## 16. Review blocker A: guide fidelity under magnification

Added after independent review. The review found that the sampled perceptual guides (OKLCH L/C and OKLab a/b, 120 hue by 65 lightness table, bilinear) are visibly wrong under zoom. Near the yellow/white cusp they were about 5.6 px off at 1x and 45 px at 8x, from lightness sampling. Around hue 264.75 they were about 30 px off at 1x and 241 px at 8x, from hue interpolation. Implementation investigation found a third, structural defect: a single maximum chroma per ray cannot represent the gamut. Near the sRGB blue vertex (a/b slices around L 0.40-0.46, hues near 264) and near black at those hues (L/C slices), a chroma ray leaves the gamut, re-enters and leaves again. The true slice has a notch. The table, the previous contours and `findMaximumChroma` each keep one arbitrary crossing, so the old guide cuts straight across the notch. Finer tables cannot fix this, because a table stores one chroma per (L, h).

### 16.1 Contract

**Explicit product approval, 8 October 2026:** the user accepted Outcome B and replaced the original continuous symmetric Hausdorff bound and exhaustive component-discovery requirement with rigorous, reproducible empirical visual acceptance. The [certification investigation](phase-2o-certification-investigation.md) explains the failed proof obligations and partial certificates; this decision does not change those historical conclusions.

Scope: built-in sRGB and Display P3, OKLCH L/C and OKLab a/b, supported nominal editing domains, displayed fields up to 480 CSS px, zoom 1x through 8x. It does not extend automatically to third-party geometries, future spaces or larger fields.

A successful guide is a deterministic numerical visual approximation that completes discovered-branch traversal within the existing work limits. Every fixed acceptance fixture must measure **at most 1 CSS px at 480 CSS px / 8x in both sampled directions**, using normalized Euclidean field distance multiplied by 3840. Both actual Float32 geometry and parsed production SVG serialization are measured. The permanent independent protocol, including cusp/notch/near-endpoint sampling and failure checks, is specified in [testing](testing.md#perceptual-guide-acceptance-protocol).

The boundary oracle uses nominal linear RGB membership `0 ≤ r, g, b ≤ 1`. Editor-domain edges are excluded; the L/C gray axis and a/b disc outline cannot be fabricated as target-gamut boundaries. The metric compares full-domain geometry before camera cropping; it excludes stroke width and antialiasing. Float32 conversion and two-decimal SVG coordinates in a 1000-unit view box are included, rather than deducted from the measured error.

Successful geometry claims no continuous maximum-distance guarantee, exhaustive component discovery, formally certified topology, exact arithmetic/roots, equivalent numerical results across every JavaScript engine, or accuracy outside this scope. Finite scans can miss narrow features or tangencies. A small measured maximum is empirical evidence, not formal certification.

Detected defects remain failures: no coarse-table fallback, known incomplete successful geometry, invented domain edges, stale successful contours or contradicted spatial Reference. Exact Status remains authoritative and independent. Formal continuous/topological certification is future research, not a Phase 2O acceptance blocker.

### 16.2 Mechanism

The implementation uses numerical ray crossings, sampled event localization and midpoint refinement, computed once per guide slice. This mechanism is empirically tested under §16.1; it supplies no continuous or topology certificate. The [independent review](phase-2o-independent-review.md) correctly rejected it against the earlier formal contract.

1. **Numerical crossings per ray.** In OKLab, `lms' = M1 (L, a, b)` is linear, `lms = lms'^3` and `rgb = M2 lms`. Along a ray `(L, c·cos h, c·sin h)` each linear RGB channel is algebraically a cubic polynomial in chroma `c`. The implementation splits at numerical derivative roots and solves sign-changing monotone pieces with safeguarded Newton iteration. Membership between roots is tested in floating point against nominal channel bounds. This is not exact root arithmetic or a guarantee of 1e-15 error at every degeneracy. Each ray yields ordered membership transitions with direction and binding channel/bound. The slice parameter is L for fixed-hue L/C and hue for fixed-L a/b.
2. **Events.** Along the slice parameter, a crossing's binding constraint can change (a corner, such as a cusp), or two crossings can appear or disappear together (a fold, the edge of a notch). The signature (crossing count, directions and binding ids) is constant between events. Starting from uniform seeds (64 L intervals, 120 hue intervals), every interval whose end or midpoint signatures differ is bisected until the event is isolated to 1e-13 of the parameter range.
3. **Midpoint refinement.** A same-signature interval is split while any branch's midpoint lies more than τ = δ/2 from the chord. Further required chord refinement at depth 24 now reports `approximation-budget`, rather than silently accepting the interval. Event localization has its separate parameter-resolution/work bound. A sampled same-signature interval is not proof that no interior event exists.
4. **Stitching.** Branches are joined through events. A corner continues the same branch index. A fold joins the two converging branches. L/C chains that start and end at black or white are assembled as black-side loops, then the main black-to-white chain, then white-side loops. a/b chains are closed loops. The result is the boundary polyline, including notches, as the existing `{ points, closed }` form.

### 16.3 Work, determinism and failure

- **Ownership and bounded work.** Core owns numerical ray crossings and intervals. Render owns display tolerance, tracing, topology, memoization and limits of 16,384 ray evaluations and 16,384 vertices per guide. Work exhaustion becomes `value-unavailable` with reason `approximation-budget`; discovered incomplete traversal becomes `numerical-failure`. It never intentionally returns discovered partial geometry. This does not prove an unsampled component was discovered.
- **Camera independence.** Geometry is computed once per guide slice (gamut plus fixed coordinate) at the 8x tolerance, not per viewport. Camera frames still never resolve guides (invariant I06). Server output is the same function of the accepted state as before. A small last-result memo per gamut and plane kind avoids recomputation when only the varying coordinates change, such as dragging inside the plane.
- **Determinism.** Repeated computations and production serialization in the same engine are tested for identical output after memo eviction. Binary64 arithmetic, square roots and trigonometry remain numerical operations; neither exact roots nor cross-engine numerical equivalence is claimed. SSR/hydration is verified separately.
- **Not exact status.** Guide geometry never feeds gamut status. Status keeps `analyzeGamut` and its own tolerance. Nothing in this computation authors, maps or clamps a `ColorValue`.

### 16.4 Reference and controls

The perceptual Reference marker and Chroma slider intervals read the same numerical ray crossings. The marker-to-contour agreement has owner-level sampled checks under §16.1, rather than an all-point certificate. A failed requested contour suppresses spatial Reference while retaining the sampled fact and independent exact Outside warning.

- The Reference point is the exit crossing that bounds the color's chroma from below: the chroma-reduction direction the excursion annotation already depicts.
- The Chroma slider intervals are the ray's in-gamut intervals. With a notch there can be more than one.
- When the excursion is shown, and that it requires an accepted exact Outside, is unchanged.
- The Hue and Lightness slider intervals keep the sampled table. They are not magnified by the camera, and their error is recorded as a limitation rather than silently claimed exact.

### 16.5 Alternatives evaluated

| Option                                                                    | Verdict                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finer generated tables                                                    | Rejected. One chroma per (L, h) cannot represent notches. Meeting δ at the blue cusp by interpolation alone would need on the order of 10^4 hue by 10^3 lightness entries (tens of MB) and still be wrong at folds.                               |
| Runtime max-chroma bisection (`findMaximumChroma`) plus adaptive sampling | Rejected. It is single-valued, picks an arbitrary crossing in notches, and its error is not bounded at corners. The first prototype measured 78 px at 8x in the sRGB blue a/b slice.                                                              |
| Viewport-aware refinement per camera frame                                | Not needed. Whole-slice refinement at the 8x tolerance costs about a millisecond and a few hundred vertices. Refining per frame would couple guides to the camera, break I06 and add lifecycle and SSR complexity without improving the contract. |
| Generated seed plus adaptive refinement                                   | Superseded. A table seed only speeds up a root bracket, and numerical cubic crossing queries are already cheap. Uniform seeds remain the initial event search grid.                                                                               |
| **Numerical crossings, sampled events, midpoint refinement (current)**    | Handles observed notches with bounded work and camera independence. Continuous two-way accuracy and exhaustive event discovery remain unproved.                                                                                                   |
