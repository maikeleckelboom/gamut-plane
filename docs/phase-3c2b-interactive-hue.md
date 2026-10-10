# Phase 3C.2B: Interactive hue half-plane

## Checkpoint A: numerical hardening

Baseline: `36fc968e7bb3df2094529c16a5766ae3c7c8a9a1`, fetched on clean `dev`.
The original isolator rejects `(u-0.5)^3-0.01` with `unresolved multiple root near u=0.5`.
The original polynomial has a simple root; only its derivative has a repeated stationary root.

For a cubic, the derivative is quadratic. Around its vertex, a rounding-scale critical value
now produces an uncertainty **interval**, wide enough to include a possible pair of derivative
roots under the existing coefficient-scale diagnostic envelope. The mean-value bound
`sum(abs(derivative coefficients))*radius` bounds variation of the original polynomial on
that interval inside `[0,1]`. Only if its value exceeds this bound plus its own rounding
envelope is the interval excluded as root-free. The remaining monotone pieces are bisected
normally. No roots are merged, snapped, or inferred at the stationary point.

This is still conservative binary64 numerical reasoning, not outward-rounded interval
certification. Original double/triple roots, ambiguous close pairs and coincident constraints
remain unavailable. Tests cover both offset cubics, three ordinary roots, close distinct roots,
near-endpoint roots, unresolved pairs, resource exhaustion and deterministic output.

The unchanged Phase 3C.2A qualification harness is extended with independent filled-region
interpretation. Even/odd polygon tests are performed separately for each returned sector;
contacts contribute no area. Rectangular and directional samples cover ordinary hues,
264.1/264.125 degrees, sector gaps, source-corner hues, and near-black/white points.
Authoritative `analyzeGamut` checks use the original sampled OKLab color. Points within twice
the sampled chord tolerance or a `2e-6` independent inverse-RGB boundary margin are counted
separately, not claimed as unambiguous membership evidence.

Results: [machine-readable qualification](phase-3c2b-hue-measurements.json).
The prior Phase 3C.2A report is retained. Polynomial evaluation counts gain the explicit
derivative-vertex check, and source digests identify the implementation. Node timings are CPU
observations, not browser or physical-GPU guarantees.

Integration exposed a second numerical defect: `((h % 360) + 360) % 360` can perturb an
already positive normalized double on a second invocation. Canonical blue therefore lost
its exact source-edge identity when fed back through a positive-valued UI control. Revision
`hue-section-projective-v2` adds 360 only to negative remainders, preserving already normalized
values exactly. A regression passes the canonical result hue back into the generator and
requires identical positions and contact indices. The full qualification is rerun for this
revision; no near-hue snapping is introduced.

Reproduce after building packages:

```powershell
pnpm --filter @gamut-plane/render exec vitest run test/huePolynomial.test.ts test/spatialHueSection.test.ts
node packages/render/scripts/qualifyHueSection.ts > docs/phase-3c2b-hue-measurements.json
```

Checkpoint A validation: 18 focused tests passed; the complete scientific qualification passed
for 3,439 generated hues per gamut, with no membership disputes in the added sample set.

The final v2 report contains 81,865 sRGB samples (75,098 unambiguous; 6,767 boundary/tolerance)
and 82,075 P3 samples (75,296 unambiguous; 6,779 boundary/tolerance). There are zero disputes.
Near-black samples mostly belong to the separate tolerance category; this is not proof that
core's finite tolerance can distinguish arbitrarily tiny sectors near black.

## Checkpoint B: one color, two independent inspection intentions

The compact instrument still owns the sole `ColorValue`. The host observes OKLab for the marker
and observes OKLCH through `represent` for meaningful hue. It never reconstructs a color from
these coordinates. Alpha, defining representation, missing/powerless hue and extended channels
therefore remain properties of the original value. Coordinates selection remains a user choice;
the contextual note points to OKLCH without changing that choice automatically.

`sectionType` selects lightness or hue. Each retains its own follow/inspect intention and
inspection value. `HueSelection` additionally retains a viewing direction, never an authored
coordinate. A followed chromatic color supplies hue; zero chroma or missing hue retains the
last direction. Without a prior direction the explicitly disclosed initial view is 0 degrees.
Independent inspection updates the retained direction and does not follow subsequent color edits.
Returning to Follow uses the meaningful accepted hue, or the retained direction if unavailable.

Hue number entry preserves the finite double, including scientific fixtures. The range is a
coarse pointer control; arrow keys in either hue control wrap cyclically, with Shift for 10-degree
steps. Rounded captions are display formatting only, never generator inputs or cache keys.

The existing bounded cache mechanics and latest-wins scheduler are shared. The scene receives
a discriminated lightness/hue result and does no scientific computation. Exact requested values
key a 24-entry LRU for each section type. A single watcher batches the current section request
and accepted marker. Computation registers its frame callback before rendering, avoiding a
one-frame uncut-body flash observed during the first recording. Pending clears current contours;
revision fencing prevents an older asynchronous result from being delivered. Current generation
is synchronous, so a successful current result is ready before that frame draws.

L/C edits at unchanged OKLCH hue move only the marker. Camera, Shape/Color, surface focus and
recovery do not regenerate sections. No coordinate rounding is used to force cache hits.
Changing an authored representation can produce a genuinely different observed double and
therefore a different cache key; merely changing the instrument's displayed representation does
not change the authored color or that observation.

## Geometry and presentation contract

The renderer consumes `generateHueSection` Float64 positions, loops, arcs and contacts. It
creates separate Float32 GPU attributes; GPU results never feed core membership. Each area
loop is triangulated independently as a fan about its existing shared black vertex. This is
justified by the homogeneous radial construction's star-shaped sectors. Cap chords remain
sampled approximations. Contacts are excluded from every triangle and never become area.

The existing inverse-RGB fragment mask is an additional GPU guard, using core-owned matrices;
it cannot bridge a gap because there are no triangles there. Shape uses a neutral unlit cap;
the volume retains its existing directional lighting. Color uses the existing unlit encoded-sRGB
shader without tone mapping. Attachment saturation is a qualified preview, not implicit color
mapping or a claim of physical P3 reproduction.

Line identities remain solid mint sRGB and dashed amber P3. The neutral-domain edge uses a
thin gray dotted line. Isolated contact rays use wider colored dots with casing and no fill.
The generator's 4,096-vertex host budget plus bounded loop closures fits the line allocation.
Unavailable geometry clears the affected gamut's contour and contact lines; the focused fill
is hidden if that gamut fails. A successful comparison gamut may remain visible and is named
separately in the summary. For example, canonical sRGB blue can qualify while P3 at that same
direction is conservatively unavailable. No successful neighbor replaces the requested hue.

Pixel qualification samples the actual aligned Shape framebuffer for sRGB and P3 at 30, 180
and 264.1 degrees and compares it with core analysis. Six CSS pixels around either scientific
contour are excluded because those pixels represent strokes, casing and antialiasing rather
than fill. The first test attempt hit a mint contour pixel and incorrectly treated it as fill;
the independent contour-distance exclusion fixes the measurement, not the renderer.
The complete sample coordinates, expected membership and read pixels are retained with evidence.

## Camera, cut and marker relationship

For `world=(a,L,b)`, the orthonormal frame is `eC=(cos h,0,sin h)`, `eL=(0,1,0)` and
`n=(-sin h,0,cos h)`. View section places the camera along positive `n`, with world Y up.
Projection tests cover opposite and oblique hues: C increases right, L up, equal units.
Its fixed comparison box is C=0..0.45 and L=0..1. Fit section is an explicit fit to visible
section positions; Fit visible includes the whole visible gamut and selected marker.

Hue edits do not move or refit the camera. They release the section-only composition so the
rotation is visible against the volume; View section deliberately realigns. This prioritizes
spatial context and user-owned orbit over an automatically following camera. Switching types
also leaves the camera in place and preserves both inspection selections. The app does not
maintain two competing saved camera rigs.

Cut intent is a persistent sign. The shape plane, Color shader, removed-volume ghost and
occlusion probe all use the active world normal and plane offset, not a reused horizontal
plane. View section explicitly removes the camera-side half; orbit across either hemisphere
never swaps it. Flip cut is explicit. Cut controls remain unavailable in section-only/recovery
presentations, where no volume is drawn.

The marker stays at the accepted `(a,L,b)`. The relationship reports both signed normal
displacement and radial projection, distinguishing an opposite radial half-plane even when
plane displacement is zero. A secondary dashed guide goes to the closest point on the viewed
half-plane, without an endpoint marker. It never replaces, clamps or maps the selected point.
Existing visibility/occlusion messages and Show selected / Restore surface preserve independent
inspection. Out-of-gamut selections remain at their true coordinates.

## Composition, accessibility and lifecycle

The existing scene/editor layout is retained. Section type replaces the old section heading
with a small semantic radio group beneath the scene; hue inspection replaces lightness-specific
controls. Numeric hue occupies the existing value position rather than an extra toolbar row.
The scene, active section and actual instrument lead; detailed numerical facts remain a native
disclosure. At 320/390px, document scrolling preserves usable scale. Laptop and enlarged-text
journeys check overflow and automated accessibility; these are not physical-device certification.

VueUse already owns event listeners, resize and document visibility. Those existing primitives
remain in place; the repository's revision-fenced scheduler retains accepted-state semantics.
No new dependency or composable layer was needed. Resources are allocated only by the mounted
scene, remain bounded through hue scrubbing, survive WebGL context restoration with matching
pixels and are disposed with zero remaining geometries/programs/listeners in the harness.
Idle scenes stop requesting frames. The unchanged SSR/import boundaries remain regression gates.

## Evidence and remaining limits

Committed browser evidence:

- [Starting laptop workspace](evidence/phase-3c2b/before-1366.png).
- Same-color transition: [horizontal inspection](evidence/phase-3c2b/00-horizontal.png) to
  [vertical hue](evidence/phase-3c2b/01-vertical.png), with unchanged camera and authored definition.
- [L/C alignment](evidence/phase-3c2b/04-aligned.png), [P3 Color preview](evidence/phase-3c2b/p3-color.png),
  [two sectors](evidence/phase-3c2b/multi-sector.png), [isolated blue contact](evidence/phase-3c2b/blue-contact.png),
  [unavailable hue](evidence/phase-3c2b/unavailable.png) and [marker recovery](evidence/phase-3c2b/07-recovery.png).
- [Laptop](evidence/phase-3c2b/workspace-1366-100.png), [390px](evidence/phase-3c2b/workspace-390-100.png),
  [320px](evidence/phase-3c2b/workspace-320-100.png) and [enlarged text](evidence/phase-3c2b/workspace-1000-200.png).
- [Interaction recording](evidence/phase-3c2b/interaction.webm), [12 checkpoints](evidence/phase-3c2b/checkpoints.json)
  and [132 actual fill-pixel samples](evidence/phase-3c2b/fill-pixels.json).

The final recording contains 131 decoded frames at 25 fps over 5.24 seconds. Every frame was
reviewed chronologically in five contact sheets under `.artifacts/phase3c2b/final-review-*`.
It includes initial navigation/loading frames and ordinary scrolling to controls, then the
horizontal/vertical switch, actual OKLCH edits, explicit alignment, stationary-camera hue
rotation, opposite inspection, recovery, section switching and neutral/chromatic transitions.
There is no animation claim. Full-page screenshots are deliberately excluded from the recorded
journey because they temporarily resize the browser viewport. The first recording revealed
that capture artifact and the host frame-order issue; both were corrected before this recording.

In the four captured cold hue requests, computing **both gamuts** took 2.0, 2.1, 1.1 and 0.5 ms.
These are individual Chromium CPU observations, not a latency percentile or GPU frame budget.
Marker-only L/C edits and alignment leave the hue build counter at four; later hue changes
raise it to eight. Recovery, switching back to cached inspection and neutral/chromatic changes
at the retained hue add no builds. A same-turn burst of five inspection inputs computes once.
The browser test also observes rendered frames and rejects an intermediate missing-cap frame
for an ordinary successful hue update. Independent unavailable geometry remains explicitly allowed.

Reproduction after package builds (do not edit source or rebuild packages during Vite journeys):

```powershell
$env:SPATIAL_HUE_EVIDENCE = "$PWD/.artifacts/phase3c2b/after"
pnpm --filter @gamut-plane/web exec playwright test e2e/spatialHue.spec.ts
```

The first local six-journey run passed after correcting the video-save lifecycle, the genuine
normalization defect and the fill test's stroke sampling. A later 41-test spatial run had 40
passes and one accessibility analysis interrupted by a Vite navigation after a source-comment
edit during the run. That run is not described as a clean aggregate pass. With source unchanged,
the full browser suite subsequently passed all 225 tests; the affected accessibility journey
also passed two additional repetitions. No context-menu timing failure occurred in that run.

Local validation records are retained under `.artifacts/phase3c2b/`:

- `verify:prepush` passed formatting, lint, builds, typechecks, all 1,309 unit tests and the
  production lazy-import gate on the preceding integration tree. After the final host frame-order
  and line-capacity corrections, the nearest 97 web unit tests, web typecheck, final production
  build and build checks passed again. The final source then passed all 225 browser tests.
- All three served-production tests passed, including the lazy spatial route.
- Core no-DOM declarations and packed domain checks passed; packed consumer checks also passed
  the core/render internal inventories, root exclusion, no-DOM declarations and Node imports.
- Packed Vue passed four browser tests and packed React/Vite passed eight. Nuxt passed its
  development and production hydration suites (eight each) and static-export suite (six passed,
  two established skips). Next passed development and production hydration (eight each) and
  the ten-test root Strict Mode suite.

Exact-final-commit GitHub Actions results, including the complete final-tree gates, are reported
at delivery rather than inferred from these local checkpoints.

Local source/measurement evidence is numerical and sampled, not exact arithmetic or continuous
topological certification for every binary64 input. Conservative unavailable directions remain
near unresolved roots. The rendered fill is an approximation of the qualified sectors, not
exact gamut membership. The thin second blue sector can be subpixel at comparison scale;
the renderer does not enlarge it or fabricate area to make it more visible. Fit/zoom is explicit.

Browser evidence uses Windows Chromium with ANGLE SwiftShader. It establishes tested rendering,
state and lifecycle behavior, not hardware-GPU performance, thermal behavior, Safari/Firefox
WebGL behavior, or physical wide-gamut output. CPU timings include warm/cold calls and runtime
noise. The selected color's scientific membership remains exclusively in core.

Recommended follow-up: a bounded physical-GPU and cross-browser qualification of the linked
instrument, including high-zoom narrow-sector readability and sustained pointer interaction.
Do not add another editor or automatic color mapping as part of that qualification.
