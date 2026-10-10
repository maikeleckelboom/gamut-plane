import {
  SECTION_GAMUTS,
  type Membership,
  type SectionGamut,
  type SectionMode,
  type SectionOutcome,
  type SectionOutcomes,
  type SelectedObservation,
} from "./sectionModel";

/**
 * Plain-language facts for the section, derived from state. The same strings feed the visible
 * summary, the canvas description and the settled announcement, so the scene is never the only
 * place a fact exists. Nothing here is computed from drawn geometry.
 */
export const gamutNames: Record<SectionGamut, string> = {
  srgb: "sRGB",
  "display-p3": "Display P3",
};

const signed = (value: number) => (value < 0 ? "−" : "") + Math.abs(value).toFixed(3);
export const formatLightness = (value: number) => value.toFixed(3);

export function describeSelectedColor(
  observation: SelectedObservation,
  membership: Readonly<Record<SectionGamut, Membership>>,
): string {
  if (observation.status !== "ok")
    return "The selected color cannot be placed in OKLab, so it has no marker.";
  const states = SECTION_GAMUTS.map((gamut) => {
    const value = membership[gamut];
    const word =
      value === "unavailable" ? "not checkable in" : value === "outside" ? "outside" : "inside";
    return `${word} ${gamutNames[gamut]}`;
  });
  return `Selected color: L ${formatLightness(observation.l)}, a ${signed(observation.a)}, b ${signed(observation.b)}; ${states.join(", ")}.`;
}

function describeOutcome(gamut: SectionGamut, outcome: SectionOutcome): string {
  const name = gamutNames[gamut];
  if (outcome.status === "unavailable")
    return `${name} section unavailable (${outcome.error.replace("-", " ")}).`;
  const { section } = outcome;
  if (section.kind === "empty") return `${name} has no colors at this lightness.`;
  if (section.kind === "point") return `${name} has only the neutral point at this lightness.`;
  const { min, max } = section.bounds!;
  const loops = section.loops.length === 1 ? "" : ` in ${section.loops.length} parts`;
  return `${name} section${loops}: a ${signed(min[0])} to ${signed(max[0])}, b ${signed(min[1])} to ${signed(max[1])}.`;
}

export function describeSection(
  mode: SectionMode,
  lightness: number | null,
  outcomes: SectionOutcomes | null,
  observation: SelectedObservation,
): string {
  if (lightness === null)
    return observation.status === "ok"
      ? "No section is shown."
      : "No section while the selected color has no OKLab lightness. Inspect a lightness instead.";
  const origin = mode === "follow" ? "follows the selected color" : "is inspected separately";
  const head = `Section at L ${formatLightness(lightness)} ${origin}.`;
  if (!outcomes) return head;
  return [head, ...SECTION_GAMUTS.map((gamut) => describeOutcome(gamut, outcomes[gamut]))].join(
    " ",
  );
}

/** A short, settled statement for a polite live region. */
export function announceSection(
  mode: SectionMode,
  lightness: number | null,
  outcomes: SectionOutcomes | null,
  observation: SelectedObservation,
  membership: Readonly<Record<SectionGamut, Membership>>,
): string {
  if (lightness === null || !outcomes)
    return describeSection(mode, lightness, outcomes, observation);
  const ready = SECTION_GAMUTS.filter((gamut) => outcomes[gamut].status === "ready");
  const unavailable = SECTION_GAMUTS.filter((gamut) => outcomes[gamut].status === "unavailable");
  const parts = [
    `Section at lightness ${formatLightness(lightness)}, ${mode === "follow" ? "following the selected color" : "inspected separately"}.`,
  ];
  if (unavailable.length > 0)
    parts.push(`${unavailable.map((gamut) => gamutNames[gamut]).join(" and ")} unavailable.`);
  if (ready.length > 0 && unavailable.length === 0)
    parts.push("sRGB and Display P3 outlines shown.");
  if (observation.status === "ok") {
    const inside = SECTION_GAMUTS.filter(
      (g) => membership[g] === "inside" || membership[g] === "within-tolerance",
    );
    parts.push(
      inside.length === 0
        ? "Selected color is outside both gamuts."
        : `Selected color is inside ${inside.map((gamut) => gamutNames[gamut]).join(" and ")}.`,
    );
  }
  return parts.join(" ");
}

/** Presentation facts about the marker; null when there is nothing to say. */
export function describeMarker(hidden: boolean | null, inView: boolean | null): string | null {
  if (hidden === null || inView === null) return null;
  if (!inView) return "The selected color is outside the current view.";
  if (hidden) return "The selected color is behind the surface.";
  return null;
}
