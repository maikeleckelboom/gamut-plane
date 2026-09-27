import type { GamutId } from "../color/representation.js";
import type { ColorValue } from "../color/value.js";
import { analyzeGamut, type GamutAnalysis, type GamutAnalysisError } from "../gamut/analyze.js";
import type { ColorResult } from "../result.js";

export interface GamutCheckResult {
  readonly gamutId: GamutId;
  readonly result: ColorResult<GamutAnalysis, GamutAnalysisError>;
}

/** Already validated/canonical requests. Each analysis receives the original authored value. */
export function analyzeRequestedGamuts(
  value: ColorValue,
  requested: readonly GamutId[],
): readonly GamutCheckResult[] {
  return Object.freeze(
    requested.map((gamutId) => Object.freeze({ gamutId, result: analyzeGamut(value, gamutId) })),
  );
}
