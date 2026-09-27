export type ColorSpaceId = "oklch" | "oklab" | "srgb" | "display-p3";
export type GamutId = "srgb-gamut" | "display-p3-gamut";

export interface ChannelsBySpace {
  readonly oklch: readonly [l: number, c: number, h: number | null];
  readonly oklab: readonly [l: number, a: number, b: number];
  readonly srgb: readonly [r: number, g: number, b: number];
  readonly "display-p3": readonly [r: number, g: number, b: number];
}

export type ColorRepresentation<S extends ColorSpaceId = ColorSpaceId> = {
  [K in S]: Readonly<{
    space: K;
    channels: ChannelsBySpace[K];
    alpha: number;
  }>;
}[S];

export function isColorSpaceId(input: unknown): input is ColorSpaceId {
  return input === "oklch" || input === "oklab" || input === "srgb" || input === "display-p3";
}

export function isGamutId(input: unknown): input is GamutId {
  return input === "srgb-gamut" || input === "display-p3-gamut";
}

export function isRepresentation(input: unknown): input is ColorRepresentation {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const record = input as Record<string, unknown>;
  if (!isColorSpaceId(record.space) || !Array.isArray(record.channels)) return false;
  const channels: unknown[] = record.channels;
  if (channels.length !== 3 || ![0, 1, 2].every((index) => Object.hasOwn(channels, index)))
    return false;
  if (typeof record.alpha !== "number" || !Number.isFinite(record.alpha)) return false;
  if (record.alpha < 0 || record.alpha > 1) return false;
  const [first, second, third] = channels;
  if (typeof first !== "number" || !Number.isFinite(first)) return false;
  if (typeof second !== "number" || !Number.isFinite(second)) return false;
  if (record.space === "oklch") {
    if (second < 0) return false;
    if (third === null) return second === 0;
  }
  return typeof third === "number" && Number.isFinite(third);
}

export function frozenRepresentation<S extends ColorSpaceId>(
  representation: ColorRepresentation<S>,
): ColorRepresentation<S> {
  const channels = Object.freeze([...representation.channels]) as unknown as ChannelsBySpace[S];
  return Object.freeze({
    space: representation.space,
    channels,
    alpha: representation.alpha,
  }) as ColorRepresentation<S>;
}
