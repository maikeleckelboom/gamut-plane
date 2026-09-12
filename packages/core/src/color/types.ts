export type DisplayGamut = "srgb" | "display-p3";

export type PickerPlane = "oklch" | "oklab";

/** Canonical color state shared by the core package and the Vue instrument. */
export interface OklchColor {
  l: number;
  c: number;
  h: number;
  alpha: number;
}

/** Neutral OKLab coordinates used at conversion and presentation boundaries. */
export interface OklabColor {
  l: number;
  a: number;
  b: number;
  alpha: number;
}

export function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

export function assertOklchColor(color: OklchColor): void {
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

export function assertOklabColor(color: OklabColor): void {
  if (
    !Number.isFinite(color.l) ||
    !Number.isFinite(color.a) ||
    !Number.isFinite(color.b) ||
    !Number.isFinite(color.alpha)
  ) {
    throw new TypeError("OKLab channels must be finite numbers");
  }
  if (color.l < 0 || color.l > 1) {
    throw new RangeError("OKLab lightness must be between 0 and 1");
  }
  if (color.alpha < 0 || color.alpha > 1) {
    throw new RangeError("Alpha must be between 0 and 1");
  }
}

export function copyColor(color: OklchColor): OklchColor {
  assertOklchColor(color);
  return { l: color.l, c: color.c, h: color.h, alpha: color.alpha };
}
