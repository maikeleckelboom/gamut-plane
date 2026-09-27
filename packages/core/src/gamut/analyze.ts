import { DisplayP3Linear, convert, sRGBLinear, DisplayP3, sRGB } from "@texel/color";

import type { ColorResult } from "../result.js";
import { represent, type ConversionError } from "../color/represent.js";
import { createColorValue, definitionOf, type ColorValue } from "../color/value.js";
import { isGamutId, type ColorRepresentation, type GamutId } from "../color/representation.js";

export type GamutStatus = "inside" | "within-tolerance" | "outside";
export interface GamutAnalysis {
  readonly gamut: GamutId;
  readonly linearRgb: readonly [number, number, number];
  readonly tolerance: number;
  readonly status: GamutStatus;
}
export type GamutAnalysisError = ConversionError;
export const GAMUT_ANALYSIS_TOLERANCE = 1e-9;

export type TargetRgb = Readonly<{
  encoded: readonly [number, number, number];
  linear: readonly [number, number, number];
  status: GamutStatus;
}>;

/** One target conversion and one set of containment predicates for all bounded outputs. */
export function targetRgb(
  representation: ColorRepresentation,
  gamut: GamutId,
): ColorResult<TargetRgb, ConversionError> {
  if (!isGamutId(gamut)) throw new TypeError("Unsupported gamut");
  const source = createColorValue(representation);
  if (!source.ok) throw new TypeError("Expected a valid color representation");
  const space = gamut === "srgb-gamut" ? "srgb" : "display-p3";
  const observed = represent(source.value, space);
  if (!observed.ok) return observed;
  const encoded = observed.value.channels;
  const linearSpace = gamut === "srgb-gamut" ? sRGBLinear : DisplayP3Linear;
  const encodedSpace = gamut === "srgb-gamut" ? sRGB : DisplayP3;
  const converted = convert([...encoded], encodedSpace, linearSpace);
  const linear: readonly [number, number, number] = [converted[0]!, converted[1]!, converted[2]!];
  if (!linear.every(Number.isFinite)) {
    return { ok: false, error: { code: "numerical-range", from: representation.space, to: space } };
  }
  const strict = [...encoded, ...linear].every((channel) => channel >= 0 && channel <= 1);
  const tolerant = linear.every(
    (channel) => channel >= -GAMUT_ANALYSIS_TOLERANCE && channel <= 1 + GAMUT_ANALYSIS_TOLERANCE,
  );
  return {
    ok: true,
    value: Object.freeze({
      encoded: Object.freeze([...encoded]) as typeof encoded,
      linear: Object.freeze([...linear]) as typeof linear,
      status: strict ? "inside" : tolerant ? "within-tolerance" : "outside",
    }),
  };
}

export function analyzeGamut(
  value: ColorValue,
  gamut: GamutId,
): ColorResult<GamutAnalysis, GamutAnalysisError> {
  const analysis = targetRgb(definitionOf(value), gamut);
  if (!analysis.ok) return analysis;
  return {
    ok: true,
    value: Object.freeze({
      gamut,
      linearRgb: analysis.value.linear,
      tolerance: GAMUT_ANALYSIS_TOLERANCE,
      status: analysis.value.status,
    }),
  };
}
