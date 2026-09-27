export type DisplayGamut = "srgb" | "display-p3";

/** Mutable numeric OKLCH sample for rendering and sampled presentation. */
export interface OklchSample {
  l: number;
  c: number;
  h: number;
  alpha: number;
}

export function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

export function assertOklchSample(color: OklchSample): void {
  if (
    !Number.isFinite(color.l) ||
    !Number.isFinite(color.c) ||
    !Number.isFinite(color.h) ||
    !Number.isFinite(color.alpha)
  ) {
    throw new TypeError("Color channels must be finite numbers");
  }

  if (color.l < 0 || color.l > 1) {
    throw new RangeError("OKLCH lightness must be between 0 and 1");
  }
  if (color.c < 0) {
    throw new RangeError("OKLCH chroma must not be negative");
  }
  if (color.alpha < 0 || color.alpha > 1) {
    throw new RangeError("Alpha must be between 0 and 1");
  }
}
