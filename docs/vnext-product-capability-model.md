# Product capability model

This document describes the current generalized instrument contract. [ADR 0003](decisions/0003-vnext-product-capability-model.md) records the original decision. Earlier phase-by-phase design notes remain in Git history; current implementation boundaries are summarized in [Architecture](architecture.md).

## Independent capability families

| Family         | Current meaning                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Representation | A coordinate space in which the authored color can be observed: OKLCH, OKLab, sRGB, Display P3.                     |
| Editor         | A technical authoring context; public selection admits an explicit subset, or `null` for inspection.                |
| Geometry       | An editor's X, Y, fixed channel, domain, projection, constraints, and keyboard behavior, with its own `GeometryId`. |
| Operation      | The selected editor's point authoring or a companion control's declared channel operation.                          |
| Gamut check    | Exact analysis of the original authored color for sRGB or Display P3.                                               |
| Guide          | Requested sampled contour/interval reference geometry, independently available by form.                             |
| Output         | Explicit host serialization or mapping workflow, outside instrument state.                                          |

The public state is `{ selection: { representationId, editorId }, checkedGamuts, visibleGuides, referenceGamutId }`. Arrays of IDs are validated, deduplicated, sorted, and frozen. An invalid dimension rejects the entire request. A controlled request is a proposal until accepted by the parent; local state accepts its own requests. Authored color is a separate controlled value and is not republished when only state changes.

## Admission and cardinality

Technical editor existence, product admission, and preferred initialization are separate facts. `knownEditors` establishes technical identity. `admittedEditors` controls what the public product may select. `preferredEditors` supplies a default only if that editor is admitted. `requestEditor` validates an explicit choice without replacing it with the preferred one. `editorId: null` remains valid inspection even when editors exist.

The policy handles zero, one, and multiple admitted editors for a representation. The shipped product admits exactly one OKLCH editor (`oklch-lc`), one OKLab editor (`oklab-ab`) and three each for sRGB and Display P3. All representations offer Edit / Inspect. Area appears while editing RGB, with concise R / G, R / B and G / B labels; open options identify fixed B, G and R respectively, and accessible descriptions identify all axes. Changing Coordinates chooses the destination's preferred admitted editor. Returning to Edit selects that preferred editor, with no remembered Area/editor behavior. Explicit admitted selections remain authoritative.

Phase 2N.0 defines three technical editors per RGB representation; 2N.1 explicitly admits all six and supplies preferred `srgb-rg` and `display-p3-rg` defaults. Admission is neither technical-catalog enumeration nor field-support detection. Known-editor runtime facts remain identity-only and unique, without core math or render imports in UI. Public state and explicit inspection remain unchanged; representation/editor mismatches, unknown identities and invalid dimensions still reject atomically.

## Geometry and authorship

Geometry identity is independent of representation identity. The OKLCH lightness/chroma rectangle uses X Chroma, Y Lightness, fixed Hue. The OKLab disc uses X a, Y b, fixed Lightness. The test-only H/C rectangle uses X Hue, Y Chroma, fixed Lightness in the same OKLCH representation as the shipped editor. Projections carry `geometryId`, representation, channel bindings, point, and coordinates; field/resource caches key by geometry. Pointer and keyboard actions use the selected editor's geometry and operation. Companion controls declare operation IDs in UI metadata and call the matching core author function.

This separation permits another editor for a known representation without pretending that the representation has only one plane. It does not imply that every technical geometry is a product choice or that all future geometries are rectangular.

## Native RGB contracts (Phase 2N.0)

Phase 2N.0 implements the following internal core bindings. Coordinates use the encoded RGB interpretation already declared by `representationDefinitions`, including the representation's primaries and transfer function.

| Editor          | Representation | Geometry                  | X              | Y              | Fixed          | Point operation       |
| --------------- | -------------- | ------------------------- | -------------- | -------------- | -------------- | --------------------- |
| `srgb-rg`       | `srgb`         | `srgb-rg-rectangle`       | `srgb.r`       | `srgb.g`       | `srgb.b`       | `srgb-rg-point`       |
| `srgb-rb`       | `srgb`         | `srgb-rb-rectangle`       | `srgb.r`       | `srgb.b`       | `srgb.g`       | `srgb-rb-point`       |
| `srgb-gb`       | `srgb`         | `srgb-gb-rectangle`       | `srgb.g`       | `srgb.b`       | `srgb.r`       | `srgb-gb-point`       |
| `display-p3-rg` | `display-p3`   | `display-p3-rg-rectangle` | `display-p3.r` | `display-p3.g` | `display-p3.b` | `display-p3-rg-point` |
| `display-p3-rb` | `display-p3`   | `display-p3-rb-rectangle` | `display-p3.r` | `display-p3.b` | `display-p3.g` | `display-p3-rb-point` |
| `display-p3-gb` | `display-p3`   | `display-p3-gb-rectangle` | `display-p3.g` | `display-p3.b` | `display-p3.r` | `display-p3-gb-point` |

X increases left to right; the Y channel increases bottom to top. Normalized screen coordinates are `{ x: X, y: 1 - Y }`. The nominal interaction domain is the closed `[0,1]²` square. Any finite fixed channel defines the actual slice, including values below zero or above one. Projection observes the selected RGB representation and retains its actual channels and alpha. Raw `toPoint` and `fromPoint` do not constrain coordinates. `contains` and downstream `markerInDomain` report nominal-domain membership independently. An out-of-domain point is a successful projection, distinct from a representation-conversion or numerical failure.

For `srgb-rg`, `[1.2, 0.4, -0.1]` projects to `{ x: 1.2, y: 0.6 }` at fixed B `-0.1`, outside the nominal square, without modifying its `ColorValue`. Editing at `{ x: 0.6, y: 0.3 }` authors `[0.6, 0.7, -0.1]` in sRGB. Point requests carry the selected geometry identity and use its distinct operation, never a representation-based preferred Area. Finite explicit interaction points are constrained before authoring only the two varying channels. The observed fixed channel and alpha remain exact, including signed zero. Normalized keyboard movement uses the existing fine/coarse steps (`0.005` / `0.02`), with Home/End selecting minimum/maximum X. Keyboard results are constrained interaction points; recovery from raw overflow happens only because of an explicit editing action. Projection, selection, initialization, focus and passive presentation never reauthor the color.

`srgb-channel-patch` and `display-p3-channel-patch` observe through `represent()` and patch R, G or B in the selected encoding. A single-channel edit preserves the other two observed coordinates and alpha; the established optional alpha mechanism allows a deliberate alpha change. Patches accept finite extended channel values without mapping, clamping or authored-coordinate rounding. They cannot copy a source representation's tuple and relabel it. Malformed requests, unsupported channels and missing data return `invalid-plane-edit`; invalid resulting coordinates/alpha retain `invalid-definition`; genuine conversion failures propagate `numerical-range`. Native RGB projection and authorship require no intermediate OKLCH observation. `ColorValue` remains the only authored authority, with exact defining equality.

### Authored marker and direct-control presentation (2N.1)

RGB authored markers use raw projected coordinates. Interaction previews use constrained interaction coordinates. Cancellation, rejected controlled edits, resize and reconciliation restore or use the raw authored projection. An extended authored point must not be displayed at a substituted edge position, and a Reference connector must originate at that raw point rather than a clamped substitute.

UI's shared `authoredMarkerPoint` policy covers both adapters' declarative and imperative paths, including initialization, reconciliation, resize, restoration, remount and React Strict Mode replay. Surface clipping may partly or wholly hide an extended RGB marker; an accessible explanation points to numeric editing. The accepted OKLab edge-marker and OKLCH policies remain unchanged. Exact Reference Outside warnings remain accessible independently of marker visibility or spatial Reference.

R/G/B controls retain stable Red, Green, Blue order across all Areas. Sliders use `[0,1]`; separate numeric bounds accept any finite extended coordinate. Step is 0.001 and display precision is 4, without passive rounding or authorship. Extended values keep their authored/numeric coordinate while the thumb rests at its nominal endpoint with an overflow description and no fictitious spatial warning. Out-of-range counterparts never disable independent RGB scalar editing. Native gradients hold both actual sibling channels fixed and use opaque CSS in the selected encoding. Operation-context reconciliation preserves drafts and gestures through comparison-only changes.

Native fields preserve the selected encoded interpretation at every sample, placing X and Y into their declared channels while retaining the actual finite fixed channel, including overflow. Sampling does not author or convert to OKLCH. The discriminated RGB editable detail uses the successful selected observation for field, marker color, control values and gradients; unrelated OKLCH or requested exact-analysis failure cannot disable native editing. Hue edit-reference bookkeeping is scoped to perceptual editors. Canvas capability reports the visible context actually granted by the browser; an sRGB context still edits Display P3 coordinates. Cache identity includes selected geometry/sampler, actual fixed coordinate, dimensions, DPR, grant and quality. No remembered Area state or public headless API is introduced.

RGB guide support is temporarily absent: requested Boundary preferences persist with the existing Paused explanation, and spatial Reference is unavailable. No contours, channel intervals, successful coverage or endpoints are fabricated. Once 2N.2 implements slices, full and empty coverage remain successful outcomes rather than Paused.

### RGB gamut slices and Reference (2N.2)

Coverage is relative to the nominal editor square at the actual fixed coordinate. Successful results distinguish full, partial and empty coverage. Full and empty remain successes; they are neither unsupported/failed resolution nor reasons for Paused. A nonempty point or line intersection is successful degenerate geometry. Coverage and visible contour geometry are independent facts. Preserve genuine gamut boundaries: clipping must not fabricate boundaries along editor edges. Empty geometry serializes to no path, never an invalid closed-path fragment. The current generic closed-path serializer appends `Z` even for an empty buffer; 2N.2 must handle successful empty geometry before enabling RGB guide presentation. Contours and channel intervals do not determine exact membership or request hidden analysis.

Reference preserves the existing sampled `PickerGuide` endpoint meaning. Do not invent a nearest-boundary endpoint in the active RGB slice. Convert the unchanged endpoint to the selected RGB representation. Spatial availability requires compatibility with the selected geometry's actual fixed channel, then truthful in-domain projection. A dedicated RGB slice-compatibility tolerance, expressed in encoded coordinate units, may accommodate numerical conversion error only. It must not reuse exact gamut-analysis, sampled `deltaC`, display-precision or pixel tolerances. Implement and numerically justify this tolerance in 2N.2; 2N.0 adds no unused runtime constant.

Never modify the endpoint's fixed channel or clamp its projected point to make it drawable. Preserve the sampled fact when spatial projection is unavailable. The explicitly requested exact Outside warning remains independent of slice/spatial availability. No placeholder slice solver, coverage declaration or Reference converter is introduced before it has a concrete implementation owner and use.

## Independent Status, Boundary and Reference

Any of zero, one, or both exact checks may be requested. The local product default requests both visual boundaries and both exact statuses, with sRGB as Reference. The accepted revision analyzes the original `ColorValue` only for requested check IDs. A failed result is unavailable, not outside. The state transport order is canonical ID order; the UI intentionally displays sRGB then Display P3. Guides use sampled data and may have independent contour, interval, and reference availability. An unavailable guide remains requested; inspection can show that the guide will appear with an editor. No guide requests a hidden exact analysis, and no check implies a guide.

Reference is semantic focus on one product-admitted gamut (`srgb-gamut`, `display-p3-gamut`) or null. UI owns this explicit admission policy; technically known future gamuts are not automatically admitted. Render owns the explicit gamut-to-primary-guide policy. Reference requests neither exact analysis nor guide sampling: only a matching requested guide's available sampled Reference can produce a connector/swatch, and only if its endpoint projects truthfully into an available editor field. Projection failure is represented independently from the retained sampled fact, without clamping or fallback. Reference remains valid in inspection-only or spatially unavailable states.

The connector and sampled boundary marker annotate an exact out-of-gamut excursion. They require a selected Reference, its explicitly requested Status with an accepted exact `outside` result, its explicitly mapped requested Boundary with an available sampled Reference, and a truthful projection into the active editor geometry. Inside, within-tolerance, unavailable and unchecked statuses show neither annotation. Exact analysis determines applicability; sampled guide data supplies the approximate endpoint. Ordinary requested boundaries and slider intervals remain independent of Status, and Reference selection persists. `PickerGuide.deltaC` records sampled outward excursion; it is neither a membership/visibility criterion nor a general distance-to-boundary metric. Warnings consume only accepted exact `outside` for the explicitly checked Reference gamut. They ignore sampled delta, intervals and contour geometry. Reference changes preserve authored ColorValue, alpha, defining/provenance semantics, editor context, numeric drafts, active gestures and hue edit reference. The Coordinates selector performs no hidden analysis. See [Reference focus](architecture.md#reference-focus) for implementation owners and failure behavior.

The standalone app's CSS/Hex output uses explicit serialization policies and reports unavailable values separately. Mapping is explicit in core. Neither output destination nor mapping belongs to the instrument state.

## Current boundary

The public two-view props and boundary-target product state are retired. The two perceptual editors retain their authored behavior and geometry; all six native RGB editors are ordinary product choices. The product remains a compact vertical instrument with Coordinates and Area context, square editing field, direct channel controls, concise authorship context, explicit inspection and a Gamuts popup. The standalone host adds CSS output and Canvas capability. No new representation, registry, framework, or mapping workflow is introduced.

| Phase | Status      | Scope                                                                                                                                                                     |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2N.0  | Implemented | Six technical RGB editors/geometries, native point/channel authorship, raw projection, constrained interaction and core/type invariants.                                  |
| 2N.1  | Implemented | Product admission, preferred Areas, Area UI, native fields, R/G/B controls and raw authored marker presentation in both adapters.                                         |
| 2N.2  | Deferred    | RGB gamut cross-sections, channel intervals, full/partial/empty/degenerate successful results and unchanged Reference endpoint conversion with justified slice tolerance. |
| 2N.3  | Deferred    | Integrated acceptance, documentation closeout and focused test-debt review.                                                                                               |
