import type { GamutId } from "@gamut-plane/core";
import type {
  EditorDefinition,
  RepresentationDefinition,
} from "@gamut-plane/core/internal/capabilities";
import { currentPrimaryEditors, preferredEditors, representationUi } from "./instrumentMetadata.js";

export type RepresentationId = RepresentationDefinition["id"];
type EditorIdentity = Readonly<{ id: string; representationId: RepresentationId }>;
type TechnicalEditorIdentity = {
  [E in EditorDefinition as E["id"]]: Pick<E, "id" | "representationId">;
}[EditorDefinition["id"]];
type ProductEditor = (typeof currentPrimaryEditors)[number] extends infer E
  ? E extends EditorIdentity
    ? Pick<E, "id" | "representationId">
    : never
  : never;

/** The pair is correlated for known editors; null deliberately permits inspection only. */
export type InstrumentSelection<E extends EditorIdentity = ProductEditor> = {
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
  referenceGamutId: GamutId | null;
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
    | "unknown-guide"
    | "reference-not-admitted";
}>;

export type SelectionFacts<E extends EditorIdentity = ProductEditor> = Readonly<{
  knownEditors: readonly E[];
  admittedEditors: readonly E[];
  preferredEditors: Readonly<Partial<Record<RepresentationId, E["id"]>>>;
}>;

/** Identity-only validation facts keep UI runtime independent of core math and render. */
const knownEditors: readonly TechnicalEditorIdentity[] = Object.freeze([
  Object.freeze({ id: "oklch-lc", representationId: "oklch" }),
  Object.freeze({ id: "oklab-ab", representationId: "oklab" }),
  Object.freeze({ id: "srgb-rg", representationId: "srgb" }),
  Object.freeze({ id: "srgb-rb", representationId: "srgb" }),
  Object.freeze({ id: "srgb-gb", representationId: "srgb" }),
  Object.freeze({ id: "display-p3-rg", representationId: "display-p3" }),
  Object.freeze({ id: "display-p3-rb", representationId: "display-p3" }),
  Object.freeze({ id: "display-p3-gb", representationId: "display-p3" }),
]);
export const currentSelectionFacts = Object.freeze({
  knownEditors,
  admittedEditors: currentPrimaryEditors,
  preferredEditors,
} satisfies SelectionFacts<TechnicalEditorIdentity>);

const currentGamutIds = Object.freeze([
  "display-p3-gamut",
  "srgb-gamut",
] as const satisfies readonly GamutId[]);

/** Product admission, deliberately separate from the technical gamut inventory. */
export const admittedReferenceGamuts = Object.freeze([
  "srgb-gamut",
  "display-p3-gamut",
] as const satisfies readonly GamutId[]);

export function validateReferenceGamut(input: unknown): StateResult<GamutId | null> {
  if (input === null) return Object.freeze({ ok: true, value: null });
  const admitted = admittedReferenceGamuts.find((id) => id === input);
  return admitted === undefined
    ? failure("reference-not-admitted")
    : Object.freeze({ ok: true, value: admitted });
}

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

export function admittedEditorsForRepresentation<E extends EditorIdentity>(
  representationId: RepresentationId,
  facts: SelectionFacts<E>,
): readonly E[] {
  return facts.admittedEditors.filter((editor) => editor.representationId === representationId);
}

export function currentAdmittedEditorsForRepresentation(
  representationId: RepresentationId,
): readonly ProductEditor[] {
  return currentSelectionFacts.admittedEditors.filter(
    (editor) => editor.representationId === representationId,
  );
}

/** An explicit editor choice is independent of the default/preferred editor. */
export function requestEditor<E extends EditorIdentity>(
  representationId: RepresentationId,
  editorId: E["id"],
  facts: SelectionFacts<E>,
): StateResult<InstrumentSelection<E>> {
  return validateSelection({ representationId, editorId }, facts);
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
  if (!record(input, ["selection", "checkedGamuts", "visibleGuides", "referenceGamutId"]))
    return failure("invalid-state-shape");
  const selection = validateSelection(input.selection);
  if (!selection.ok) return selection;
  const checkedGamuts = canonicalCheckedGamuts(input.checkedGamuts);
  if (!checkedGamuts.ok) return checkedGamuts;
  const visibleGuides = canonicalVisibleGuides(input.visibleGuides, knownGuides);
  if (!visibleGuides.ok) return visibleGuides;
  const reference = validateReferenceGamut(input.referenceGamutId);
  if (!reference.ok) return reference;
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      selection: selection.value,
      checkedGamuts: checkedGamuts.value,
      visibleGuides: visibleGuides.value,
      referenceGamutId: reference.value,
    }),
  });
}

export function selectionsEqual(
  a: Readonly<{ representationId: RepresentationId; editorId: string | null }>,
  b: Readonly<{ representationId: RepresentationId; editorId: string | null }>,
): boolean {
  return a.representationId === b.representationId && a.editorId === b.editorId;
}

/** Interaction ownership changes with an editor even when representation and color do not. */
export function semanticContextKey(
  selection: Readonly<{ representationId: string; editorId: string | null }>,
): string {
  return `${selection.representationId}:${selection.editorId ?? "none"}`;
}

export function instrumentViewStatesEqual<G extends string>(
  a: InstrumentViewState<G>,
  b: InstrumentViewState<G>,
): boolean {
  return (
    selectionsEqual(a.selection, b.selection) &&
    a.referenceGamutId === b.referenceGamutId &&
    a.checkedGamuts.length === b.checkedGamuts.length &&
    a.checkedGamuts.every((id, index) => id === b.checkedGamuts[index]) &&
    a.visibleGuides.length === b.visibleGuides.length &&
    a.visibleGuides.every((id, index) => id === b.visibleGuides[index])
  );
}
