import type { PlanePoint } from "@gamut-plane/core";
export const VIEWBOX_SIZE = 1000;

export function pointStyle(point: PlanePoint): Record<string, string> {
  // Transcendental math can differ in the last bit between Node and browsers.
  // Stabilize presentation only; never quantize the authored color or projection math.
  const percentage = (coordinate: number): string => {
    const scaled = coordinate * 100;
    if (Number.isFinite(coordinate) && !Number.isFinite(scaled)) {
      // Keep extended authored positions valid CSS even when scaling exceeds a JS number.
      const [mantissa, exponent] = coordinate.toExponential().split("e");
      return `${mantissa}e${Number(exponent) + 2}%`;
    }
    return `${scaled.toFixed(8)}%`;
  };
  return { left: percentage(point.x), top: percentage(point.y) };
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
