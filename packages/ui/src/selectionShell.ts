import type { GamutId } from "@gamut-plane/core";
import type {
  GamutCheckResult,
  RepresentationDefinition,
} from "@gamut-plane/core/internal/capabilities";
import { currentPrimaryEditors, preferredEditors, representationUi } from "./instrumentMetadata.js";
import { currentRepresentationOptions, exactStatusCopy } from "./generalizedInstrument.js";
import {
  admittedEditorsForRepresentation,
  defaultSelection,
  requestEditor,
  type RepresentationId,
  type SelectionFacts,
} from "./instrumentState.js";

export interface SelectorOption {
  readonly value: string;
  readonly label: string;
  readonly optionLabel?: string;
  readonly description?: string;
  readonly status?: keyof typeof exactStatusCopy;
  readonly group?: "Perceptual" | "RGB";
  readonly coordinates?: string;
}

/** Grouped markup keeps the same flat controller order and stable option IDs. */
export function selectorGroups(options: readonly SelectorOption[]) {
  const groups: {
    label: SelectorOption["group"];
    options: { option: SelectorOption; index: number }[];
  }[] = [];
  for (const [index, option] of options.entries()) {
    let group = groups.at(-1);
    if (!group || group.label !== option.group) {
      group = { label: option.group, options: [] };
      groups.push(group);
    }
    group.options.push({ option, index });
  }
  return groups;
}
export type ShellEditor = Readonly<{
  id: string;
  representationId: RepresentationId;
  label: string;
  optionLabel?: string;
  description?: string;
}>;
export type ShellSelection = Readonly<{
  representationId: RepresentationId;
  editorId: string | null;
}>;
export type SelectionAction =
  | Readonly<{ kind: "representation"; value: string }>
  | Readonly<{ kind: "mode"; value: "edit" | "inspect" }>
  | Readonly<{ kind: "area"; value: string }>;
export const shellSelectionFacts: SelectionFacts<ShellEditor> = Object.freeze({
  knownEditors: currentPrimaryEditors,
  admittedEditors: currentPrimaryEditors,
  preferredEditors,
});

/** Passive projection of the current accepted revision. No observation or analysis executor. */
export function coordinatesOptions(
  checked: readonly GamutId[],
  checks: readonly GamutCheckResult[],
  definitions: Readonly<
    Record<RepresentationId, Pick<RepresentationDefinition, "associatedGamutId">>
  >,
): readonly SelectorOption[] {
  return currentRepresentationOptions.map((value) => {
    const gamut = definitions[value].associatedGamutId;
    const check =
      gamut !== null && checked.includes(gamut)
        ? checks.find((row) => row.gamutId === gamut)
        : undefined;
    return {
      value,
      label: representationUi[value].label,
      group: value === "oklch" || value === "oklab" ? "Perceptual" : "RGB",
      coordinates: value === "oklch" ? "L · C · H" : value === "oklab" ? "L · a · b" : "R · G · B",
      ...(check
        ? { status: check.result.ok ? check.result.value.status : ("unavailable" as const) }
        : {}),
    };
  });
}

export function selectionContext(selection: ShellSelection, facts = shellSelectionFacts) {
  const editors = admittedEditorsForRepresentation(selection.representationId, facts);
  return {
    canEdit: editors.length > 0,
    editing: selection.editorId !== null,
    areas:
      selection.editorId !== null && editors.length > 1
        ? editors.map((editor) => ({
            value: editor.id,
            label: editor.label,
            ...(editor.optionLabel && {
              optionLabel: editor.optionLabel,
              description: editor.description,
            }),
          }))
        : [],
  };
}

/** Shared accepted-selection policy, also exercised with test-only admission facts. */
export function requestShellSelection(
  selection: ShellSelection,
  action: SelectionAction,
  facts = shellSelectionFacts,
): ShellSelection {
  if (action.kind === "representation") {
    const representation = currentRepresentationOptions.find((id) => id === action.value);
    if (!representation) return selection;
    if (representation === selection.representationId && selection.editorId !== null)
      return selection;
    return defaultSelection(representation, facts);
  }
  if (action.kind === "mode") {
    if ((selection.editorId !== null) === (action.value === "edit")) return selection;
    return action.value === "inspect"
      ? { representationId: selection.representationId, editorId: null }
      : defaultSelection(selection.representationId, facts);
  }
  if (selection.editorId === null || action.value === selection.editorId) return selection;
  const result = requestEditor(selection.representationId, action.value, facts);
  return result.ok ? result.value : selection;
}
