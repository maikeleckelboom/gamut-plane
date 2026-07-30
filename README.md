# Gamut Plane

Gamut Plane is a standalone technical instrument for inspecting and editing a color across two perceptual coordinate planes. It keeps one canonical OKLCH color while presenting exact Display P3 and sRGB membership alongside interpolated boundary guides.

## Capabilities

- Edit lightness and chroma at a fixed OKLCH hue.
- Edit OKLab `a` and `b` at a fixed OKLab lightness.
- Inspect exact Display P3 and sRGB membership for the active color.
- Compare Display P3 and sRGB boundary contours without clamping the active color.
- Inspect the nearest sRGB boundary projection as a separate guide.
- Copy CSS Color 4 output only when the active color is inside the requested gamut.
- Operate both planes with pointer or keyboard input.
- Render at the browser's actual device pixel ratio and adapt to element resizing.

The instrument deliberately separates three ideas that color tools often collapse: the authored color, the editable plane's geometric domain, and an RGB display gamut. Crossing a gamut boundary does not mutate the color, and the circular OKLab editing domain is not an RGB gamut.

## Quick start

Requirements:

- Node.js 24 or newer
- pnpm 11.9.0

```powershell
pnpm install
pnpm dev
```

The development server prints its local URL. The app has no backend, account, persistence, or network dependency after installation.

## Commands

```powershell
pnpm build               # typecheck and build every package that has a build
pnpm typecheck           # check the core package, app, tests, and scripts
pnpm test                # verify generated tables and run all unit/component tests
pnpm test:e2e            # run browser behavior and screenshot tests
pnpm lint                # run Oxlint in every package
pnpm format:check        # verify Oxfmt formatting
pnpm check:gamut-tables  # prove the checked-in tables match the generator
```

To regenerate the deterministic boundary tables after an intentional algorithm or setting change:

```powershell
pnpm --filter @gamut-plane/web generate:gamut-tables
```

## Repository structure

- `packages/core` — framework-independent color types, conversion, gamut math, parsing, serialization, picker-plane contracts, and boundary analysis.
- `apps/web` — the Vue/Vite instrument, Canvas 2D renderer, controls, generated visualization tables, and browser tests.
- `docs` — architecture, provenance, performance constraints, and accepted decisions.

`@gamut-plane/core` has a deliberately narrow barrel. The web app imports reusable math and domain contracts from it; the core package does not import Vue, browser APIs, app state, or generated web assets.

## Browser and color assumptions

The app requires a modern browser with Canvas 2D, Pointer Events, SVG, and CSS Color 4 parsing/rendering. It requests a Display P3 Canvas 2D context and reports whether the browser grants Display P3, falls back to sRGB, or makes Canvas unavailable. That capability affects painted preview colors only; exact gamut facts still come from the core color math.

Boundary contours are deterministic interpolations over checked-in numeric tables. They are visualization guides, not exact membership tests. Copy actions never emit a clipped or silently substituted color.

## Project status

This is the first standalone baseline. Its scope is intentionally narrow: two coordinate planes, two RGB gamut boundaries, exact membership facts, and deterministic Canvas 2D visualization. There is no WebGL/WebGPU renderer, worker protocol, persistence, plugin architecture, published package contract, or automatic gamut-mapping policy.

See [Architecture](docs/architecture.md), [Performance](docs/performance.md), and [Provenance](docs/provenance.md) for the maintained engineering contracts.

## License

Copyright © 2026 Maikel Eckelboom. Released under the [MIT License](LICENSE). Retained third-party software is documented in [Third-Party Notices](THIRD_PARTY_NOTICES.md).
