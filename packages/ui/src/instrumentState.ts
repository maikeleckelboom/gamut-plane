import type { GamutId } from "@gamut-plane/core";
import type {
  EditorDefinition,
  RepresentationDefinition,
} from "@gamut-plane/core/internal/capabilities";
import {
  currentEditorByView,
  currentPrimaryEditors,
  representationUi,
} from "./instrumentMetadata.js";

export type RepresentationId = RepresentationDefinition["id"];
type EditorIdentity = Readonly<{ id: string; representationId: RepresentationId }>;
type TechnicalEditor = EditorDefinition extends infer E
  ? E extends EditorDefinition
    ? Pick<E, "id" | "representationId">
    : never
  : never;

/** The pair is correlated for known editors; null deliberately permits inspection only. */
export type InstrumentSelection<E extends EditorIdentity = TechnicalEditor> = {
  [R in RepresentationId]: Readonly<{
    representationId: R;
    editorId: Extract<E, { representationId: R }>["id"] | null;
  }>;
}[RepresentationId];

/** Guide identity is supplied by render at composition, without a UI -> render package edge. */
export type InstrumentViewState<G extends string> = Readonly<{
  selection: InstrumentSelection;
  checkedGamuts: readonly GamutId[];
  visibleGuides: readonly G[];
}>;

export type StateResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issue: StateIssue }>;
export type StateIssue = Readonly<{
  code:
    | "invalid-state-shape"
    | "invalid-selection-shape"
    | "unknown-representation"
    | "unknown-editor"
    | "editor-representation-mismatch"
    | "editor-not-admitted"
    | "invalid-checked-gamuts"
    | "unknown-gamut"
    | "invalid-visible-guides"
    | "unknown-guide";
}>;

export type SelectionFacts<E extends EditorIdentity = TechnicalEditor> = Readonly<{
  knownEditors: readonly E[];
  admittedEditors: readonly E[];
  preferredEditors: Readonly<Partial<Record<RepresentationId, E["id"]>>>;
}>;

/** Current technical inventory happens to match product admission. Future callers supply both separately. */
export const currentSelectionFacts: SelectionFacts = Object.freeze({
  knownEditors: currentPrimaryEditors,
  admittedEditors: currentPrimaryEditors,
  preferredEditors: Object.freeze({ ...currentEditorByView }),
});

const currentGamutIds = Object.freeze([
  "display-p3-gamut",
  "srgb-gamut",
] as const satisfies readonly GamutId[]);

/** Migration evidence for v0.3's unconditional two exact checks. No analysis is performed. */
export const legacyCheckedGamuts: readonly GamutId[] = currentGamutIds;

function record(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

function failure(code: StateIssue["code"]): StateResult<never> {
  return Object.freeze({ ok: false, issue: Object.freeze({ code }) });
}

export function validateSelection(input: unknown): StateResult<InstrumentSelection>;
export function validateSelection<E extends EditorIdentity>(
  input: unknown,
  facts: SelectionFacts<E>,
): StateResult<InstrumentSelection<E>>;
export function validateSelection(
  input: unknown,
  facts: SelectionFacts<EditorIdentity> = currentSelectionFacts,
): StateResult<Readonly<{ representationId: RepresentationId; editorId: string | null }>> {
  if (!record(input, ["representationId", "editorId"])) return failure("invalid-selection-shape");
  const { representationId, editorId } = input;
  if (typeof representationId !== "string" || !Object.hasOwn(representationUi, representationId))
    return failure("unknown-representation");
  if (editorId !== null) {
    if (typeof editorId !== "string") return failure("invalid-selection-shape");
    const editor = facts.knownEditors.find((candidate) => candidate.id === editorId);
    if (!editor) return failure("unknown-editor");
    if (editor.representationId !== representationId)
      return failure("editor-representation-mismatch");
    if (!facts.admittedEditors.some((candidate) => candidate.id === editorId))
      return failure("editor-not-admitted");
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze({ representationId: representationId as RepresentationId, editorId }),
  });
}

/** Initialization choice only. Valid explicit null selections are never passed through this helper. */
export function defaultSelection(representationId: RepresentationId): InstrumentSelection;
export function defaultSelection<E extends EditorIdentity>(
  representationId: RepresentationId,
  facts: SelectionFacts<E>,
): InstrumentSelection<E>;
export function defaultSelection(
  representationId: RepresentationId,
  facts: SelectionFacts<EditorIdentity> = currentSelectionFacts,
): Readonly<{ representationId: RepresentationId; editorId: string | null }> {
  const preferred = facts.preferredEditors[representationId];
  const editorId =
    preferred !== undefined &&
    facts.admittedEditors.some(
      (editor) => editor.id === preferred && editor.representationId === representationId,
    )
      ? preferred
      : null;
  return Object.freeze({ representationId, editorId });
}

/** The only current-view conversion; render retains its separate presentation bridge. */
export function selectionFromCurrentView(
  view: keyof typeof currentEditorByView,
): InstrumentSelection {
  return Object.freeze({
    representationId: view,
    editorId: currentEditorByView[view],
  }) as InstrumentSelection;
}

function canonicalIds<Id extends string>(
  input: unknown,
  known: readonly Id[],
  malformed: StateIssue["code"],
  unknown: StateIssue["code"],
): StateResult<readonly Id[]> {
  if (!Array.isArray(input)) return failure(malformed);
  const seen = new Set<Id>();
  for (const id of input as unknown[]) {
    if (typeof id !== "string") return failure(malformed);
    if (!known.includes(id as Id)) return failure(unknown);
    seen.add(id as Id);
  }
  return Object.freeze({
    ok: true,
    value: Object.freeze([...seen].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))),
  });
}

export function canonicalCheckedGamuts(input: unknown): StateResult<readonly GamutId[]> {
  return canonicalIds(input, currentGamutIds, "invalid-checked-gamuts", "unknown-gamut");
}

export function canonicalVisibleGuides<G extends string>(
  input: unknown,
  knownGuides: readonly G[],
): StateResult<readonly G[]> {
  return canonicalIds(input, knownGuides, "invalid-visible-guides", "unknown-guide");
}

/** Full boundary validation: a bad dimension never yields a partial accepted state. */
export function validateInstrumentViewState<G extends string>(
  input: unknown,
  knownGuides: readonly G[],
): StateResult<InstrumentViewState<G>> {
  if (!record(input, ["selection", "checkedGamuts", "visibleGuides"]))
    return failure("invalid-state-shape");
  const selection = validateSelection(input.selection);
  if (!selection.ok) return selection;
  const checkedGamuts = canonicalCheckedGamuts(input.checkedGamuts);
  if (!checkedGamuts.ok) return checkedGamuts;
  const visibleGuides = canonicalVisibleGuides(input.visibleGuides, knownGuides);
  if (!visibleGuides.ok) return visibleGuides;
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      selection: selection.value,
      checkedGamuts: checkedGamuts.value,
      visibleGuides: visibleGuides.value,
    }),
  });
}

export function selectionsEqual(
  a: Readonly<{ representationId: RepresentationId; editorId: string | null }>,
  b: Readonly<{ representationId: RepresentationId; editorId: string | null }>,
): boolean {
  return a.representationId === b.representationId && a.editorId === b.editorId;
}

export function instrumentViewStatesEqual<G extends string>(
  a: InstrumentViewState<G>,
  b: InstrumentViewState<G>,
): boolean {
  return (
    selectionsEqual(a.selection, b.selection) &&
    a.checkedGamuts.length === b.checkedGamuts.length &&
    a.checkedGamuts.every((id, index) => id === b.checkedGamuts[index]) &&
    a.visibleGuides.length === b.visibleGuides.length &&
    a.visibleGuides.every((id, index) => id === b.visibleGuides[index])
  );
}
