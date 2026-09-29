# @gamut-plane/render

Private internal dependency providing framework-neutral rendering primitives and visual guide data shared by the Vue and React adapters. It owns Canvas field painting, sampled gamut-guide data, generated gamut tables and deterministic SVG/CSS presentation geometry. It does not own color semantics, interaction state, scheduling or framework lifecycle. Applications import an adapter and its stylesheet; no direct import or manual initialization of this package is required.

The renderer has instance-local resources and synchronous drawing. Adapters allocate it during committed lifecycle setup and own measurements, observers, frame scheduling and disposal. Production adapters consume resolved exact, field and guide facts through the internal current-product helpers below. `createPickerPresentation` and `getBoundaryPresentation` remain independent legacy reference implementations and equivalence oracles; production adapters no longer call them. A hue-less observation stays `null` while the numeric field hue falls back to `0` only for visual sampling. Shared helpers place warnings, merge intervals and thresholds, and serialize target-guide connectors. The OKLab fixed-lightness gradient varies observed `[L, a, b]` numerically before CSS serialization, with CSS-only stop precision stabilized for SSR. Field sampling uses one mutable numeric color and reusable scratch, without `ColorValue` allocation. This package imports safely in Node; calling its browser renderer requires a mounted Canvas. Core remains free of DOM and framework dependencies.

The checked-in tables retain their sampling settings and digest. They are approximate visualization guides, not exact gamut tests. Run `pnpm --filter @gamut-plane/render check:gamut-tables` to verify them. This package and its dependencies remain unpublished; consumers of adapter tarballs must install its artifact too.

`@gamut-plane/render/internal/capabilities` is an unsupported sibling-adapter contract. It exports
only `guideDefinitions`, `resolveEditorVisualSupport`, `resolveField`, `resolveRequestedGuides`
and their directly needed `GuideId`, `EditorVisualSupport`, `FieldResolution`, `GuideResolution`
types. It is deterministic and DOM-free; field support and guide support remain independent.
Adapters compose one accepted source/state revision and must supply its freshly derived exact
rows to guide resolution. Raw check rows carry no independent provenance. This entry adds no
consumer API, mutable registry or Canvas readiness state; root exports remain unchanged.

`@gamut-plane/render/internal/current` is also unsupported sibling-package integration. Its exact
runtime inventory is `currentField`, `currentExactChecks`, `currentOklchObservation`,
`currentEditableDetail`, `currentGuideDisplay`, and `legacyTargetCompatibility`; its two directly
consumed types are `CurrentField` and `CurrentGuideDisplay`. It accepts owner-native facts, never
UI state or `AcceptedPresentationView`. These small families preserve current fail-fast errors,
serialize the accepted contour buffers without copying, and produce only consumed visual detail.
OKLab needs one supplemental OKLCH observation for CSS/Hue/target detail; a hidden target needs
one sampled reference but no ordinary guide request, contour, interval or exact check. No helper
is used in a field-sampling loop. Packed consumer checks certify the export inventory, root
exclusion, ES-only declarations and Node execution from each installed consumer graph.
