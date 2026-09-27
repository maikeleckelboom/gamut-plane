import type { DisplayGamut } from "../color/types.js";

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
