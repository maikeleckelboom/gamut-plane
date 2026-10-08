# 0004: Field viewport

Status: accepted and implemented in Phase 2O. Implementation evidence: [Phase 2O acceptance](../phase-2o-acceptance.md). The original proposal is [the Phase 2O spec](../phase-2o-field-viewport-spec.md) and its [source audit](../phase-2o-source-audit.md).

## Context

The instrument edits one authored `ColorValue` through eight fields (`oklch-lc`, `oklab-ab` and six native RGB Areas). A field is a normalized enclosing square. The pointer maps linearly into that square and then through the geometry's own constraint into an editing operation; the marker, guide paths, domain outline and axis end labels all assume the whole square is on screen.

Inspecting a gamut boundary or placing a marker precisely needs magnification. Magnification must not become color state: it cannot change what is authored, what is observed or checked, or which guides and Reference are requested.

## Decision

Add a presentation-only camera, one per mounted editable field, in both adapters.

- **State.** `{ zoom, center }` in the field's normalized coordinates, 1x to 8x, with the center bounded so the view stays inside the enclosing square. Fit is the canonical `1x, (0.5, 0.5)` and is also what "Reset 100%" would mean, so there is one Fit action. The camera never enters `ColorValue`, `GamutPlaneState`, geometry identity or exact/guide facts, and has no public prop, event or serialized form.
- **One implementation.** The mathematics, a DOM-free camera store and the presentation helpers live in `@gamut-plane/render` and are reachable only through the internal `./internal/viewport` entry. UI owns input policy (wheel, pan, Space, keys, buttons, ownership) and reaches the camera through typed structural ports; it imports nothing from render, which the packed-consumer check enforces. Adapters own the per-instance camera, its committed lifecycle and the DOM glue.
- **Input.** Pointer coordinates are normalized by the existing measured content box, mapped through the inverse **presented** camera, and only then reach the existing editor-domain constraint and authoring operation. They are never clamped to the visible window.
- **Presented-frame barrier.** The camera separates `requested` (coalesced scheduling state) from `presented` (the last pose actually shown). All wheel/pan/button requests compose onto `requested` in event order and become visible in one RAF callback that draws the raster and applies every overlay from the same pose. A pointer or keyboard color gesture starts from `presented` and discards unpresented requests rather than flushing a different view and reinterpreting the same click.
- **Imperative camera layers.** Camera-dependent DOM (SVG view box, projected marker positions, domain outline box, axis end text, readouts) is applied imperatively, never as reactive state, so a camera frame causes no framework re-render and cannot recompute exact checks or guides. Declarative markup stays at its Fit values, which is exactly the server-rendered output; a post-commit reapply restores the presented camera over any patch that rewrote a field-space value.
- **Ownership.** Edit and pan decide from the same pure intent function (`claimsViewportPan`) before any point conversion, focus, capture or preview, and each declines while the other is active. The pointer registry holds per-controller tokens, so an idle controller's reconcile or disposal can no longer clear another controller's claim.
- **Rendering.** The canvas stays the size of the visible viewport. The renderer samples the visible window (`window` in `FieldRenderInput`, part of the cache key) instead of enlarging the raster, so backing allocation does not grow with zoom.

## Consequences

Zoom changes layout height by one control row and the vertical axis end labels may be wider; the left gutter keeps growing with enlarged text so those labels keep the full label size.

Magnifying the table-interpolated perceptual guides exposed displacements of tens to hundreds of pixels and missed notches in the true slices, so they were replaced (review blocker A, [spec §16](../phase-2o-field-viewport-spec.md#16-review-blocker-a-guide-fidelity-under-magnification)). Core owns numerical per-ray crossings; render owns camera-independent tracing, tolerance and work budgets. These are visual guides, never exact Status. Hover-based Space arming, pinch, inertia and persisted/controlled camera state are not provided. Camera reset policy is: preserve across colour, fixed-coordinate, Reference, Status and Boundary changes and rejected requests; reset on an accepted geometry change; dispose on unmount.

## Approved acceptance revision: 8 October 2026

The user explicitly accepted Outcome B from the [certification investigation](../phase-2o-certification-investigation.md). The original continuous symmetric Hausdorff bound of 1 CSS px and exhaustive component discovery are replaced by the [empirical visual-approximation contract](../phase-2o-field-viewport-spec.md#161-contract): built-in sRGB/P3, nominal L/C rectangle and a/b disc, fields <=480 CSS px and zoom 1x–8x. Each permanent acceptance fixture must measure <=1 CSS px in both sampled directions at 480 px/8x, including Float32 and actual SVG serialization.

Success means bounded deterministic numerical visual guidance, not exact roots, continuous accuracy, exhaustive components, certified topology or portable numerical equivalence. Exact membership Status keeps its authority. Detected budget, numerical or traversal failure remains unavailable and suppresses spatial Reference; no stale/coarse fallback or invented domain edge is allowed. The permanent oracle protocol and limitations are in [testing](../testing.md#perceptual-guide-acceptance-protocol).

The independent review's rejection and the investigation's failed/partial proof obligations remain valid historical findings under the original contract. Formal certification remains a future research candidate, requiring a viable interaction budget, rather than a current closeout requirement. No tracer redesign or camera/public API change follows from this decision.
