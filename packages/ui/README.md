# @gamut-plane/ui

Private shared authority for instrument anatomy, product labels, representation/editor metadata, request-state policy, the sole authored instrument stylesheet, and native range, numeric, and plane gesture controllers. The adapters render native framework markup and mount the controllers. UI does not own `ColorValue` science, Canvas, framework lifecycle, or a public consumer API.

`instrumentState.ts` validates an atomic selection, checked-gamut set, and visible-guide set. The policy separates technical editor existence, product admission, and preferred initialization. It accepts zero, one, or two admitted editors per representation; `editorId: null` is always deliberate inspection. The current product admits one editor each for OKLCH and OKLab, and none for sRGB or Display P3. An unadmitted technical editor cannot enter public state. Canonical ID arrays are frozen and deterministic. The guide ID family is supplied by render at adapter composition, so UI has no render dependency.

`instrumentMetadata.ts` owns current representation labels and ordered companion controls, including their semantic channel and core authoring operation bindings. `generalizedInstrument.ts` owns shared product copy, inspection number formatting, and explicit sRGB then Display P3 exact-result display order. Transport order can differ from display order. These policies do not execute color operations.

`src/style.css` is the only authored instrument stylesheet. Vue and React copy its built bytes into their own `dist/style.css`. Selectors are scoped to `[data-gp-root]`, and `--gamut-plane-accent` is the supported host customization. Consumers import their adapter's stylesheet. Native interaction controllers attach listeners only on mount and dispose queued work without publishing extra callbacks.

Emitted declarations reference core's internal capability types, but UI runtime performs no color conversion, geometry, gamut analysis, or rendering. Packed Vue, React, Nuxt, and Next fixtures type-check the installed package graph.
