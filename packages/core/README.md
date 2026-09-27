# @gamut-plane/core

Framework-neutral color authorship, exact gamut analysis, output policy, picker geometry, and sampled guides. The package uses `@texel/color` and has no Vue, DOM, or Canvas dependency. It is private and **not published to npm**. Build it with `pnpm --filter @gamut-plane/core build`; Node.js 24+ is the supported build and server runtime.

## ColorValue is the authored color

`createColorValue` accepts a defining OKLCH, OKLab, sRGB, or Display P3 representation. It copies and freezes that definition. `definitionOf` reads authored identity; `represent` creates an immutable observation in another space. `definingEquals` compares definitions exactly. A view change or observation does not edit the value.

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
if (!created.ok) throw new Error("Invalid definition");

const color = created.value;
const defining = definitionOf(color);
const observed = represent(color, "oklch");
const srgbStatus = analyzeGamut(color, "srgb-gamut");
const restored = restoreColor(JSON.parse(JSON.stringify(snapshotColor(color))));
```

Use `snapshotColor` and `restoreColor` for JSON or SSR transport. `parseCssValue` accepts the supported numeric CSS literal profile and returns source text separately from the ColorValue. A successful edit explicitly constructs a new value; `mapToGamut(color, target, "oklch-chroma-reduction-v1")` is an explicit, lossy mapping operation.

## Exact status and output policy

`analyzeGamut` returns `inside`, `within-tolerance`, or `outside` from the ColorValue. It does not consult sampled tables. `serializeCss` consumes a representation and either preserves coordinates or requires strict target containment. `serializeHex` consumes an sRGB representation and quantizes to 8-bit channels with an explicit alpha option. Strict output rejects a tolerance fringe with `boundary-tolerance`; it never silently clamps.

```ts
import { parseCssValue, represent, serializeCss, serializeHex } from "@gamut-plane/core";

const parsed = parseCssValue("color(srgb 0.2 0.4 0.6)");
if (!parsed.ok) throw new Error(parsed.error.code);
const srgb = represent(parsed.value.value, "srgb");
if (!srgb.ok) throw new Error(srgb.error.code);

const css = serializeCss(srgb.value, { policy: "require-in-gamut", gamut: "srgb-gamut" });
const hex = serializeHex(srgb.value, { alpha: "omit" });
```

## Plane editing

`projectColorToPlane(value, "oklch" | "oklab")` returns an observed representation and an unclamped point without changing authorship. `authorPlaneEdit` creates a new ColorValue in the named plane. Channel edits keep unedited observed coordinates; point edits constrain only to the instrument rectangle or disc. Neither operation maps to a display gamut. Alpha is copied unless the edit supplies `alpha`.

```ts
import { authorPlaneEdit, createColorValue, projectColorToPlane } from "@gamut-plane/core";

const created = createColorValue({ space: "srgb", channels: [1, 0, 0], alpha: 1 });
if (!created.ok) throw new Error("Invalid definition");
const projected = projectColorToPlane(created.value, "oklab");
if (!projected.ok) throw new Error(projected.error.code);
const edited = authorPlaneEdit(created.value, {
  plane: "oklab",
  kind: "channels",
  channels: { a: projected.value.representation.channels[1] + 0.01 },
});
```

An OKLCH neutral may have a numeric defining hue or `null`. Edits preserve that distinction. To raise chroma from a hue-less neutral, pass a temporary `reference: { hue }` or edit `h` directly. The reference is never part of the ColorValue or snapshot.

## Sampled guides and numeric rendering

`GamutBoundaryTable` stores sampled OKLCH boundary geometry. `getPickerGuide`, `getHueGuideIntervals`, and `getLightnessGuideIntervals` interpolate that table for visual guides. Contours and intervals are sampled geometry, never exact membership decisions. `findMaximumChroma` is a numeric boundary-search primitive used for table generation and presentation references; it is not the `analyzeGamut` status policy.

`ColorRepresentation<"oklch">` is an immutable observation and can retain `h: null`. `OklchSample` is a mutable numeric render/presentation sample with a numeric hue. The field sampler writes into a reusable `OklchSample`; presentation deliberately chooses a numeric hue slice when an observation has no hue. `convertOklabToOklch` and `convertOklchToOklab` support reusable conversion arrays. `serializeOklchSample` emits precise OKLCH CSS for numeric samples in rendering; consumer CSS and Hex output policy belong to `serializeCss` and `serializeHex`.

The exact gamut-analysis tolerance and boundary-search tolerance both currently equal `1e-9`, but they govern separate operations: exact status classification and sampled-boundary generation.

See [Architecture](https://github.com/maikeleckelboom/gamut-plane/blob/dev/docs/architecture.md) for package boundaries and [Testing](https://github.com/maikeleckelboom/gamut-plane/blob/dev/docs/testing.md) for unit and packed-consumer checks.

[MIT License](LICENSE).
