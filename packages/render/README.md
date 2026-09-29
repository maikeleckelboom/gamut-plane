# @gamut-plane/render

Private framework-neutral rendering support for the Vue and React instruments. It owns Canvas field painting, sampled gamut-guide tables, contour and interval geometry, and deterministic CSS/SVG presentation. Core owns color science; UI owns product copy and request policy; adapters own lifecycle, measurement, scheduling, and DOM. Applications import an adapter and its stylesheet rather than this package directly.

The sampled tables are approximate visual guides. They never determine exact gamut status or reauthor color. `pnpm --filter @gamut-plane/render check:gamut-tables` verifies the checked-in tables and digest. A hue-less observation remains null while visual sampling may use a zero-Hue slice.

The unsupported `@gamut-plane/render/internal/capabilities` entry resolves editor visual support, selected fields, and requested guide forms independently. A missing field relation, failed conversion, out-of-domain marker, and unsupported guide form retain distinct outcomes. Requested guide resolution is independent of exact checks and performs no hidden analysis.

The unsupported `@gamut-plane/render/internal/current` entry contains bounded current-product integration: `currentField`, `currentOklchObservation`, `currentEditableDetail`, `generalizedGuideDisplay`, `generalizedEditableDetail`, and `referenceDisplay`, plus `planeWarningOffset` and `rangeWarningStyle` for shared annotation placement. These consume accepted owner-native facts and produce CSS, gradients, marker placement, and displayable guide geometry. They do not own public selection, target state, copy, or a second exact analysis. The `current` name describes the two concrete shipped editors, not a second public instrument route.

Field and renderer cache keys include geometry identity so a second editor of the same representation cannot reuse the wrong projection or field. The test-only H/C editor verifies this without entering the production catalog. Renderer resources remain instance-local, allocated after mount, and import safely in Node. Packed consumer checks verify the private exports and declarations.

`referenceGuidePolicy` in `capabilities/guideSupport.ts` explicitly maps each supported Reference gamut to its primary spatial guide. `referenceDisplay` consumes only requested sampled Reference forms, keeps their facts when spatial projection is unavailable, and never clamps an endpoint or falls back to another gamut. Product Reference admission remains in UI.
