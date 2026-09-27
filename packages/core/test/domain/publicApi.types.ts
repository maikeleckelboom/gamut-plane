import {
  authorPlaneEdit,
  createColorValue,
  definitionOf,
  projectColorToPlane,
  represent,
  serializeHex,
  type ColorRepresentation,
  type ColorResult,
  type ColorSpaceId,
  type ColorValue,
} from "../../src/index.js";

declare const value: ColorValue;
declare const representation: ColorRepresentation;
declare const result: ColorResult<ColorValue, { code: "invalid-definition" }>;

if (result.ok) {
  const valid: ColorValue = result.value;
  void valid;
} else {
  const errorCode: "invalid-definition" = result.error.code;
  void errorCode;
}

const space: ColorSpaceId = "display-p3";
void space;
const srgb: ColorRepresentation<"srgb"> = { space: "srgb", channels: [0, 0, 0], alpha: 1 };
serializeHex(srgb, { alpha: "omit" });
createColorValue(representation);
definitionOf(value);
represent(value, "oklch");
const projected = projectColorToPlane(value, "oklab");
if (projected.ok) {
  const axes: readonly [number, number, number] = projected.value.representation.channels;
  const reauthored = authorPlaneEdit(value, {
    plane: "oklab",
    kind: "channels",
    channels: { a: axes[1] + 0.01 },
  });
  if (reauthored.ok) {
    const defined: ColorValue = reauthored.value;
    void defined;
  }
}

// @ts-expect-error closed space IDs
const unsupported: ColorSpaceId = "rec2020";
void unsupported;
// @ts-expect-error an unbranded record is not a ColorValue
const unbranded: ColorValue = { kind: "gamut-plane/color-value" };
void unbranded;
// @ts-expect-error correlated tuple shapes do not permit a null sRGB channel
const invalidRgb: ColorRepresentation<"srgb"> = { space: "srgb", channels: [0, 0, null], alpha: 1 };
void invalidRgb;
// @ts-expect-error representation fields are readonly
representation.alpha = 0;
// @ts-expect-error Hex accepts explicit sRGB coordinates only
serializeHex({ space: "display-p3", channels: [0, 0, 0], alpha: 1 }, { alpha: "omit" });
// @ts-expect-error OKLab edits cannot carry an OKLCH hue
authorPlaneEdit(value, { plane: "oklab", kind: "channels", channels: { h: 20 } });
