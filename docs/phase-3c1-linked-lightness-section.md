# Phase 3C.1: Linked lightness section

Starting commit `17802b347d92e617077b007875e697e22c633a01`. Evidence labels used throughout: **[observed]** a directly inspected fact, **[measured]** a finite sampled result with its method stated, **[proved]** a derivation whose steps are given, **[judgment]** an engineering decision, **[proposed]** a target not adopted as a gate, **[unverified]** a hypothesis that was not tested.

## Summary

1. `/spatial` now hosts the real compact instrument beside the scene. One authored `ColorValue` is shared: the instrument edits it, the spatial view only observes it. A selected-color **marker** sits at the color's true OKLab coordinates, and a horizontal **section** at the color's lightness shows the real sRGB and Display P3 boundaries on that plane.
2. The section is **exact cube-face geometry, not a mesh cut**. Every contour vertex lies on an RGB cube face (one channel exactly 0 or 1) at the requested lightness to rounding. Contours are verified against core's independent ray solver and gamut analysis: 0 crossing-count mismatches in 24,480 rays per gamut, and every sampled boundary point within the declared 1e-5 OKLab tolerance (0.076 CSS px at 12× zoom on the declared stage).
3. The key mathematical fact is that **OKLab lightness is strictly increasing in every linear RGB channel** for both gamuts ([proved](#41-why-the-construction-is-sound), margin 18.5 and 16.3, and 1.08 million finite differences each with no exception). It makes every cube face contain at most one contour arc, a graph in a known direction, and it makes the whole boundary a closed loop assembled by cube-edge identity.
4. The camera finding: scene coordinates are `(X, Y, Z) = (a, L, b)`, which is a **mirror image** of the right-handed OKLab frame. Looking down from above puts +a right and +b _toward the viewer_ (down the screen). The a/b picture of the OKLab editor, +a right and +b up, is the view **from below** the plane. **View section** does exactly that, verified in tests by projecting through the rendering camera and by reading rendered pixels.
5. Because the section is only readable from the plane's far side, the focused body is **cut away on the viewer's side** (an explicit presentation policy, no transparency). Seen end-on, the body, the axes and the L labels are left out so the section reads as a flat a/b field.
6. Everything is bounded and deterministic: about 0.4 ms per section in Node, 75 to 261 vertices, an explicit work budget, and a distinct error for an exhausted budget. An empty section (lightness outside 0 to 1) is a success; an unobservable color or an exhausted budget is unavailable, never an empty drawing.

## 1. Mathematical section definition

Scene coordinates are exactly `(x, y, z) = (a, L, b)`, no centering or scaling (Phase 3A). For a built-in gamut with linear-RGB cube `C = [0,1]^3` and the OKLab conversion `F`, the section at lightness `L0` is

```text
S(L0) = { (a, b) : F⁻¹(L0, a, b) ∈ C }        in the plane y = L0
```

Writing `F⁻¹(L, a, b) = N · (L + κ · (a, b))³` with core's two matrices (`κ` the LMS′ rows of OKLab, `N` the LMS → linear matrix, cube taken component-wise), each linear channel is a **cubic polynomial in (a, b)** on the plane. The section is therefore the semialgebraic set `0 ≤ q_i(a, b) ≤ 1` for the three channels, and its boundary lies on the six cubic curves `q_i = 0` and `q_i = 1`, restricted to where the other two channels are in range. Equivalently, the boundary is the set of cube-face points whose lightness is `L0`. No maximum-chroma envelope is involved and no star-shape about the neutral point is assumed: the notch cases below are not star-shaped.

Special values: for `L0` outside `[0, 1]` no color of the gamut exists (**empty**, a success). Exactly `0` or `1` admits only the neutral point (**point**), matching core's `gamutRayCrossings` ("at 0 or 1 the in-gamut set is the gray alone"). A section can in principle be a line or several components; the types and assembler allow several loops, but no built-in gamut at a lightness in `(0, 1)` produces anything but one loop (see [§5](#5-contour-topology-and-failure-semantics)). A line section does not occur for these gamuts and is not represented.

## 2. Selected-color and inspection ownership

The ownership rule is the existing one: one parent-owned `ColorValue`, edited only by the instrument. The spatial host:

- holds the value in a `shallowRef` and passes it to the instrument as `v-model`. It never constructs a replacement from an observation. A unit test shows that reauthoring from the OKLab observation would define a different color (`definingEquals` false), which is why observation and authorship are kept apart.
- observes it through core: `represent(value, "oklab")` gives `(L, a, b)` and the marker's scene position `(a, L, b)`. Alpha never moves the point. A missing hue on an achromatic color observes at the neutral axis (core's rule). A failed conversion is **unavailable**: no marker, no followed section, and the summary says so.
- takes exact gamut membership for the summary from `analyzeGamut` of the authored value, never from drawing or occlusion.

Two section modes, both pure state (`sectionModel.ts`, two plain fields, no color):

| Mode                      | Section lightness                            | Effect of a/b-only edits                 |
| ------------------------- | -------------------------------------------- | ---------------------------------------- |
| **Follow selected color** | the accepted color's observed OKLab L        | marker moves; the section is not touched |
| **Inspect lightness**     | an independent value, chosen with the slider | marker keeps its genuine 3D position     |

Entering inspect mode keeps the lightness already shown, so nothing jumps. Moving the slider while following also enters inspect mode. Returning to follow restores the accepted lightness. Inspect never calls a color-authoring operation, and a marker that is off the inspected plane is **never moved or clamped onto it**; a faint dashed drop line to the plane says "this color, at another lightness" without being a second marker.

Representation switching in the instrument, camera actions, visibility changes and the cut toggle never change the authored value. The host exposes the authored definition as `data-authored-space` and `data-authored-channels` (test and evidence aid) and the browser tests compare it before and after each action.

## 3. Updating only what changed

| Change                              | Work                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------- |
| camera only                         | projection, silhouette and cut for the new view; no section, no meshes |
| a/b only (followed L unchanged)     | marker position and drop line; no request, no build, no line upload    |
| accepted L change (follow)          | one latest-wins request; contours and plane rewritten once             |
| inspected L change                  | the same, from the slider                                              |
| surface, outline, presentation, cut | visibility flags and uniforms; cached sections are reused              |

The followed lightness is a plain number, so a Vue watcher on it does not fire for an a/b change; the browser test counts requests, builds and line uploads to prove it (`uploads.contours`, `uploads.footprint` unchanged while `uploads.marker` increases).

Section computation is **synchronous and measured** (about 0.4 ms median in Node, see [§10](#10-performance-and-lifecycle-measurements)), so no worker is used. Requests go through a latest-wins scheduler that asks the host for one flush per animation frame. A burst builds at most once per frame for the newest value. The scheduler also carries a revision so that, if the generator ever becomes asynchronous, an older result that completes later is dropped; this is unit-tested with a controllable promise. The cache is a bounded least-recently-used map (24 entries) keyed by the **exact** requested double: nothing is quantized to improve the hit rate (tested: `0.5`, `0.5 + 1e-12` and `0.5 + 2⁻⁵²` are three builds).

## 4. Numerical contour generation

### 4.1 Why the construction is sound

Let `L(q) = w · cbrt(M q)` with `M` the linear-RGB → LMS matrix and `w = (w_l, w_m, w_s)` the lightness row, `w_s < 0` and small.

**[proved]** `∂L/∂q_j = ⅓ Σ_k w_k M_kj x_k^(-2)`, `x_k = cbrt((Mq)_k) > 0`. Every `M` entry is positive, so only the single negative weight can oppose. Since `l_m / l_s ≤ ρ := max_j(M_mj / M_sj)` for non-negative `q`, the `m` term alone dominates when `w_m M_mj > |w_s| M_sj ρ^(2/3)` for each channel `j`. `lightnessMonotonicityMargin` evaluates the worst ratio of the two sides from **core's own matrices** (`spatialColorDefinition`) and the generator refuses a gamut whose margin is not above 1. The margins are **18.45 (sRGB)** and **16.29 (Display P3)**. **[measured]** In addition, 1,080,000 central differences per gamut (mixed uniform and log-uniform points down to 1e-9, half-width 1e-6 relative) were all positive.

Consequences, for `0 < L0 < 1`:

1. Along each of the 12 cube edges `L` is strictly increasing, so an edge crosses `L0` at most once. Black is the unique minimum and white the unique maximum.
2. On a face with free channels `(u, v)`, `L` is strictly increasing in both, so `{L = L0}` is a continuous strictly decreasing curve: **at most one arc per face**, and `τ = u − v` is strictly monotone along it. The arc is a graph over `τ` whose slope in the `(τ, u + v)` frame is bounded by 1: no vertical tangents and no folds, however steep the arc looks in `(u, v)`.
3. A face is cut by the plane in 0 or 2 edge crossings (the below-set of the corners is down-closed, so 4 flagged edges cannot occur).

### 4.2 Algorithm

1. Convert the 8 cube corners with core's `linearRgbToOklabBatch`. A corner counts as below the plane when `L(corner) ≤ L0`. This tie rule is a symbolic perturbation of `L0` applied to every edge and face, so a plane through a cube vertex still yields a closed, correctly connected loop (tested for all six primary and secondary vertices in both gamuts).
2. Guard: seven interior samples per edge must be strictly increasing. This catches a conversion that disagrees with the analytic margin; it is a guard, not a proof.
3. Solve each flagged edge for its crossing, in lockstep with one batched conversion per iteration (a safeguarded Illinois iteration on `L³ − L0³`, which is close to linear along a chord even near the cube-root singularity at black). A violated bracket or non-convergence within 100 iterations is a numerical failure.
4. For each face with two crossings, sample 24 interior points uniformly in `τ`: each is the root along the diagonal chord of constant `τ`, solved the same way.
5. Refine by midpoint bisection in `τ`: an interval closes when its chord midpoint is within the tolerance (1e-5 OKLab, in the plane) of its segment; otherwise the midpoint becomes a vertex and both halves reopen. At most 16 rounds.
6. Assemble loops by cube-edge identity (§5).

All conversions go through core's batch bridge, so the numeric definition revision (`texel-1.1.11-linear-oklab-v1`) is the same as the mesh generators'. Nothing here is a mesh intersection.

### 4.3 Alternatives considered

| Method                                    | Verdict                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trace core's `gamutRayCrossings` over hue | Rejected as the generator. A crossing set per sampled hue does not give topology: a fold (two crossings born at a tangent hue) between two samples is missed, and joining branches across hues needs fold detection. Kept as the **independent authority** in tests, where it is exactly the right tool. |
| Marching squares per face                 | Rejected: needs a grid and refinement policy per face, and can miss thin features. The monotone-graph structure makes it unnecessary.                                                                                                                                                                    |
| Mesh-plane intersection                   | Rejected as scientific truth (brief). Measured in [§9](#9-numerical-error-evidence): the radial mesh cut is within 1.8e-5, the fixed grid's within 6.0e-4 to 7.0e-4.                                                                                                                                     |
| Closed form on the lower cones (radial)   | The three faces through black are exact cones, `L(t q) = t^(1/3) L(q)`, so lower-face contour points have `t = (L0 / L(rim))³` in closed form. Not used to generate (one generic path is simpler and equally accurate); used as an **independent exact check** of every lower-face vertex (§9, 1e-10).   |

**Finding about core (unchanged).** `gamutRayCrossings` does not report a hue ray that merely _touches_ the gamut at one point where two channel bounds coincide (for instance along the blue axis edge, where the section has a sharp tip). The interval logic tests the midpoint of a zero-width interval. 94 of 723 edge-crossing vertices in the sRGB sweep are such points. They are verified with `analyzeGamut` instead (status not `outside`); every other vertex agrees with the solver to 6e-13 relative. Core is not changed in this phase.

## 5. Contour topology and failure semantics

Each vertex of the result carries provenance:

- `linearRgb`: the source cube point; at least one channel is exactly 0 or 1.
- `segmentFaces[i]`: the face `2 · channel + bound` of the cube face containing segment `i → i + 1`; both end vertices have that channel exactly at that bound.
- `edges[i]`: the cube edge (0 to 11) when the vertex is a crossing of one, otherwise −1.

Arcs join **only at shared cube-edge crossings**. `assembleSectionLoops` follows edge identity, requires every crossing to be shared by exactly two arcs, and fails with `topology-inconsistent` otherwise. Tests build two disjoint loops from synthetic arcs, and arcs whose endpoints coincide in the plane under different edge identities, and check that they are **not** merged. Loops are oriented counterclockwise in `(a, b)`.

| Outcome                 | Result                  | Meaning                                                                                                    |
| ----------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `region`                | `ok`, one or more loops | the exact boundary within the declared tolerance                                                           |
| `point`                 | `ok`, the neutral point | `L = 0` or `L = 1`                                                                                         |
| `empty`                 | `ok`, no geometry       | `L` outside `[0, 1]`: no color of the gamut has it                                                         |
| `invalid-options`       | `ok: false`             | non-finite lightness, unknown gamut, invalid limits                                                        |
| `resource-budget`       | `ok: false`             | conversions, vertices or refinement rounds exceeded; deterministic                                         |
| `numerical-failure`     | `ok: false`             | conversion failure, bracket violated, non-convergence, or a gamut whose lightness is not provably monotone |
| `topology-inconsistent` | `ok: false`             | crossings not shared by exactly two arcs, or a loop that does not close                                    |

An error never carries partial geometry, and the UI shows "unavailable", not an empty drawing. Limits: 300,000 conversions, 4,096 vertices in the viewer (the scene's line buffers are sized to it), 16 rounds, 100 solver iterations, 24 initial samples per arc. Equal inputs give bit-identical results (tested).

## 6. Renderer integration

The scene keeps its Phase 3B-R contracts (orthographic camera, equal scale, radial boundary at m = 64, demand-driven frames, one WebGL2 context). New drawing:

| Layer                           | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| section contours                | one `LineLayer` per gamut, written from the exact loops, y = L0. sRGB: solid mint, 2.5 px. Display P3: dashed amber, 2.5 px. Dark 2.5 px casing for legibility over color. Hidden pass: thinner stipple.                                                                                                                                                                                                                                                                                                                                      |
| section fill ("cap")            | a quad on the plane whose **fragments exist only where the focused gamut contains the color**, evaluated per fragment with the same core-owned OKLab → linear RGB definition as the surface shader. It is the region itself (notches and any number of components for free), not a polygon built from the contour. Color mode shows each fragment's real preview color, which is the OKLab editor's a/b field at this lightness; Shape mode a flat tone. Float32 evaluation with a 1e-6 linear-RGB tolerance: a presentation, not membership. |
| viewing plane                   | a thin footprint rectangle at y = L0 (±0.45, matching the axes) and a lightness tag.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| silhouette of the cut-away part | a faint dashed outline so the whole gamut stays recognizable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| selected color                  | the marker, and a drop line when the plane is at another lightness.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Line geometry is rewritten **only when a new result object arrives** (reference equality); line widths are CSS pixels at any DPR (the existing layer converts them). Nothing is rebuilt per camera move.

**Presentation policy: cut away.** An opaque closed surface hides its own section, so the focused body is clipped on the viewer's side of the plane (the half-space containing the camera is removed) and the cap faces the viewer. The side follows the view direction each frame, so orbiting past the horizon swaps which half is kept; the section is edge-on there and the swap is the only discontinuity. The Lambert surface uses one always-present clipping plane (no program change when toggled) and the color shader a `clipSide`/`clipLevel` uniform pair. If the focused section is not a drawable region the cut is disabled, so the body is never left hollow. "Cut away" is a checkbox; with it off the whole body is drawn and the contours are lines on the surface. **No transparency, depth peeling or post-processing is used.**

**Section on its own.** Within 20° of looking along the L axis the focused body, the axes and the L labels would all project onto the section, so they are not drawn there and the silhouette outline is the whole gamut seen end-on (its a/b extent). This is a presentation threshold, not a scientific one.

**Identity of lines** (never color alone): outline of the other gamut, pale blue 1.75 px solid (hidden: stippled); active sRGB section, mint solid 2.5 px; active Display P3 section, amber long-dash 2.5 px; plane footprint, thin gray; cut-away silhouette, faint short dash. A key under the stage repeats the swatches with their dash and weight.

## 7. Marker and camera behavior

**Marker.** A constant-screen-size marker (light disc, dark halo; 4.5 + 2 CSS px) at the true scene position `(a, L, b)`, derived from core observation, never clipped, normalized or moved onto a boundary. It is **depth tested like a surface**, never always on top: where nothing hides it, the filled disc; where the drawn body hides it, only a dim **hollow ring** (the same "dashed means behind" convention as the outlines). The depth pull toward the viewer is larger than a line's so a marker lying on the plane is not cut by the cap it sits on.

A presentation probe (`isPointHidden`, `isHiddenByCap`, reusing the core-owned color definition the shader uses) decides whether to offer **Show selected**. It never claims anything about membership, which comes from `analyzeGamut`. Show selected follows the selected color, turns the cut on and, if the color is still hidden or off screen, takes the section view. A color outside the viewport says so, and **Fit visible** includes the marker. Unavailable observation: no marker.

| Case                                       | Behavior                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| inside the focused body, cut on, following | on the cap, visible                                                                             |
| plane above it (inspect)                   | behind the cap: hollow ring, "behind the surface", Show selected                                |
| cut off, inside the body                   | hollow ring, "behind the surface", Show selected                                                |
| outside the focused gamut                  | floating at its true position, visible (cut side), not hidden by the body it is outside of      |
| outside both gamuts                        | the same; summary says "outside sRGB, outside Display P3"                                       |
| extended coordinates                       | true unclamped position; if off screen, "outside the current view" and Fit visible brings it in |
| unobservable                               | no marker; the section can still be inspected                                                   |

**Camera and orientation.** [proved] In the right-handed OKLab frame `a × b = L`. In the scene, `X × Y = a × L = −b = −Z`, so `(X, Y, Z) = (a, L, b)` is left-handed: the scene is a mirror image of OKLab (Phase 3A recorded the orientation reversal; it matters only now, for the view). For a right-handed camera, `right × up = backward`. Requiring `right = +X` and `up = +Z` gives `backward = X × Z = −Y`: the eye is on the **−Y** side, looking along **+Y**. From above (+Y) either +a is left or +b is down. **View section** therefore places the camera below the plane with the lightness axis as its view direction, shared Y-up orbit frame retained, an azimuthal offset of 1e-4 rad toward +Z (OrbitControls keeps its polar angle strictly inside (0, π) and takes the up direction from it), and frames the union of the visible sections and the marker with 25% margin. Tests assert the camera's basis (right·X, up·Z, positive handedness, equal scale at three aspects), project known points through the rendering camera in the browser, and read the **rendered pixels**: the color at the screen position of `(a, L, b)` equals the independent CSS Color 4 XYZ reference of OKLab `(L, a, b)` within 3 eight-bit levels at over 20 section points. Home and Fit keep their meaning (Home returns to the spatial pose; Fit uses the current orientation); camera changes are immediate (no transition to interrupt or to disable for reduced motion).

## 8. Product layout and interaction decisions

Wide hosts (from 1100 px) put the scene on the left and, on the right, the section controls above the **real compact instrument** at its established 480 px maximum width and internal anatomy; narrower hosts stack scene, section controls, instrument. The study's own button, link and focus rules are scoped so they cannot reach the instrument. Controls are few: `Follow selected color` / `Inspect lightness` (a native radio group), one range input (step 0.001, accessible name, `aria-valuetext` such as "L 0.668, inspected separately"), `View section`, and `Cut away`; `Show selected` appears only when needed. Section facts are text, not hover: the selected color and its exact membership, the section's lightness, origin and per-gamut extent, and "empty", "only the neutral point" or "unavailable" where true. A polite live region is updated 600 ms after the last change (a 12-step keyboard scrub is announced once). Without WebGL2 the instrument and every section fact still work and View section is disabled. The key (line identities, marker, hollow ring, plane) sits below the stage so it never covers the scene.

## 9. Numerical error evidence

Machine-readable: [phase-3c1-section-measurements.json](phase-3c1-section-measurements.json), regenerated with `node packages/render/scripts/qualifyLightnessSection.ts` (about 15 s). The declared screen envelope is Phase 3B-R's: a 900 CSS px stage showing 1.42 units at zoom 1, 633.8 px per unit. **Every figure is a finite sample, not a continuous bound.**

**[measured] Against core's ray solver** (1,440 hue rays per lightness, 17 lightnesses from 0.002 to 0.999, both gamuts; core's `gamutRayCrossings` is the authority):

| Gamut      |   Rays | Count mismatches | Plane distance, max | At 1× / 4× / 12× zoom (CSS px) | Chroma along ray, max |
| ---------- | -----: | ---------------: | ------------------: | ------------------------------ | --------------------: |
| sRGB       | 24,480 |                0 |             9.99e-6 | 0.006 / 0.025 / 0.076          |               1.18e-4 |
| Display P3 | 24,480 |                0 |             9.98e-6 | 0.006 / 0.025 / 0.076          |               4.18e-5 |

Plane distance, not chroma along the ray, is the gated quantity: where the plane grazes the surface the ray-parameterized error is amplified (up to 12× here, the same effect Phase 3B-R recorded).

**[measured] Dense samples of the true boundary** (per face, 5,000 cubic-spaced knots in each free channel, the other channel solved by 70 bisection steps; independent of the generator's `τ` chords): 108,176 (sRGB) and 103,352 (P3) points, all within 9.99e-6 of the polyline.

**[measured] Vertices and provenance.** 31,205 (sRGB) and 31,668 (P3) face vertices over 199 lightnesses: 0 binding mismatches against core, maximum relative chroma difference 6.3e-13. Edge-crossing vertices are 723 and 720; 94 sRGB crossings are touching points that core's interval logic does not report (§4.3), checked with `analyzeGamut` instead.

**[measured] Membership.** 44,567 (sRGB) and 44,592 (P3) probes on 7 lightnesses, excluding 233 and 208 within four tolerances of the boundary: 0 disagreements between even-odd polygon membership and `analyzeGamut` of the OKLab color.

**[measured] Residual and sizes.** Lightness residual of converted vertices at most 1.7e-15. Over 410 lightnesses (399 uniform plus near-black and near-white down to 1e-6 and 1 − 1e-6): no failures, always one loop, 75 to 261 vertices (median 151, 154), 990 to 3,373 conversions, at most 5 refinement rounds.

**[measured] Lower faces are exact cones.** Every lower-face vertex equals the point rebuilt from its rim point and the rim's lightness alone, `t = (L0 / L(rim))³`, to 1e-10 relative (unit test over 200+ vertices).

**[measured] A mesh cut is not the section.** Distance in the plane between the exact contour and the same plane cutting the mesh (13 lightnesses, both directions):

| Gamut      |     Radial hybrid m = 64 |  Fixed grid cubic n = 64 | Ratio |
| ---------- | -----------------------: | -----------------------: | ----: |
| sRGB       | 1.80e-5 (0.14 px at 12×) | 6.00e-4 (4.56 px at 12×) |   33× |
| Display P3 | 1.77e-5 (0.13 px at 12×) | 6.95e-4 (5.29 px at 12×) |   39× |

This is the concrete payoff of the radial hybrid: the clipped surface's rim coincides with the exact contour to a fraction of a pixel at every supported zoom, where the grid would show a visible gap near black. It is still not exact truth, so the contour never comes from the mesh.

**Regression cases** (core crossings, in-plane distance from each to the polyline): sRGB L = 0.44, h = 264.1: three crossings at 0.26223, 0.30080, 0.30474, distances 2.6e-6, 1.2e-7, 8.7e-7; sRGB L = 0.006, h = 264.125: distances 3.2e-7, 2.2e-7, 7.6e-8. A 4,001-ray sweep through the fold hues (L = 0.44, 262° to 266°) shows no count difference. Additional planes through each of the six cube vertices, near-black (down to 1e-12), near-white (to 1 − 1e-12) and `5e-324` are in the tests: each is a verified section or an explicit error.

**Failure and budgets.** L = 0 and 1 are points; −0.001 and 1.001 empty; NaN is `invalid-options`; 600 conversions, 40 vertices, 1 refinement round and a 1e-13 tolerance each give `resource-budget`, repeatably.

## 10. Performance and lifecycle measurements

Environment: Windows x64, AMD Ryzen 7 8845HS, Node 24.19.0, Playwright Chromium on ANGLE SwiftShader (a **software rasterizer**; no physical GPU). Timings are single local observations with JIT and GC variability, not a controlled benchmark.

| Quantity                                                                  | Result                                                                                                                                                                                                    |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One section, Node (410 lightnesses × 2 gamuts)                            | median 0.39 ms (sRGB), 0.36 ms (P3); p95 0.95 and 0.67 ms; maximum 5.1 and 1.3 ms (first calls, before the JIT is warm)                                                                                   |
| One section, size                                                         | 75 to 261 vertices; 990 to 3,373 conversions; at most 5 refinement rounds; vertex positions and RGB about 50 bytes per vertex, so a section is under 13 KB                                                |
| Both gamuts per lightness change, in the browser, while dragging          | mean 1.6 to 2.3 ms per computed frame over three 60-frame drags in which every request misses the cache; maximum 5.5 ms ([data](phase-3c1-burst-measurements.json))                                       |
| 150 slider events dispatched in one task                                  | 1 request, 1 build (coalesced); the final value (L 0.900) is the one drawn                                                                                                                                |
| Cache                                                                     | 24 entries, exact doubles; 184 builds, 160 evictions, 24 resident in the drag run                                                                                                                         |
| a/b-only edits                                                            | 0 requests, 0 builds, 0 contour or plane uploads; one marker update (browser test)                                                                                                                        |
| Draw calls at the default pose (sRGB surface, outline on, Shape, section) | **16**: cap, surface, other-gamut outline (2), axes, plane footprint (2), cut-away silhouette, sRGB contour (3: casing, line, hidden), P3 contour (3), marker (2)                                         |
| Draw calls with no section supplied                                       | **4** (or 2 without the outline): unchanged from Phase 3B-R, so every earlier regression threshold passes unmodified                                                                                      |
| Surface triangles                                                         | 24,960 per gamut, unchanged; the lifecycle harness reports 29,538 drawn triangles including line instances                                                                                                |
| Section line storage                                                      | two contour buffers 4,096 segments × 24 B (196,608 B), cut-away silhouette 393,216 B, plane 192 B, drop line 24 B; written in place, none created after construction                                      |
| Initialization (software GPU)                                             | boundary generation 8.7 ms and 4.3 ms, upload 14.3 ms and 11.2 ms; no section mesh is generated and no Float64 mesh data was added                                                                        |
| Idle                                                                      | no frame is requested without a change; settled interaction schedules none (tests wait 150 to 200 ms and compare frame counts)                                                                            |
| Context loss and restore                                                  | the **same pixels** are drawn after restoration, with cap, contours, marker and silhouettes rebuilt from CPU data; geometry and upload counters unchanged ([data](phase-3c1-lifecycle-measurements.json)) |
| Disposal and remount                                                      | after `dispose()` (called twice) geometries 0, programs 0, listeners none; three further mount and dispose cycles repeat the same draw-call, geometry and program counts                                  |

**A defect found by the lifecycle pixel check (fixed).** After a context restore the stage background came back black instead of `#191d22`: three re-creates its background state when it re-initializes the GL context and drops `setClearColor`. The Phase 3B-R lifecycle test only counted frames, so it did not see it. The scene now sets the clear color again on restore; the new test compares the canvas before loss and after restoration and requires equal bytes.

## 11. Browser and visual evidence

All captures are Playwright Chromium on a software rasterizer, DPR 1, reduced motion, the real compact instrument on the right, and were inspected, not merely generated. Reproduce with `SPATIAL_SCREENSHOTS=<dir> pnpm --filter @gamut-plane/web exec playwright test e2e/spatialSection.spec.ts` (the "before" images were taken the same way from the starting commit in a temporary worktree).

### Before and after

The starting `/spatial` was a single scene with its own toolbar, no color, no marker and no section. The same view and presentation after this phase:

![Before: the Phase 3B-R scene, Color mode](phase-3c1-evidence/before-desktop-color.png)

_Before (`17802b3`), Color mode, 1600 px wide._

![After: follow mode with the cut-away section, the marker and the instrument, Color mode](phase-3c1-evidence/desktop-follow-color.png)

_After, Color mode, default state. The selected color OKLCH(0.68, 0.15, 252) is the white marker on the section plane at L 0.680. The plane's cap shows the real colors at that lightness; the sRGB boundary at that lightness is the solid mint line, the Display P3 boundary the dashed amber line; the faint outline above is the cut-away part of the gamut. The compact instrument keeps its own 480 px column._

![After, Shape mode](phase-3c1-evidence/desktop-follow-shape.png)

_Shape mode. The cap is a flat light tone so it outranks the neutral body; the hierarchy is cap, marker, contours, surface and outlines, axes._

| Before, phone (390 px)                                | After, phone (390 px)                         |
| ----------------------------------------------------- | --------------------------------------------- |
| ![Before, phone](phase-3c1-evidence/before-phone.png) | ![After, phone](phase-3c1-evidence/phone.png) |

The phone layout stacks the scene, its key and summary, the section controls and the instrument, with every control inside the viewport (tested at 390 and 320 px). The capture shows the default follow state at L 0.680.

### Section view: a to the right, b up

![Section view, Color mode](phase-3c1-evidence/desktop-section-view-color.png)

_View section, Color mode._ The camera looks along +L from below (§7). The body, the axes and the L labels are not drawn, and the faint outline is the gamut seen end-on. Blue lies lower left, magenta right and yellow-green top, as in the a/b editor. The marker is where OKLCH(0.68, 0.15, 252) belongs, lower left. The pixel color at the screen position of any section point equals the independent XYZ reference of that OKLab color within 3 levels (browser test).

![Section view, Shape mode](phase-3c1-evidence/desktop-section-view-shape.png)

### Colors, surfaces and inspection

| Case                         | Capture                                                                                                 | What it shows                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P3-only color                | ![P3-only color](phase-3c1-evidence/desktop-p3-only-color.png)                                          | OKLCH(0.62, c, 145) with c chosen by core analysis: outside sRGB, inside Display P3. The marker sits outside the mint sRGB contour and inside the amber P3 one. |
| Display P3 as the surface    | ![Display P3 surface](phase-3c1-evidence/desktop-p3-surface.png)                                        | The focused gamut is P3: its cap fills the P3 region (sRGB-clipped preview colors), the sRGB contour lies inside it, the marker at the P3-only color.           |
| Outside both gamuts          | ![Outside both gamuts](phase-3c1-evidence/desktop-outside-both.png)                                     | OKLCH(0.62, 0.45, 145): the marker floats at its true position outside both sections, not pulled onto either.                                                   |
| Inspecting another lightness | ![Inspect L 0.3](phase-3c1-evidence/desktop-inspect-0.3.png)                                            | Plane at L 0.300, the selected color still at 0.680 with a dashed drop line to the plane; the instrument shows the unchanged color.                             |
| Marker behind the surface    | ![Marker hidden](phase-3c1-evidence/desktop-marker-hidden.png)                                          | Plane at 0.900, the color below it in the kept body: a hollow ring, the note "behind the surface" and **Show selected**.                                        |
| After Show selected          | ![After Show selected](phase-3c1-evidence/desktop-show-selected.png)                                    | Follow mode restored, cut on, the marker back on the section.                                                                                                   |
| Camera orbit                 | ![From above](phase-3c1-evidence/orbit-3-above.png) ![From below](phase-3c1-evidence/orbit-4-below.png) | The section stays drawn from every direction; from above the upper part is cut away, from below near the section normal the section is shown on its own.        |
| Enlarged text, focus ring    | ![Enlarged text](phase-3c1-evidence/enlarged-text-focus.png)                                            | 150% root font size at 1100 px: the controls wrap, nothing overflows, and the focus ring on View section is visible.                                            |

### Browser tests that read the picture, not only the DOM

All in [`apps/web/e2e/spatialSection.spec.ts`](../apps/web/e2e/spatialSection.spec.ts), reading the rendering camera and the rendered pixels through a development-only seam:

- **Shared color.** An accepted chroma or hue edit moves the marker to `(c cos h, 0.68, c sin h)` to 1e-12 with no request, build or contour upload; an OKLab a/b edit at fixed L does the same; a lightness edit moves the section. Inspecting never changes `data-authored-*` or any instrument value, while the color keeps editing; Follow restores the accepted lightness. Switching the instrument through OKLab, sRGB, Display P3 and back changes nothing. Camera, visibility, presentation and cut actions change neither the authored color nor `resources` (no mesh was regenerated).
- **Orientation and field.** Through the rendering camera, +a goes right and +b goes up with equal scale at the section view; the L labels are left out. Over 20 section points the rendered color equals the independent XYZ reference within 3 levels; the marker is a light disc with a dark halo.
- **Contour identity.** For every vertex of the exact sRGB section a mint pixel lies within 2 px (at least 97%); at least 45% of the P3 vertices lie on an amber dash; sRGB vertices carry no amber (under 10%). The cap's edge is hidden under the line: all 35 probes are filled 4 px inside, and the stage color is reached 3 px (median) and at most 4 px outside the vertex, against the 2.5 px half width of the dark casing ([data](phase-3c1-cap-edge-measurements.json)).
- **Occlusion and recovery.** Hidden marker, note, Show selected (which follows, cuts and brings the color back), cut off hides it again, outside-both and extended colors keep their true position, an unobservable color has no marker and no followed section yet inspecting still works.
- **Lifecycle and presentation.** Draw calls, context loss and pixel-identical restoration, disposal, three remount cycles, reduced motion and no-preference (immediate pose, idle afterwards), keyboard order and a single settled announcement for a 12-step scrub, 390, 320, 720×450 and 320×256 viewports and enlarged text without horizontal overflow, device pixel ratio 2 (marker 16 device px, line 4 to 6 device px), axe with and without a live section, and WebGL2 unavailable with the facts and instrument still working.

## 12. Known limitations

1. **One section kind.** Only the horizontal constant-lightness plane exists. The OKLCH editor's fixed Hue, the native RGB editors' curved sheets and any editor-specific correspondence are Phase 3C.2. The OKLab a/b editor is the only editor whose fixed coordinate is the section's.
2. **The construction relies on lightness being monotone in the linear channels.** That is proved and run-time checked for sRGB and Display P3 (§4.1). A new gamut definition must pass `lightnessMonotonicityMargin` or the generator refuses it with `numerical-failure`. The edge-sample guard is only a spot check; the analytic margin is the argument.
3. **Accuracy is a finite-sample statement.** The tolerance is verified at chord midpoints and by 211,000 dense independent samples plus 49,000 core rays. There is no continuous Hausdorff bound and no certificate that every vertex of a different resolution would pass.
4. **The cap is a presentation, not membership.** It is evaluated in 32-bit floating point with a 1e-6 linear-RGB tolerance; its edge is not anti-aliased (the contour line covers it). The interior colors are verified against the independent XYZ route to 3 levels, and the edge is measured to lie under the contour's line (stage color reached 3 px, at most 4 px, outside the vertex; 35 of 35 probes, software rasterizer only). Membership authority stays in core.
5. **Cut and view policies are presentation choices with discontinuities.** The cut flips to the other half when the camera crosses the plane's horizon (the section is edge-on there), and the body, axes and L labels disappear within 20° of the section normal. There is no transition (immediate changes honor reduced motion by construction).
6. **The hidden-marker probe is a ray march** (step 0.01, margin 0.004) and can misjudge a color lying within about 0.01 of a surface. The picture, not the probe, decides what is visible.
7. **The comparison toggle also governs the other gamut's section contour.** There is no separate switch for it.
8. **Inherited, unchanged:** Color mode below L ≈ 0.2 is dark against the stage (the section's contour and casing carry it), Display P3 Color mode is a clipped sRGB preview, one-finger touch drag orbits, and physical GPU frame time, thermal behavior and P3 output are unqualified. Only Chromium on a software rasterizer was measured.
9. **Core finding, not fixed here:** `gamutRayCrossings` does not report a hue ray that touches the gamut at one point where two channel bounds coincide (94 of 723 edge crossings in the sRGB sweep). The section handles those vertices through `analyzeGamut`.
10. **Lightness entry is a slider.** A numeric lightness field and a typed value are not offered; the compact instrument already has numeric entry for the authored color.

## 13. Entry requirements for Phase 3C.2

1. **Keep the contracts:** one authoritative `ColorValue`, observation through core, Float64 scientific geometry, `(a, L, b)` scene coordinates, demand-driven frames, lazy loading, exact analysis as the only membership authority, and nothing in the spatial path authoring a color.
2. **Hue half-planes.** The half-plane `{(C cos h, L, C sin h)}` contains the black axis, so its lower boundary is an exact ray from black and the upper boundary is a chord-sampled curve. Use `gamutRayCrossings(L, h)` over lightness as the primary solver here (one ray per L, with the multi-crossing structure already in core), the radial hybrid for drawing, and the same evidence discipline (plane distance, not chroma along a ray). Preserve disconnected pieces and the multiple-crossing notch fixtures.
3. **Curved native-RGB sheets.** A constant encoded channel is a curved surface in OKLab. The cube-face machinery here (edge identity, provenance, monotone graph arcs) is the starting point, but the argument of §4.1 must be redone for the editor's fixed channel; do not assume it carries over.
4. **Editor-specific correspondence.** Decide which section each editor owns (OKLab a/b: this plane; OKLCH: a half-plane; RGB Areas: sheets), and make the correspondence visible and announced. A projected marker, if ever needed for a color off the section, must be a visibly different thing from the selected color.
5. **Generalize the presentation policy, not the geometry.** The cut should become a cut by the section's own half-space or wedge with the same viewer-side rule and an edge-on policy; the "section on its own" threshold needs a counterpart for half-planes.
6. **Reuse the verification harness**: `experiments/spatial/sectionContour.ts` (ray correspondence, membership, mesh contrast), `qualifyLightnessSection.ts`, and the browser spec's pixel-versus-XYZ reference and camera-orientation method.
7. **Open decisions:** a public Vue/React Spatial Explorer API; a numeric lightness entry; whether the section should be computed in a worker (measured need today: none, §10); whether the fan sliver risk from Phase 3B-R needs radial subdivision after a physical-GPU check.
8. **Evidence still owed:** integrated-GPU frame time and thermal behavior, physical P3 output, Safari and Firefox WebGL behavior, and the cap-edge measurement on a physical rasterizer.

## Validation record

Run on the final tree, Windows x64, Node 24.19.0 (the CI floor), Playwright Chromium on ANGLE SwiftShader.

| Check                                                                                                 | Result                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify:prepush` (format, lint, build, typecheck, all unit tests, production build, build check) | pass; **1,287** unit tests (core 244, ui 201, render 460, vue 143, react 146, web 93; was 1,119)                                             |
| Lazy-loading boundary (`check:build`)                                                                 | pass: the eager graph holds `assets/index-*.js`; the spatial application, its renderer and its stylesheet are one lazy chunk                 |
| Browser suite, `pnpm test:e2e` (compact instrument, accessibility, visual baselines, spatial)         | **213 of 213 pass** (192 before, 21 added)                                                                                                   |
| Section specs alone                                                                                   | 21 new browser tests plus the 8 earlier spatial specs, all unmodified apart from the harness mock for the host test                          |
| `pnpm test:production`                                                                                | 3 of 3 pass (lazy chunk, `/spatial` route, headers)                                                                                          |
| Packed Vue/Vite consumer                                                                              | pass (4 browser cases); includes the intentional contract update for the new `internal/spatial` exports and a run of the installed generator |
| Packed React/Vite consumer                                                                            | pass (8)                                                                                                                                     |
| Packed Nuxt (development, production, generated)                                                      | pass (8 and 8; generated mode 6 passed with 2 intentional SSR skips)                                                                         |
| Packed Next (development, production, Strict Mode)                                                    | pass (8, 8 and 10)                                                                                                                           |
| GitHub Actions on the exact final SHA                                                                 | checked separately at delivery against the exact final SHA and reported there; not asserted in this file                                     |

**Ports.** The React/Vite, Next and Next-with-Strict-Mode gates use fixed ports (4182, 4181). On this machine an unrelated project's preview servers held 4181, 4182 and 4191, so those two gates were run once with the consumers' ports temporarily changed to 4194 and 4195 in `packages/react/consumer/playwright.config.ts`, `packages/react/next-consumer/package.json` and `playwright.config.ts`, then restored (`git checkout`); no committed file differs. The exact-SHA CI run on a clean Linux runner is the confirmation with the committed values.

**Cannot run here:** physical integrated-GPU frame time, thermal behavior, physical Display P3 output, Safari and Firefox WebGL behavior, and the Linux visual baselines (the spatial route has none; the compact instrument's baselines are untouched and exercised by CI).

**Reproduce:**

```powershell
pnpm build:packages
node packages/render/scripts/qualifyLightnessSection.ts > docs/phase-3c1-section-measurements.json   # about 15 s
pnpm --filter @gamut-plane/render exec vitest run test/spatialLightnessSection.test.ts
pnpm --filter @gamut-plane/web exec vitest run test/spatialSection.test.ts
$env:SPATIAL_SCREENSHOTS = "$PWD/.artifacts/phase3c1"; $env:SPATIAL_EVIDENCE = "$PWD/.artifacts/phase3c1/data"
pnpm --filter @gamut-plane/web exec playwright test e2e/spatialSection.spec.ts
pnpm verify:prepush
```

## Appendix: new and changed code

| Path                                                                                                | Purpose                                                                                                                               |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/render/src/spatial/lightnessSection.ts`                                                   | the exact section generator, its monotonicity margin, cube topology, bounded root search and the edge-identity loop assembler         |
| `packages/render/src/spatial/index.ts`                                                              | six new exports on the unsupported `internal/spatial` route (generator, margin, edge id, revision, tolerance, limits) and their types |
| `packages/render/experiments/spatial/sectionContour.ts`                                             | validation helpers against core's ray solver and gamut analysis, mesh cuts, membership (typechecked, never built or exported)         |
| `packages/render/scripts/qualifyLightnessSection.ts`                                                | the reproducible numerical report (about 15 s)                                                                                        |
| `packages/render/test/spatialLightnessSection.test.ts`                                              | 125 tests                                                                                                                             |
| `apps/web/src/spatial/sectionModel.ts`                                                              | OKLab observation, exact membership, follow/inspect selection, exact-double bounded cache, latest-wins scheduler                      |
| `apps/web/src/spatial/sectionPolicy.ts`                                                             | cut side, silhouette clipping, hidden-marker probes, the end-on threshold                                                             |
| `apps/web/src/spatial/sectionSummary.ts`                                                            | the plain-language facts shared by the summary, the canvas description and the announcement                                           |
| `apps/web/src/spatial/sectionLayers.ts`                                                             | the section fill, the marker, the contour, plane, silhouette and drop-line layers, and their writers                                  |
| `apps/web/src/spatial/spatialScene.ts`, `spatialCamera.ts`, `lineLayer.ts`, `colorMaterial.ts`      | integration, the section camera, line casing, the cut uniforms; the clear color is set again after a context restore                  |
| `apps/web/src/spatial/spatialApp.vue`, `spatial.css`                                                | the shared color and the real instrument, section controls, key, summary, announcement; study chrome scoped away from the instrument  |
| `apps/web/test/spatialSection.test.ts`                                                              | 43 unit tests                                                                                                                         |
| `apps/web/e2e/spatialSection.spec.ts`, `spatialHarness.ts`                                          | 21 browser tests and a harness section fixture                                                                                        |
| `scripts/packedConsumer.mts`                                                                        | the packed contract for `internal/spatial` admits the new exports and runs the installed generator                                    |
| `docs/phase-3c1-section-measurements.json`, `-burst-`, `-lifecycle-`, `-cap-edge-measurements.json` | machine-readable evidence                                                                                                             |
