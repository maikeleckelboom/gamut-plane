import { OKLCH, convert, findCuspOKLCH, isRGBInGamut } from "@texel/color";

import { GAMUT_DEFINITIONS } from "./convert";
import type { GamutId } from "../model/color";
import { GAMUT_EPSILON, type GamutBoundaryOptions, type GamutBoundaryTable } from "../model/gamut";

const DEFAULT_HUE_STEPS = 180;
const DEFAULT_LIGHTNESS_STEPS = 51;
const DEFAULT_SEARCH_ITERATIONS = 18;
const tableCache = new Map<string, GamutBoundaryTable>();

interface ResolvedBoundaryOptions {
  hueSteps: number;
  lightnessSteps: number;
  searchIterations: number;
}

function resolveOptions(options: GamutBoundaryOptions = {}): ResolvedBoundaryOptions {
  const resolved = {
    hueSteps: options.hueSteps ?? DEFAULT_HUE_STEPS,
    lightnessSteps: options.lightnessSteps ?? DEFAULT_LIGHTNESS_STEPS,
    searchIterations: options.searchIterations ?? DEFAULT_SEARCH_ITERATIONS,
  };

  if (!Number.isInteger(resolved.hueSteps) || resolved.hueSteps < 3) {
    throw new RangeError("hueSteps must be an integer of at least 3");
  }
  if (!Number.isInteger(resolved.lightnessSteps) || resolved.lightnessSteps < 2) {
    throw new RangeError("lightnessSteps must be an integer of at least 2");
  }
  if (
    !Number.isInteger(resolved.searchIterations) ||
    resolved.searchIterations < 4 ||
    resolved.searchIterations > 32
  ) {
    throw new RangeError("searchIterations must be an integer between 4 and 32");
  }
  return resolved;
}

function isCandidateInGamut(candidate: number[], rgb: number[], gamut: GamutId): boolean {
  convert(candidate, OKLCH, GAMUT_DEFINITIONS[gamut].linear, rgb);
  return isRGBInGamut(rgb, GAMUT_EPSILON);
}

/** Exact per-point search used during table precomputation and fallback verification. */
export function findMaximumChroma(
  l: number,
  h: number,
  gamut: GamutId,
  searchIterations = 24,
): number {
  if (!Number.isFinite(l) || !Number.isFinite(h))
    throw new TypeError("Lightness and hue must be finite");
  if (l <= 0 || l >= 1) return 0;
  if (!Number.isInteger(searchIterations) || searchIterations < 4 || searchIterations > 32) {
    throw new RangeError("searchIterations must be an integer between 4 and 32");
  }

  const hue = ((h % 360) + 360) % 360;
  const radians = (hue * Math.PI) / 180;
  const cusp = findCuspOKLCH(
    Math.cos(radians),
    Math.sin(radians),
    GAMUT_DEFINITIONS[gamut].gamut,
    [0, 0],
  );
  const candidate = [l, 0, hue];
  const rgb = [0, 0, 0];
  let low = 0;
  let high = Math.max((cusp[1] ?? 0) * 1.25, 0.05);

  while (high < 4 && isCandidateInGamut(candidateWithChroma(candidate, high), rgb, gamut)) {
    low = high;
    high *= 2;
  }

  for (let iteration = 0; iteration < searchIterations; iteration += 1) {
    const midpoint = (low + high) / 2;
    if (isCandidateInGamut(candidateWithChroma(candidate, midpoint), rgb, gamut)) low = midpoint;
    else high = midpoint;
  }
  return low;
}

function candidateWithChroma(candidate: number[], chroma: number): number[] {
  candidate[1] = chroma;
  return candidate;
}

/**
 * Precomputes a deterministic Cmax grid. This work belongs off the interaction
 * path (and can be moved into a worker); picker reads are interpolation-only.
 */
export function generateGamutBoundaryTable(
  gamut: GamutId,
  options: GamutBoundaryOptions = {},
): GamutBoundaryTable {
  const { hueSteps, lightnessSteps, searchIterations } = resolveOptions(options);
  const chromaMax = new Float32Array(hueSteps * lightnessSteps);
  const definition = GAMUT_DEFINITIONS[gamut];
  const candidate = [0, 0, 0];
  const rgb = [0, 0, 0];
  const cusp = [0, 0];

  for (let hueIndex = 0; hueIndex < hueSteps; hueIndex += 1) {
    const hue = (hueIndex / hueSteps) * 360;
    const radians = (hue * Math.PI) / 180;
    findCuspOKLCH(Math.cos(radians), Math.sin(radians), definition.gamut, cusp);
    const initialHigh = Math.max((cusp[1] ?? 0) * 1.25, 0.05);
    candidate[2] = hue;

    for (let lightnessIndex = 1; lightnessIndex < lightnessSteps - 1; lightnessIndex += 1) {
      candidate[0] = lightnessIndex / (lightnessSteps - 1);
      let low = 0;
      let high = initialHigh;

      candidate[1] = high;
      while (high < 4 && isCandidateInGamut(candidate, rgb, gamut)) {
        low = high;
        high *= 2;
        candidate[1] = high;
      }

      for (let iteration = 0; iteration < searchIterations; iteration += 1) {
        const midpoint = (low + high) / 2;
        candidate[1] = midpoint;
        if (isCandidateInGamut(candidate, rgb, gamut)) low = midpoint;
        else high = midpoint;
      }
      chromaMax[lightnessIndex * hueSteps + hueIndex] = low;
    }
  }

  return { gamut, hueSteps, lightnessSteps, chromaMax };
}

export function getCachedGamutBoundaryTable(
  gamut: GamutId,
  options: GamutBoundaryOptions = {},
): GamutBoundaryTable {
  const resolved = resolveOptions(options);
  const key = `${gamut}:${resolved.hueSteps}:${resolved.lightnessSteps}:${resolved.searchIterations}`;
  const cached = tableCache.get(key);
  if (cached) return cached;
  const table = generateGamutBoundaryTable(gamut, resolved);
  tableCache.set(key, table);
  return table;
}

export function clearGamutBoundaryTableCache(): void {
  tableCache.clear();
}

/** Bilinear Cmax lookup; no gamut checks occur on the interaction path. */
export function getMaximumChromaFromTable(table: GamutBoundaryTable, l: number, h: number): number {
  if (table.chromaMax.length !== table.hueSteps * table.lightnessSteps) {
    throw new RangeError("Boundary table data length does not match its resolution");
  }
  const lightness = Math.min(1, Math.max(0, l)) * (table.lightnessSteps - 1);
  const hue = ((((h % 360) + 360) % 360) / 360) * table.hueSteps;
  const l0 = Math.floor(lightness);
  const l1 = Math.min(l0 + 1, table.lightnessSteps - 1);
  const h0 = Math.floor(hue) % table.hueSteps;
  const h1 = (h0 + 1) % table.hueSteps;
  const lt = lightness - l0;
  const ht = hue - Math.floor(hue);
  const at = (lightnessIndex: number, hueIndex: number): number =>
    table.chromaMax[lightnessIndex * table.hueSteps + hueIndex] ?? 0;
  const top = at(l0, h0) * (1 - ht) + at(l0, h1) * ht;
  const bottom = at(l1, h0) * (1 - ht) + at(l1, h1) * ht;
  return top * (1 - lt) + bottom * lt;
}

export function getGamutOutline(table: GamutBoundaryTable, l: number): Float32Array {
  const outline = new Float32Array(table.hueSteps * 2);
  for (let hueIndex = 0; hueIndex < table.hueSteps; hueIndex += 1) {
    const hue = (hueIndex / table.hueSteps) * 360;
    outline[hueIndex * 2] = hue;
    outline[hueIndex * 2 + 1] = getMaximumChromaFromTable(table, l, hue);
  }
  return outline;
}
