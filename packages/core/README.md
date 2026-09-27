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

## Defining color values

The parallel `ColorValue` domain supports defining coordinates in OKLCH, OKLab, sRGB, or Display P3. Construction copies and freezes the defining representation. Coordinates may be extended beyond display gamuts; alpha remains within 0–1. Observations never change the definition, and a real edit explicitly constructs a new value.

```ts
import {
  analyzeGamut,
  createColorValue,
  definitionOf,
  represent,
  restoreColor,
  snapshotColor,
} from "@gamut-plane/core";

const created = createColorValue({
  space: "display-p3",
  channels: [1, 0.4, 0],
  alpha: 0.372913,
});

if (created.ok) {
  const color = created.value;
  const defining = definitionOf(color);
  const observed = represent(color, "oklch");
  const membership = analyzeGamut(color, "srgb-gamut");
  const restored = restoreColor(JSON.parse(JSON.stringify(snapshotColor(color))));
}
```

`mapToGamut(color, target, "oklch-chroma-reduction-v1")` is an explicit fixed-lightness/hue operation. `parseCssValue` accepts a limited numeric CSS literal profile and returns source text separately from the value. `serializeCss` consumes a representation with either a raw-coordinate or strict-gamut policy; `serializeHex` consumes an sRGB representation and explicitly quantizes to 8-bit channels. Use snapshots, rather than the runtime value, for JSON or SSR transport. General `OklchColor` conversion and serialization functions remain available independently of picker authorship.

## Plane editing

`projectColorToPlane(value, "oklch" | "oklab")` returns an observed representation and an unclamped point. It leaves the defining ColorValue untouched. `authorPlaneEdit` creates a new ColorValue in the named plane. Channel edits keep unedited observed coordinates; point edits constrain only to the picker instrument (a rectangle for OKLCH, a disc for OKLab). Neither operation maps to a display gamut. Alpha is copied exactly unless the edit supplies `alpha`.

```ts
const created = createColorValue({ space: "srgb", channels: [1, 0, 0], alpha: 1 });
if (created.ok) {
  const projected = projectColorToPlane(created.value, "oklab");
  if (projected.ok) {
    const result = authorPlaneEdit(created.value, {
      plane: "oklab",
      kind: "channels",
      channels: { a: projected.value.representation.channels[1] + 0.01 },
    });
    // A successful result is defined in OKLab, regardless of the original space.
  }
}
```

An OKLCH neutral may have a numeric defining hue or `null`. Edits preserve that distinction. To raise chroma from a hue-less neutral, pass an explicit `reference: { hue }` with the edit or edit `h` directly; the reference is temporary instrument state and is never included in ColorValue or its snapshot. Switching plane views requires only projection and creates no replacement value.

## Math and guides

`ColorValue` owns authored identity. `analyzeGamut(value, "srgb-gamut" | "display-p3-gamut")` owns exact three-state status (`inside`, `within-tolerance`, `outside`) from the original value. `getPickerGuide` interpolates one OKLCH table for sampled maximum chroma, guide delta and guide color; hue/lightness intervals and contours are sampled visual geometry too. They never determine exact status or map the selected value. `mapToGamut` alone performs explicit mapping. `serializeCss` and `serializeHex` own output policy: strict output may reject `within-tolerance` with `boundary-tolerance`, while the picker treats it as visually contained for warnings and outside-only guide overlays. Plane geometry describes coordinates and constraints; the field sampler writes into a reusable numeric color. General `isColorInGamut` remains available independently of picker analysis.

See [Architecture](https://github.com/maikeleckelboom/gamut-plane/blob/dev/docs/architecture.md) for package boundaries and [Testing](https://github.com/maikeleckelboom/gamut-plane/blob/dev/docs/testing.md) for unit and packed-consumer checks.

[MIT License](LICENSE).
