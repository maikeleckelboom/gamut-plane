import type { ColorResult } from "../result.js";
import { represent, type ConversionError } from "../color/represent.js";
import { createColorValue, type ColorValue } from "../color/value.js";
import type { ColorRepresentation, GamutId } from "../color/representation.js";
import { analyzeGamut, targetRgb } from "./analyze.js";

export type GamutMappingMethod = "oklch-chroma-reduction-v1";
export interface GamutMappingResult {
  readonly source: ColorValue;
  readonly mapped: ColorValue;
  readonly target: GamutId;
  readonly method: GamutMappingMethod;
  readonly changed: boolean;
}
export type GamutMappingError =
  | ConversionError
  | Readonly<{
      code: "neutral-anchor-outside-target" | "search-not-converged" | "verification-failed";
    }>;

export function mapToGamut(
  value: ColorValue,
  target: GamutId,
  method: GamutMappingMethod,
): ColorResult<GamutMappingResult, GamutMappingError> {
  if (method !== "oklch-chroma-reduction-v1") throw new TypeError("Unsupported mapping method");
  const original = analyzeGamut(value, target);
  if (!original.ok) return original;
  if (original.value.status === "inside") {
    return { ok: true, value: { source: value, mapped: value, target, method, changed: false } };
  }
  const observed = represent(value, "oklch");
  if (!observed.ok) return observed;
  const [l, chroma, h] = observed.value.channels;
  const alpha = observed.value.alpha;
  const candidate = (c: number): ColorRepresentation<"oklch"> => ({
    space: "oklch",
    channels: [l, c, h],
    alpha,
  });
  const anchor = targetRgb(candidate(0), target);
  if (!anchor.ok) return anchor;
  if (anchor.value.status !== "inside") {
    return { ok: false, error: { code: "neutral-anchor-outside-target" } };
  }
  const full = targetRgb(candidate(chroma), target);
  if (!full.ok) return full;
  let inside = chroma;
  if (full.value.status !== "inside") {
    let lo = 0;
    let hi = chroma;
    let converged = false;
    for (let iteration = 0; iteration < 2048; iteration++) {
      const mid = lo + (hi - lo) / 2;
      if (hi - lo <= 2 ** -40 || mid === lo || mid === hi) {
        converged = true;
        break;
      }
      const result = targetRgb(candidate(mid), target);
      if (!result.ok) return result;
      if (result.value.status === "inside") lo = mid;
      else hi = mid;
    }
    if (!converged) return { ok: false, error: { code: "search-not-converged" } };
    inside = lo;
  }
  const mapped = createColorValue(candidate(inside));
  if (!mapped.ok) return { ok: false, error: { code: "verification-failed" } };
  const verified = analyzeGamut(mapped.value, target);
  if (!verified.ok) return verified;
  if (verified.value.status !== "inside") {
    return { ok: false, error: { code: "verification-failed" } };
  }
  return {
    ok: true,
    value: { source: value, mapped: mapped.value, target, method, changed: true },
  };
}
