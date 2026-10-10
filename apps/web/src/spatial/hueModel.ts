import { represent, type ColorValue } from "@gamut-plane/core";
import { generateHueSection, type HueSection } from "@gamut-plane/render/internal/spatial";
import { createSectionCache, SECTION_LIMITS, type SectionGamut } from "./sectionModel";

export const normalizeHue = (h: number) => {
  const remainder = h % 360;
  return remainder < 0 ? remainder + 360 : remainder === 0 ? 0 : remainder;
};
/** Observe the defining representation through core; a powerless authored angle is not a direction. */
export function observeHue(value: ColorValue): number | null {
  const observation = represent(value, "oklch");
  if (!observation.ok) return null;
  const [, c, h] = observation.value.channels;
  return c > 0 && h !== null ? normalizeHue(h) : null;
}
export interface HueSelection {
  readonly mode: "follow" | "inspect";
  readonly inspectHue: number;
  readonly retainedHue: number | null;
}
export const initialHueSelection: HueSelection = {
  mode: "follow",
  inspectHue: 0,
  retainedHue: null,
};
export function viewedHue(selection: HueSelection, observed: number | null): number {
  return selection.mode === "inspect"
    ? selection.inspectHue
    : (observed ?? selection.retainedHue ?? 0);
}
export function acceptHue(selection: HueSelection, observed: number | null): HueSelection {
  // Only followed chromatic colors change the retained viewing direction; edits during independent
  // inspection must not replace the direction the user is actually viewing.
  return selection.mode === "follow" && observed !== null
    ? { ...selection, retainedHue: observed }
    : selection;
}
export function inspectHue(selection: HueSelection, hue: number): HueSelection {
  return Number.isFinite(hue)
    ? { mode: "inspect", inspectHue: normalizeHue(hue), retainedHue: normalizeHue(hue) }
    : selection;
}
export type HueOutcome =
  | Readonly<{ status: "ready"; section: HueSection }>
  | Readonly<{ status: "unavailable"; error: string; detail: string }>;
export type HueOutcomes = Readonly<Record<SectionGamut, HueOutcome>>;
export function createHueStore() {
  return createSectionCache((space, hue): HueOutcome => {
    const result = generateHueSection({ space, hue, limits: SECTION_LIMITS });
    return result.ok
      ? { status: "ready", section: result.value }
      : { status: "unavailable", error: result.error, detail: result.detail };
  });
}
/** Orthonormal section frame in world (a,L,b). n points toward an unmirrored C-right/L-up camera. */
export function hueBasis(hue: number) {
  const angle = (hue * Math.PI) / 180,
    c = Math.cos(angle),
    s = Math.sin(angle);
  return { radial: [c, 0, s] as const, normal: [-s, 0, c] as const };
}
export function hueRelationship(point: readonly [number, number, number], hue: number) {
  const { radial, normal } = hueBasis(hue);
  const displacement = point[0] * normal[0] + point[2] * normal[2];
  const radius = point[0] * radial[0] + point[2] * radial[2];
  // A presentation tolerance, never core membership. Opposite rays remain distinguishable.
  return {
    displacement,
    radius,
    onHalfPlane: Math.abs(displacement) < 1e-9 && radius >= -1e-9,
    opposite: radius < -1e-9,
  };
}
