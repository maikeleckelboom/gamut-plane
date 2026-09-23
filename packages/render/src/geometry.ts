import type { PlanePoint } from "@gamut-plane/core";
export const VIEWBOX_SIZE = 1000;

export function pointStyle(point: PlanePoint): Record<string, string> {
  // Transcendental math can differ in the last bit between Node and browsers.
  // Stabilize presentation only; never quantize the authored color or projection math.
  return { left: `${(point.x * 100).toFixed(8)}%`, top: `${(point.y * 100).toFixed(8)}%` };
}

export function geometryToSvgPath(geometry: Float32Array, closed: boolean): string {
  let path = "";
  for (let index = 0; index < geometry.length; index += 2) {
    const x = (geometry[index] ?? 0) * VIEWBOX_SIZE;
    const y = (geometry[index + 1] ?? 0) * VIEWBOX_SIZE;
    path += `${index === 0 ? "M" : " L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return closed ? `${path} Z` : path;
}
