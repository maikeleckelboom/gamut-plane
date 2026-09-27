import { represent, type ColorValue, type OklchColor } from "@gamut-plane/core";

/** Transitional observation for legacy picker presentation and field sampling. */
export function observePickerPresentationColor(value: ColorValue): OklchColor {
  const observed = represent(value, "oklch");
  if (!observed.ok) throw new RangeError("Selected color cannot be rendered in OKLCH");
  const [l, c, h] = observed.value.channels;
  // A missing hue needs a deterministic slice for the legacy field. This is never edit authority.
  return { l, c, h: h ?? 0, alpha: observed.value.alpha };
}
