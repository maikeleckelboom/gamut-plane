import type { PlanePoint } from "@gamut-plane/core";
import { PICKER_SLIDER_THUMB_WIDTH } from "../planeInstrumentStyle.js";

/** Pixel offsets from the marker center, preferring above-right with a clear gap. */
export function planeWarningOffset(
  point: PlanePoint,
  size: Readonly<{ width: number; height: number }>,
): PlanePoint {
  const candidates = [
    { x: 18, y: -18 },
    { x: -18, y: -18 },
    { x: 18, y: 18 },
    { x: -18, y: 18 },
  ];
  const preferred = candidates[0]!;
  if (size.width <= 0 || size.height <= 0) return preferred;
  // Half the 12px glyph plus clearance from the field edge.
  const inset = 8;
  let best = preferred;
  let leastOverflow = Infinity;
  for (const offset of candidates) {
    const x = point.x * size.width + offset.x;
    const y = point.y * size.height + offset.y;
    const overflow =
      Math.max(0, inset - x) +
      Math.max(0, x + inset - size.width) +
      Math.max(0, inset - y) +
      Math.max(0, y + inset - size.height);
    if (overflow === 0) return offset;
    if (overflow < leastOverflow) {
      best = offset;
      leastOverflow = overflow;
    }
  }
  return best;
}

/** Beside the native thumb; an overflow value has no truthful slider warning position. */
export function rangeWarningStyle(
  value: number,
  min: number,
  max: number,
): Readonly<{ left: string }> | null {
  if (!Number.isFinite(value) || value < min || value > max || max <= min) return null;
  const position = (value - min) / (max - min);
  const offset = PICKER_SLIDER_THUMB_WIDTH * (0.5 - position) + (position < 0.5 ? 17 : -17);
  return { left: `calc(${(position * 100).toFixed(8)}% + ${offset.toFixed(8)}px)` };
}
