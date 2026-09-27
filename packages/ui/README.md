# @gamut-plane/ui

Private shared authority for the current instrument's semantic anatomy and state vocabulary,
sole authored stylesheet, warning glyph geometry, and framework-neutral native range,
numeric draft/composition, and plane pointer gesture policies. The controllers attach native
DOM listeners only when an adapter mounts them.

UI does not own `ColorValue` or other domain truth, gamut analysis, Canvas rendering/resources,
Vue or React components, framework lifecycle, or a public consumer API. Core, render, and the
adapters retain those responsibilities. Consumers import an adapter and its `./style.css` export;
each adapter copies the built bytes of UI's `src/style.css` to its own `dist/style.css` during build.
