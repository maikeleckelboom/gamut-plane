import { OKLCH, serialize } from "@texel/color";

import { assertOklchSample, type OklchSample } from "./types.js";

/** Precise OKLCH CSS for a numeric render sample; output policy belongs to serializeCss. */
export function serializeOklchSample(sample: OklchSample): string {
  assertOklchSample(sample);
  const coordinates =
    sample.alpha === 1
      ? [sample.l, sample.c, sample.h]
      : [sample.l, sample.c, sample.h, sample.alpha];
  return serialize(coordinates, OKLCH, OKLCH);
}
