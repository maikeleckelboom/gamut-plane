import { createColorValue, type ColorValue, type OklchColor } from "@gamut-plane/core";
import { observePickerPresentationColor } from "@gamut-plane/render";

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
  return { modelValue, presentationColor: observePickerPresentationColor(modelValue) };
}
