# @gamut-plane/rendering

Private internal dependency of the Vue and React adapters. It owns the shared Canvas field renderer, generated gamut tables and SVG/CSS geometry serialization. Applications import an adapter and its stylesheet; no manual rendering initialization is required.

The renderer has instance-local resources and synchronous drawing. Adapters allocate it during committed lifecycle setup and own measurements, observers, frame scheduling and disposal. This package imports safely in Node; calling its browser renderer requires a mounted Canvas. Core remains free of DOM and framework dependencies.

The checked-in tables retain their sampling settings and digest. They are approximate visualization guides, not exact gamut tests. Run `pnpm --filter @gamut-plane/rendering check:gamut-tables` to verify them. This package and its dependencies remain unpublished; consumers of adapter tarballs must install its artifact too.
