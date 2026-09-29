import type { GamutCheckResult } from "@gamut-plane/core/internal/capabilities";

/** v0.3 requires both successful rows; preserve its fail-fast boundary without re-analysis. */
export function currentExactChecks(checks: readonly GamutCheckResult[]) {
  const srgb = checks.find((row) => row.gamutId === "srgb-gamut");
  const displayP3 = checks.find((row) => row.gamutId === "display-p3-gamut");
  if (!srgb || !displayP3) throw new Error("Current editable context requires both exact checks");
  if (!srgb.result.ok || !displayP3.result.ok) {
    throw new RangeError("Selected color cannot be analyzed for picker gamut status");
  }
  return { srgb: srgb.result.value, displayP3: displayP3.result.value };
}
