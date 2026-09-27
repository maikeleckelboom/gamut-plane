import { createColorValue, type ColorValue, type OklchColor } from "@gamut-plane/core";
import { createPickerPresentation } from "@gamut-plane/render";

export function color(l: number, c: number, h: number | null, alpha = 1): ColorValue {
  const result = createColorValue({ space: "oklch", channels: [l, c, h], alpha });
  if (!result.ok) throw new Error("Invalid test color");
  return result.value;
}

export function fromOklch(value: OklchColor): ColorValue {
  return color(value.l, value.c, value.h, value.alpha);
}

export function planeValue(value: OklchColor) {
  const modelValue = fromOklch(value);
  const presentation = createPickerPresentation(modelValue, "oklch", "srgb", {
    srgb: true,
    displayP3: true,
  });
  return { modelValue, fieldHue: presentation.fieldHue, markerCss: presentation.markerCss };
}
