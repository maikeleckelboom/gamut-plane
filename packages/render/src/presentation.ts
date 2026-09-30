import { serializeOklchSample, type OklchSample } from "@gamut-plane/core";
import { serializeNativeRgbSample, type NativeRgbSample } from "./rgbField.js";

export function colorGradient(
  segments: number,
  colorAt: (position: number) => OklchSample | NativeRgbSample,
): string {
  const stops: string[] = [];
  for (let index = 0; index <= segments; index++) {
    const position = index / segments;
    const sample = colorAt(position);
    const css = "space" in sample ? serializeNativeRgbSample(sample) : serializeOklchSample(sample);
    stops.push(`${css} ${(position * 100).toFixed(3)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}
