import { serializeOklchSample, type OklchSample } from "@gamut-plane/core";

export function colorGradient(
  segments: number,
  colorAt: (position: number) => OklchSample,
): string {
  const stops: string[] = [];
  for (let index = 0; index <= segments; index++) {
    const position = index / segments;
    stops.push(`${serializeOklchSample(colorAt(position))} ${(position * 100).toFixed(3)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}
