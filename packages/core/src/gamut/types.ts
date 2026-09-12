import type { DisplayGamut } from "../color/types.js";

/** Linear-light membership tolerance shared by exact gamut operations. */
export const GAMUT_EPSILON = 1e-9;

export interface GamutBoundaryTable {
  gamut: DisplayGamut;
  hueSteps: number;
  lightnessSteps: number;
  /** Row-major: lightness bucket, then hue bucket. */
  chromaMax: Float32Array;
}

export interface GamutBoundaryOptions {
  hueSteps?: number;
  lightnessSteps?: number;
  searchIterations?: number;
}
