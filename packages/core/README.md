# @gamut-plane/core

Framework-neutral OKLab/OKLCH conversion, sRGB and Display P3 membership, CSS serialization/parsing, and color-plane geometry. The package uses `@texel/color` and has no Vue, DOM, or Canvas dependency.

This package is private and **not published to npm**. Build it from the repository with `pnpm --filter @gamut-plane/core build`. ESM JavaScript and TypeScript declarations are written to `dist`; Node.js 24+ is the supported build and server runtime.

## Usage

Install a local tarball using the [repository instructions](https://github.com/maikeleckelboom/gamut-plane/blob/dev/README.md#install-local-packages). Core can be used without the Vue package:

```ts
import { isColorInGamut, serializeColor, type OklchColor } from "@gamut-plane/core";

const color: OklchColor = { l: 0.68, c: 0.18, h: 252, alpha: 1 };
const css = serializeColor(color, "oklch");
const insideSrgb = isColorInGamut(color, "srgb");
const p3Css = isColorInGamut(color, "display-p3") ? serializeColor(color, "display-p3") : null;
```

`OklchColor` uses finite lightness and alpha in 0–1, nonnegative finite chroma, and finite hue in degrees. RGB serialization throws for a color outside the requested gamut rather than clipping it. `formatOklch` provides rounded display text; `serializeColor` preserves serialization precision. `serializeHexColor` returns uppercase, quantized 8-bit sRGB (`#RRGGBB` or `#RRGGBBAA`) and throws outside sRGB.

## Math and guides

`isColorInGamut` converts directly to linear-light RGB using `GAMUT_EPSILON`. `getPickerBoundaryAnalysis` combines unchanged exact status for both gamuts with one explicit `DisplayGamut` target result: sampled guide chroma/color, guide delta, normalized position and an outside-only projection. Boundary-table lookups and contours are interpolated guides and should not replace exact membership. The plane helpers distinguish editable geometry from display gamuts and project views over a single OKLCH color.

See [Architecture](https://github.com/maikeleckelboom/gamut-plane/blob/dev/docs/architecture.md) for package boundaries and [Testing](https://github.com/maikeleckelboom/gamut-plane/blob/dev/docs/testing.md) for unit and packed-consumer checks.

[MIT License](LICENSE).
