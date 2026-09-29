import type { represent } from "../../color/represent.js";
import type { ColorRepresentation, ColorSpaceId, GamutId } from "../../color/representation.js";
import type { createColorValue } from "../../color/value.js";

/** Names follow the existing ChannelsBySpace tuples; they do not replace those value types. */
interface ChannelNamesBySpace {
  readonly oklch: readonly ["l", "c", "h"];
  readonly oklab: readonly ["l", "a", "b"];
  readonly srgb: readonly ["r", "g", "b"];
  readonly "display-p3": readonly ["r", "g", "b"];
}

type ChannelIndex = 0 | 1 | 2;

export type ChannelDefinition<
  S extends ColorSpaceId = ColorSpaceId,
  I extends ChannelIndex = ChannelIndex,
> = {
  [R in S]: {
    [P in I]: Readonly<{
      id: `${R}.${ChannelNamesBySpace[R][P]}`;
      representationId: R;
      index: P;
      symbol: R extends "oklab"
        ? P extends 0
          ? "L"
          : ChannelNamesBySpace[R][P]
        : Uppercase<ChannelNamesBySpace[R][P]>;
      unit: "coordinate" | "degree" | "encoded-rgb";
      /** Descriptive only: isRepresentation remains the sole validity authority. */
      domain:
        | Readonly<{ kind: "finite" }>
        | Readonly<{ kind: "finite-lower-bound"; minimum: number }>;
      nominalRange: readonly [number, number] | null;
      cyclic: Readonly<{ period: number }> | null;
      missing: "not-supported" | "oklch-neutral-hue";
      effect: "always-effective" | "oklch-hue-at-zero-chroma";
    }>;
  }[I];
}[S];

export type ChannelId = ChannelDefinition["id"];

export type RepresentationDefinition<S extends ColorSpaceId = ColorSpaceId> = {
  [R in S]: Readonly<{
    id: R;
    model: R extends "oklch" | "oklab" ? "oklab" : "rgb";
    coordinateKind: R extends "oklch" ? "cylindrical" : "cartesian";
    referenceContext: "d65";
    /** Natural gamut reference only; neither validity, admission nor an analysis request. */
    associatedGamutId: GamutId | null;
    encoding: R extends "oklch" | "oklab"
      ? Readonly<{ kind: "model-coordinates" }>
      : Readonly<{ kind: "rgb"; primaries: R; transfer: "srgb" }>;
    channels: readonly [ChannelDefinition<R, 0>, ChannelDefinition<R, 1>, ChannelDefinition<R, 2>];
    observe: typeof represent<R>;
    author: (definition: ColorRepresentation<R>) => ReturnType<typeof createColorValue>;
  }>;
}[S];

export type RepresentationDefinitions = {
  readonly [S in ColorSpaceId]: RepresentationDefinition<S>;
};
