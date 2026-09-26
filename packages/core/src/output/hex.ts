import type { ColorResult } from "../result.js";
import { isRepresentation, type ColorRepresentation } from "../color/representation.js";
import { targetRgb } from "../gamut/analyze.js";

export interface HexOutput {
  readonly text: string;
  readonly quantization: "rgb8" | "rgba8";
}
export type HexOutputError = Readonly<{
  code:
    | "invalid-definition"
    | "out-of-gamut"
    | "boundary-tolerance"
    | "numerical-range"
    | "alpha-required";
}>;

export function serializeHex(
  representation: ColorRepresentation<"srgb">,
  options: Readonly<{ alpha: "omit" | "include" }>,
): ColorResult<HexOutput, HexOutputError> {
  if (!isRepresentation(representation) || representation.space !== "srgb") {
    return { ok: false, error: { code: "invalid-definition" } };
  }
  const analysis = targetRgb(representation, "srgb-gamut");
  if (!analysis.ok) return { ok: false, error: { code: "numerical-range" } };
  if (analysis.value.status !== "inside") {
    return {
      ok: false,
      error: {
        code: analysis.value.status === "within-tolerance" ? "boundary-tolerance" : "out-of-gamut",
      },
    };
  }
  if (options.alpha === "omit" && representation.alpha !== 1) {
    return { ok: false, error: { code: "alpha-required" } };
  }
  if (options.alpha !== "omit" && options.alpha !== "include")
    throw new TypeError("Unsupported Hex alpha option");
  const byte = (channel: number): string =>
    Math.floor(channel * 255 + 0.5)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  const channels = [
    ...representation.channels,
    ...(options.alpha === "include" ? [representation.alpha] : []),
  ];
  return {
    ok: true,
    value: {
      text: `#${channels.map(byte).join("")}`,
      quantization: options.alpha === "include" ? "rgba8" : "rgb8",
    },
  };
}
