import type { ChromavertColor, GamutId } from "./color";

export interface GamutBoundaryTable {
  gamut: GamutId;
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

export interface GamutStatus {
  gamut: GamutId;
  inGamut: boolean;
  activeChroma: number;
  maximumChroma: number;
  deltaC: number;
}

export interface DerivedFallback {
  active: ChromavertColor;
  fallback: ChromavertColor;
  targetGamut: GamutId;
  deltaC: number;
  wasMapped: boolean;
}
