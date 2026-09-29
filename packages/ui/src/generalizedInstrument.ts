import type { GamutId } from "@gamut-plane/core";
import type { ChannelDefinition } from "@gamut-plane/core/internal/capabilities";
import { representationUi } from "./instrumentMetadata.js";
import {
  canonicalCheckedGamuts,
  canonicalVisibleGuides,
  defaultSelection,
  validateInstrumentViewState,
  type InstrumentViewState,
  type InstrumentSelection,
  type RepresentationId,
} from "./instrumentState.js";

type ChannelUi<R extends RepresentationId, I extends 0 | 1 | 2> = Readonly<{
  id: ChannelDefinition<R, I>["id"];
  symbol: ChannelDefinition<R, I>["symbol"];
  label: string;
}>;
type InspectionUi<R extends RepresentationId> = Readonly<{
  channels: readonly [ChannelUi<R, 0>, ChannelUi<R, 1>, ChannelUi<R, 2>];
}>;

/** UI labels follow the core-owned, representation-qualified channel identity and order. */
export const inspectionUi = Object.freeze({
  oklch: Object.freeze({
    channels: Object.freeze([
      Object.freeze({ id: "oklch.l", symbol: "L", label: "Lightness" }),
      Object.freeze({ id: "oklch.c", symbol: "C", label: "Chroma" }),
      Object.freeze({ id: "oklch.h", symbol: "H", label: "Hue" }),
    ] as const),
  }),
  oklab: Object.freeze({
    channels: Object.freeze([
      Object.freeze({ id: "oklab.l", symbol: "L", label: "Lightness" }),
      Object.freeze({ id: "oklab.a", symbol: "a", label: "a" }),
      Object.freeze({ id: "oklab.b", symbol: "b", label: "b" }),
    ] as const),
  }),
  srgb: Object.freeze({
    channels: Object.freeze([
      Object.freeze({ id: "srgb.r", symbol: "R", label: "Red" }),
      Object.freeze({ id: "srgb.g", symbol: "G", label: "Green" }),
      Object.freeze({ id: "srgb.b", symbol: "B", label: "Blue" }),
    ] as const),
  }),
  "display-p3": Object.freeze({
    channels: Object.freeze([
      Object.freeze({ id: "display-p3.r", symbol: "R", label: "Red" }),
      Object.freeze({ id: "display-p3.g", symbol: "G", label: "Green" }),
      Object.freeze({ id: "display-p3.b", symbol: "B", label: "Blue" }),
    ] as const),
  }),
} satisfies { readonly [R in RepresentationId]: InspectionUi<R> });

export const currentRepresentationOptions = Object.freeze([
  "oklch",
  "oklab",
  "srgb",
  "display-p3",
] as const satisfies readonly RepresentationId[]);

export const exactGamutUi = Object.freeze({
  "srgb-gamut": Object.freeze({ label: "sRGB" }),
  "display-p3-gamut": Object.freeze({ label: "Display P3" }),
} satisfies { readonly [G in GamutId]: Readonly<{ label: string }> });

export const exactStatusCopy = Object.freeze({
  inside: "Inside",
  "within-tolerance": "Within tolerance",
  outside: "Outside",
  unavailable: "Unavailable",
} as const);

export const guidePreferenceUi = Object.freeze({
  "srgb-boundary": Object.freeze({ label: "sRGB boundary" }),
  "display-p3-boundary": Object.freeze({ label: "Display P3 boundary" }),
});

/** Display order is product policy, independent of canonical transport order. */
export const exactResultOrder = Object.freeze([
  "srgb-gamut",
  "display-p3-gamut",
] as const satisfies readonly GamutId[]);

export function orderedExactChecks<T extends Readonly<{ gamutId: GamutId }>>(
  checks: readonly T[],
): readonly T[] {
  return exactResultOrder.flatMap((id) => checks.filter((row) => row.gamutId === id));
}

export const generalizedCopy = Object.freeze({
  representation: "Representation",
  editCoordinates: "Edit coordinates",
  inspectionOnly: "Inspection only",
  inspecting: "Inspecting",
  editing: "Editing",
  coordinatesUnavailable: "Coordinates unavailable for this color.",
  planeUnavailable: "Editing plane unavailable for this color.",
  alpha: "Alpha",
  noChecks: "No gamut checks selected",
  comparison: "Gamut comparison",
  disclosure: "Gamut checks and guides",
  exactChecks: "Exact checks",
  visibleGuides: "Visible guides",
  guidesPending: "Requested guides will appear when an editable plane is selected.",
  guidesUnavailable: "Some requested guides cannot be shown for this color or editor.",
});

export function authorshipContextCopy(
  authoredRepresentationId: RepresentationId,
  selection: InstrumentSelection,
): string {
  const mode = selection.editorId === null ? generalizedCopy.inspecting : generalizedCopy.editing;
  return `Authored as ${representationUi[authoredRepresentationId].label} · ${mode} as ${representationUi[selection.representationId].label}`;
}

/** Nine significant decimal digits are for inspection, separate from edit and output precision. */
export function formatInspectionNumber(value: number | null): string {
  if (value === null) return "missing";
  if (Object.is(value, -0)) return "-0";
  if (!Number.isFinite(value)) throw new TypeError("Inspection requires a finite coordinate");
  return Number(value.toPrecision(9)).toString();
}

export function canonicalInstrumentState<G extends string>(
  input: unknown,
  knownGuides: readonly G[],
): InstrumentViewState<G> {
  const result = validateInstrumentViewState(input, knownGuides);
  if (!result.ok) throw new TypeError(`Invalid GamutPlane state: ${result.issue.code}`);
  return result.value;
}

export function initialInstrumentState<G extends string>(): InstrumentViewState<G> {
  return Object.freeze({
    selection: defaultSelection("oklch"),
    checkedGamuts: Object.freeze([]),
    visibleGuides: Object.freeze([]),
  });
}

export function requestRepresentation<G extends string>(
  state: InstrumentViewState<G>,
  representationId: RepresentationId,
): InstrumentViewState<G> {
  return Object.freeze({ ...state, selection: defaultSelection(representationId) });
}

export function requestInspection<G extends string>(
  state: InstrumentViewState<G>,
  inspect: boolean,
): InstrumentViewState<G> {
  return Object.freeze({
    ...state,
    selection: inspect
      ? Object.freeze({ representationId: state.selection.representationId, editorId: null })
      : defaultSelection(state.selection.representationId),
  });
}

export function requestCheckedGamut<G extends string>(
  state: InstrumentViewState<G>,
  gamutId: GamutId,
  checked: boolean,
): InstrumentViewState<G> {
  const result = canonicalCheckedGamuts(
    checked
      ? [...state.checkedGamuts, gamutId]
      : state.checkedGamuts.filter((id) => id !== gamutId),
  );
  if (!result.ok) throw new TypeError(`Invalid GamutPlane state: ${result.issue.code}`);
  return Object.freeze({ ...state, checkedGamuts: result.value });
}

export function requestVisibleGuide<G extends string>(
  state: InstrumentViewState<G>,
  guideId: G,
  visible: boolean,
  knownGuides: readonly G[],
): InstrumentViewState<G> {
  const result = canonicalVisibleGuides(
    visible
      ? [...state.visibleGuides, guideId]
      : state.visibleGuides.filter((id) => id !== guideId),
    knownGuides,
  );
  if (!result.ok) throw new TypeError(`Invalid GamutPlane state: ${result.issue.code}`);
  return Object.freeze({ ...state, visibleGuides: result.value });
}
