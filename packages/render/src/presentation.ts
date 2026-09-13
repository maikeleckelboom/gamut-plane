import { serializeColor, type OklchColor, type PlanePoint } from "@gamut-plane/core";
import { pointStyle } from "./geometry.js";

export function colorGradient(segments: number, colorAt: (position: number) => OklchColor): string {
  const stops: string[] = [];
  for (let index = 0; index <= segments; index++) {
    const position = index / segments;
    stops.push(`${serializeColor(colorAt(position))} ${(position * 100).toFixed(3)}%`);
  }
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

export function projectionConnectorStyle(
  active: PlanePoint,
  guide: PlanePoint,
  radial: boolean,
): Record<string, string> {
  if (radial) {
    const dx = guide.x - active.x;
    const dy = guide.y - active.y;
    return {
      ...pointStyle(active),
      width: `${(Math.hypot(dx, dy) * 100).toFixed(8)}%`,
      transform: `translateY(-50%) rotate(${Math.atan2(dy, dx).toFixed(10)}rad)`,
      transformOrigin: "left center",
    };
  }
  return {
    ...pointStyle({ x: Math.min(active.x, guide.x), y: active.y }),
    width: `${(Math.abs(active.x - guide.x) * 100).toFixed(8)}%`,
  };
}
