import type { GamutCheckResult } from "@gamut-plane/core/internal/capabilities";
import {
  boundaryPausedCopy,
  gamutRows,
  gamutStatusCopy,
  referenceChoices,
  type GamutAction,
  type GamutStatus,
} from "./gamutShell.js";
import { generalizedCopy, type exactResultOrder } from "./generalizedInstrument.js";
import type { InstrumentViewState } from "./instrumentState.js";

export const gamutContextMenuName = "Gamut actions";

export type GamutMenuItem<G extends string> = Readonly<{
  id: string;
  role: "menuitemradio" | "menuitemcheckbox";
  label: string;
  checked: boolean;
  fact: string | null;
  description: string | null;
  status: GamutStatus | null;
  action: GamutAction<G>;
}>;

export type GamutMenuGroup<G extends string> = Readonly<{
  id: "reference" | "boundary" | "status";
  label: string;
  items: readonly GamutMenuItem<G>[];
}>;

/** An ephemeral projection of the inspector's facts and actions, with no analysis or local state. */
export function gamutContextMenuGroups<G extends string>(
  state: InstrumentViewState<G>,
  checks: readonly GamutCheckResult[],
  guideFor: Readonly<Record<(typeof exactResultOrder)[number], G>>,
  pausedGuides: readonly G[] = [],
): readonly GamutMenuGroup<G>[] {
  const rows = gamutRows(state, checks, guideFor, pausedGuides);
  return [
    {
      id: "reference",
      label: generalizedCopy.reference,
      items: referenceChoices(state.referenceGamutId).map((choice) => ({
        id: `reference-${choice.value}`,
        role: "menuitemradio",
        label: choice.label,
        checked: choice.selected,
        fact: null,
        description: null,
        status: null,
        action: { kind: "reference", gamutId: choice.gamutId },
      })),
    },
    {
      id: "boundary",
      label: generalizedCopy.visibleGuides,
      items: rows.map((row) => ({
        id: `boundary-${row.gamutId}`,
        role: "menuitemcheckbox",
        label: row.label,
        checked: row.boundary,
        fact: row.boundaryPaused ? generalizedCopy.boundaryPaused : null,
        description: row.boundaryPaused ? boundaryPausedCopy(state.selection) : null,
        status: null,
        action: { kind: "boundary", guideId: row.guideId, requested: !row.boundary },
      })),
    },
    {
      id: "status",
      label: generalizedCopy.exactChecks,
      items: rows.map((row) => ({
        id: `status-${row.gamutId}`,
        role: "menuitemcheckbox",
        label: row.label,
        checked: row.checked,
        fact: gamutStatusCopy(row.status),
        description: null,
        status: row.status,
        action: { kind: "status", gamutId: row.gamutId, requested: !row.checked },
      })),
    },
  ];
}
