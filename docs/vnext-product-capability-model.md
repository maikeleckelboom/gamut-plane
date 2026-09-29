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

The public state is `{ selection: { representationId, editorId }, checkedGamuts, visibleGuides }`. Arrays of IDs are validated, deduplicated, sorted, and frozen. An invalid dimension rejects the entire request. A controlled request is a proposal until accepted by the parent; local state accepts its own requests. Authored color is a separate controlled value and is not republished when only state changes.

## Admission and cardinality

Technical editor existence, product admission, and preferred initialization are separate facts. `knownEditors` establishes technical identity. `admittedEditors` controls what the public product may select. `preferredEditors` supplies a default only if that editor is admitted. `requestEditor` validates an explicit choice without replacing it with the preferred one. `editorId: null` remains valid inspection even when editors exist.

The policy handles zero, one, and multiple admitted editors for a representation. The shipped product currently admits exactly one OKLCH editor (`oklch-lc`) and one OKLab editor (`oklab-ab`); sRGB and Display P3 admit none. The Edit coordinates toggle reflects that current one-editor product. A test-only alternate OKLCH H/C editor with fixed Lightness exercises the multiple-editor architecture without changing the public catalog or interface.

## Geometry and authorship

Geometry identity is independent of representation identity. The OKLCH lightness/chroma rectangle uses X Chroma, Y Lightness, fixed Hue. The OKLab disc uses X a, Y b, fixed Lightness. The test-only H/C rectangle uses X Hue, Y Chroma, fixed Lightness in the same OKLCH representation as the shipped editor. Projections carry `geometryId`, representation, channel bindings, point, and coordinates; field/resource caches key by geometry. Pointer and keyboard actions use the selected editor's geometry and operation. Companion controls declare operation IDs in UI metadata and call the matching core author function.

This separation permits another editor for a known representation without pretending that the representation has only one plane. It does not imply that every technical geometry is a product choice or that all future geometries are rectangular.

## Independent checks and guides

Any of zero, one, or both exact checks may be requested. The accepted revision analyzes the original `ColorValue` only for those IDs. A failed result is unavailable, not outside. The state transport order is canonical ID order; the UI intentionally displays sRGB then Display P3. Guides use sampled data and may have independent contour, interval, and reference availability. An unavailable guide remains requested; inspection can show that the guide will appear with an editor. No guide requests a hidden exact analysis, and no check implies a guide.

The standalone app's CSS/Hex output uses explicit serialization policies and reports unavailable values separately. Mapping is explicit in core. Neither output destination nor mapping belongs to the instrument state.

## Current boundary

The migration retires the public two-view props and boundary-target product state. The existing two editors retain their authored behavior and geometry. No new representation, product editor, registry, framework, mapping workflow, or visual redesign is shipped here. The shared stylesheet and existing interface composition remain the current product surface.
