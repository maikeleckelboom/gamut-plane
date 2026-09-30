# Product capability model

This document describes the current generalized instrument contract. [ADR 0003](decisions/0003-vnext-product-capability-model.md) records the original decision. Earlier phase-by-phase design notes remain in Git history; current implementation boundaries are summarized in [Architecture](architecture.md).

## Independent capability families

| Family         | Current meaning                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| Representation | A coordinate space in which the authored color can be observed: OKLCH, OKLab, sRGB, Display P3.                     |
| Editor         | A product-admitted way to author in a representation, or `null` for inspection.                                     |
| Geometry       | An editor's X, Y, fixed channel, domain, projection, constraints, and keyboard behavior, with its own `GeometryId`. |
| Operation      | The selected editor's point authoring or a companion control's declared channel operation.                          |
| Gamut check    | Exact analysis of the original authored color for sRGB or Display P3.                                               |
| Guide          | Requested sampled contour/interval reference geometry, independently available by form.                             |
| Output         | Explicit host serialization or mapping workflow, outside instrument state.                                          |

The public state is `{ selection: { representationId, editorId }, checkedGamuts, visibleGuides, referenceGamutId }`. Arrays of IDs are validated, deduplicated, sorted, and frozen. An invalid dimension rejects the entire request. A controlled request is a proposal until accepted by the parent; local state accepts its own requests. Authored color is a separate controlled value and is not republished when only state changes.

## Admission and cardinality

Technical editor existence, product admission, and preferred initialization are separate facts. `knownEditors` establishes technical identity. `admittedEditors` controls what the public product may select. `preferredEditors` supplies a default only if that editor is admitted. `requestEditor` validates an explicit choice without replacing it with the preferred one. `editorId: null` remains valid inspection even when editors exist.

The policy handles zero, one, and multiple admitted editors for a representation. The shipped product currently admits exactly one OKLCH editor (`oklch-lc`) and one OKLab editor (`oklab-ab`); sRGB and Display P3 admit none. The compact UI offers Edit color only where an editor is admitted, shows inspection directly otherwise, and has room for an Area choice if a real second editor ships. A test-only alternate OKLCH H/C editor with fixed Lightness exercises the multiple-editor architecture without changing the public catalog or interface.

## Geometry and authorship

Geometry identity is independent of representation identity. The OKLCH lightness/chroma rectangle uses X Chroma, Y Lightness, fixed Hue. The OKLab disc uses X a, Y b, fixed Lightness. The test-only H/C rectangle uses X Hue, Y Chroma, fixed Lightness in the same OKLCH representation as the shipped editor. Projections carry `geometryId`, representation, channel bindings, point, and coordinates; field/resource caches key by geometry. Pointer and keyboard actions use the selected editor's geometry and operation. Companion controls declare operation IDs in UI metadata and call the matching core author function.

This separation permits another editor for a known representation without pretending that the representation has only one plane. It does not imply that every technical geometry is a product choice or that all future geometries are rectangular.

## Independent Status, Boundary and Reference

Any of zero, one, or both exact checks may be requested. The local product default requests both visual boundaries and both exact statuses, with sRGB as Reference. The accepted revision analyzes the original `ColorValue` only for requested check IDs. A failed result is unavailable, not outside. The state transport order is canonical ID order; the UI intentionally displays sRGB then Display P3. Guides use sampled data and may have independent contour, interval, and reference availability. An unavailable guide remains requested; inspection can show that the guide will appear with an editor. No guide requests a hidden exact analysis, and no check implies a guide.

Reference is semantic focus on one product-admitted gamut (`srgb-gamut`, `display-p3-gamut`) or null. UI owns this explicit admission policy; technically known future gamuts are not automatically admitted. Render owns the explicit gamut-to-primary-guide policy. Reference requests neither exact analysis nor guide sampling: only a matching requested guide's available sampled Reference can produce a connector/swatch, and only if its endpoint projects truthfully into an available editor field. Projection failure is represented independently from the retained sampled fact, without clamping or fallback. Reference remains valid in inspection-only or spatially unavailable states.

The connector and sampled boundary marker annotate an exact out-of-gamut excursion. They require a selected Reference, its explicitly requested Status with an accepted exact `outside` result, its explicitly mapped requested Boundary with an available sampled Reference, and a truthful projection into the active editor geometry. Inside, within-tolerance, unavailable and unchecked statuses show neither annotation. Exact analysis determines applicability; sampled guide data supplies the approximate endpoint. Ordinary requested boundaries and slider intervals remain independent of Status, and Reference selection persists. `PickerGuide.deltaC` records sampled outward excursion; it is neither a membership/visibility criterion nor a general distance-to-boundary metric. Warnings consume only accepted exact `outside` for the explicitly checked Reference gamut. They ignore sampled delta, intervals and contour geometry. Reference changes preserve authored ColorValue, alpha, defining/provenance semantics, editor context, numeric drafts, active gestures and hue edit reference. The Coordinates selector performs no hidden analysis. See [Reference focus](architecture.md#reference-focus) for implementation owners and failure behavior.

The standalone app's CSS/Hex output uses explicit serialization policies and reports unavailable values separately. Mapping is explicit in core. Neither output destination nor mapping belongs to the instrument state.

## Current boundary

The public two-view props and boundary-target product state are retired. The existing two editors retain their authored behavior and geometry. The current product is a compact vertical instrument with a Coordinates context, square editing field, direct channel controls, concise authorship context, inspection coordinates where no editor is selected, and a Gamuts popup. The standalone host adds CSS output and Canvas capability. No new representation, product editor, registry, framework, or mapping workflow is shipped here.
