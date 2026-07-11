export type ColorSource =
  | { kind: "input"; raw: string }
  | { kind: "derived-fallback"; sourceId: string; targetGamut: GamutId };

export type GamutId = "srgb" | "display-p3" | "rec2020";

/** The canonical editable color representation used throughout Chromavert. */
export interface ChromavertColor {
  l: number;
  c: number;
  h: number;
  alpha: number;
  source?: ColorSource;
}

export function normalizeHue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

export function assertChromavertColor(color: ChromavertColor): void {
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

export function copyColor(color: ChromavertColor): ChromavertColor {
  return color.source === undefined
    ? { l: color.l, c: color.c, h: color.h, alpha: color.alpha }
    : { l: color.l, c: color.c, h: color.h, alpha: color.alpha, source: color.source };
}
