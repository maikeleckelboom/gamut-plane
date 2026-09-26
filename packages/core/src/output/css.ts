import type { ColorResult } from "../result.js";
import {
  isRepresentation,
  type ColorRepresentation,
  type GamutId,
} from "../color/representation.js";
import { targetRgb } from "../gamut/analyze.js";

export type CssOutputPolicy =
  | Readonly<{ policy: "preserve-coordinates" }>
  | Readonly<{ policy: "require-in-gamut"; gamut: GamutId }>;
export interface CssOutput {
  readonly text: string;
  readonly quantization: "none";
}
export type CssOutputError = Readonly<{
  code:
    | "invalid-definition"
    | "requires-css-normalization"
    | "out-of-gamut"
    | "boundary-tolerance"
    | "numerical-range";
}>;

function format(number: number): string {
  return Object.is(number, -0) ? "-0" : String(number);
}

export function serializeCss(
  representation: ColorRepresentation,
  policy: CssOutputPolicy,
): ColorResult<CssOutput, CssOutputError> {
  if (!isRepresentation(representation))
    return { ok: false, error: { code: "invalid-definition" } };
  const [first, second, third] = representation.channels;
  if (
    (representation.space === "oklab" || representation.space === "oklch") &&
    (first < 0 || first > 1)
  ) {
    return { ok: false, error: { code: "requires-css-normalization" } };
  }
  if (representation.space === "oklch" && third !== null && (third < 0 || third >= 360)) {
    return { ok: false, error: { code: "requires-css-normalization" } };
  }
  if (policy.policy === "require-in-gamut") {
    const analysis = targetRgb(representation, policy.gamut);
    if (!analysis.ok) return { ok: false, error: { code: "numerical-range" } };
    if (analysis.value.status !== "inside") {
      return {
        ok: false,
        error: {
          code:
            analysis.value.status === "within-tolerance" ? "boundary-tolerance" : "out-of-gamut",
        },
      };
    }
  } else if (policy.policy !== "preserve-coordinates")
    throw new TypeError("Unsupported CSS output policy");
  const coordinates = `${format(first)} ${format(second)} ${third === null ? "none" : format(third)}`;
  const prefix =
    representation.space === "srgb" || representation.space === "display-p3"
      ? `color(${representation.space} `
      : `${representation.space}(`;
  return {
    ok: true,
    value: {
      text: `${prefix}${coordinates} / ${format(representation.alpha)})`,
      quantization: "none",
    },
  };
}
