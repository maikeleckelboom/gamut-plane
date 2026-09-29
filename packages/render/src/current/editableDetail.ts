import {
  OKLCH_PICKER_MAX_CHROMA,
  convertOklabToOklch,
  normalizeHue,
  oklchCoordinatesToPlanePoint,
  represent,
  serializeOklchSample,
  type ColorRepresentation,
  type ColorResult,
  type ColorValue,
  type ConversionError,
  type OklchSample,
} from "@gamut-plane/core";
import { colorGradient } from "../presentation.js";
import type { CurrentField } from "./field.js";

/** Reuse selected OKLCH; OKLab needs one companion observation for current CSS detail. */
export function currentOklchObservation(
  source: ColorValue,
  observation: ColorResult<ColorRepresentation, ConversionError>,
  observationFailureMessage = "Selected color cannot be projected into the instrument",
): ColorRepresentation<"oklch"> {
  if (!observation.ok) throw new RangeError(observationFailureMessage);
  if (observation.value.space === "oklch") return observation.value;
  const observed = represent(source, "oklch");
  if (!observed.ok) throw new RangeError(observationFailureMessage);
  // The old factory required even its companion L/C projection to be finite. Preserve that
  // failure boundary using the missing companion coordinates, without observing/projecting again.
  const [l, c] = observed.value.channels;
  const point = oklchCoordinatesToPlanePoint(l, c);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError("Selected color cannot be projected into the instrument");
  }
  return observed.value;
}

/** Only visuals consumed by the active current editor. No exact/field/guide resolution. */
export function currentEditableDetail(field: CurrentField, oklch: ColorRepresentation<"oklch">) {
  const [l, c, observedHue] = oklch.channels;
  const sample: OklchSample = { l, c, h: observedHue ?? 0, alpha: oklch.alpha };
  const common = {
    activeCss: serializeOklchSample(sample),
    markerCss: serializeOklchSample({ ...sample, alpha: 1 }),
  };
  if (field.projection.representationId === "oklch") {
    return {
      ...common,
      view: "oklch" as const,
      huePosition: normalizeHue(sample.h) / 360,
      chromaPosition: Math.min(1, Math.max(0, c / OKLCH_PICKER_MAX_CHROMA)),
      hueGradient: colorGradient(72, (position) => ({ ...sample, h: position * 360, alpha: 1 })),
      lightnessGradient: colorGradient(12, (position) => ({ ...sample, l: position, alpha: 1 })),
      chromaGradient: colorGradient(12, (position) => ({
        ...sample,
        c: position * OKLCH_PICKER_MAX_CHROMA,
        alpha: 1,
      })),
    };
  }
  const [, a, b] = field.projection.representation.channels;
  return {
    ...common,
    view: "oklab" as const,
    fixedLightnessGradient: colorGradient(12, (position) => {
      const [stopL, stopC, stopH] = convertOklabToOklch([position, a, b]);
      return {
        l: stopL!,
        c: Number(stopC!.toPrecision(12)),
        h: Number(stopH!.toPrecision(12)),
        alpha: field.projection.representation.alpha,
      };
    }),
  };
}
