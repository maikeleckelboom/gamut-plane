# @gamut-plane/ui

Private shared authority for the current instrument's semantic anatomy and state vocabulary,
current representation/editor/companion metadata, sole authored stylesheet, warning glyph geometry, and framework-neutral native range,
numeric draft/composition, and plane pointer gesture policies. The controllers attach native
DOM listeners only when an adapter mounts them.

UI does not own `ColorValue` or other domain truth, gamut analysis, Canvas rendering/resources,
Vue or React components, framework lifecycle, or a public consumer API. Core, render, and the
adapters retain those responsibilities. Consumers import an adapter and its `./style.css` export;
each adapter copies the built bytes of UI's `src/style.css` to its own `dist/style.css` during build.

`src/instrumentMetadata.ts` is private implementation authority exported through UI's root for
sibling adapters. Four representation labels coexist with explicit two-view primary admission:
OKLCH → `oklch-lc`, then OKLab → `oklab-ab`. Frozen companion tuples describe ordinary labels,
slider spans, numeric completion bounds, steps, precision and semantic channel/operation bindings.
They describe structural composition, not whether an operation is usable for a particular color.
There is no operation executor, generalized selection state or new consumer API.

Metadata imports only types from `@gamut-plane/core/internal/capabilities`; emitted JavaScript
has no core or render import. Core is an ordinary package dependency because emitted declarations
reference its internal identity/relationship types. Packed checks inspect both surfaces and
type-check the installed graph with `skipLibCheck: false` in Vue, React, Nuxt and Next consumers.
The UI runtime still performs no conversion, geometry, gamut analysis or scientific operation.
