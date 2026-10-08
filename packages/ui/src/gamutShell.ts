import type { GamutId } from "@gamut-plane/core";
import type { GamutCheckResult } from "@gamut-plane/core/internal/capabilities";
import {
  exactGamutUi,
  exactResultOrder,
  exactStatusCopy,
  generalizedCopy,
  requestCheckedGamut,
  requestReferenceGamut,
  requestVisibleGuide,
} from "./generalizedInstrument.js";
import { admittedReferenceGamuts, type InstrumentViewState } from "./instrumentState.js";

export type ExactStatus = keyof typeof exactStatusCopy;
/** "off" is configuration: an unrequested gamut never presents a retained or inferred result. */
export type GamutStatus = ExactStatus | "off";

export type GamutRow<G extends string> = Readonly<{
  gamutId: GamutId;
  label: string;
  guideId: G;
  checked: boolean;
  status: GamutStatus;
  boundary: boolean;
  /** A retained Boundary request that the current view cannot draw. */
  boundaryPaused: boolean;
}>;

export type GamutSummary = Readonly<{
  reference: Readonly<{ gamutId: GamutId; label: string; status: GamutStatus }> | null;
  /** Explicitly requested exact Outside results not already represented by the Reference. */
  outside: number;
  requested: number;
}>;

export type GamutAction<G extends string> =
  | Readonly<{ kind: "status"; gamutId: GamutId; requested: boolean }>
  | Readonly<{ kind: "boundary"; guideId: G; requested: boolean }>
  | Readonly<{ kind: "reference"; gamutId: GamutId | null }>;

type ComparisonState = Pick<InstrumentViewState<string>, "checkedGamuts" | "referenceGamutId">;
type GuideAvailability<G extends string> = Readonly<{
  guideId: G;
  kind: string;
  forms?: Readonly<{ contour: Readonly<{ kind: string }> }>;
}>;

/** Only an explicit request can produce a status; a missing or failed row is never promoted. */
export function requestedGamutStatus(
  checkedGamuts: readonly GamutId[],
  checks: readonly GamutCheckResult[],
  gamutId: GamutId,
): GamutStatus {
  if (!checkedGamuts.includes(gamutId)) return "off";
  const check = checks.find((row) => row.gamutId === gamutId);
  return check?.result.ok ? check.result.value.status : "unavailable";
}

export function gamutStatusCopy(status: GamutStatus): string {
  return status === "off" ? generalizedCopy.statusOff : exactStatusCopy[status];
}

/** Requested guides the current view cannot draw. The requests themselves are retained. */
export function pausedGuideIds<G extends string>(
  guides: readonly GuideAvailability<G>[],
  drawing: boolean,
): readonly G[] {
  return Object.freeze(
    guides
      .filter(
        (guide) =>
          !drawing || guide.kind !== "resolved" || guide.forms?.contour.kind !== "available",
      )
      .map((guide) => guide.guideId),
  );
}

/** Grouped by gamut in product display order; the render-owned guide mapping is supplied. */
export function gamutRows<G extends string>(
  state: InstrumentViewState<G>,
  checks: readonly GamutCheckResult[],
  guideFor: Readonly<Record<(typeof exactResultOrder)[number], G>>,
  pausedGuides: readonly G[] = [],
): readonly GamutRow<G>[] {
  return Object.freeze(
    exactResultOrder.map((gamutId) => {
      const guideId = guideFor[gamutId];
      const boundary = state.visibleGuides.includes(guideId);
      return Object.freeze({
        gamutId,
        label: exactGamutUi[gamutId].label,
        guideId,
        checked: state.checkedGamuts.includes(gamutId),
        status: requestedGamutStatus(state.checkedGamuts, checks, gamutId),
        boundary,
        boundaryPaused: boundary && pausedGuides.includes(guideId),
      });
    }),
  );
}

/** Reference-first closed summary. Unrequested gamuts are neither counted nor presumed inside. */
export function gamutSummary(
  state: ComparisonState,
  checks: readonly GamutCheckResult[],
): GamutSummary {
  const reference = state.referenceGamutId;
  const status = (gamutId: GamutId) => requestedGamutStatus(state.checkedGamuts, checks, gamutId);
  return Object.freeze({
    reference:
      reference === null
        ? null
        : Object.freeze({
            gamutId: reference,
            label: exactGamutUi[reference].label,
            status: status(reference),
          }),
    outside: exactResultOrder.filter((id) => id !== reference && status(id) === "outside").length,
    requested: exactResultOrder.filter((id) => state.checkedGamuts.includes(id)).length,
  });
}

export function gamutSummaryCopy(summary: GamutSummary) {
  const status: GamutStatus | null = summary.reference
    ? summary.reference.status
    : summary.requested === 0
      ? "off"
      : null;
  const reference = summary.reference ? generalizedCopy.reference : generalizedCopy.noReference;
  const target = summary.reference?.label ?? null;
  const statusText = status === null ? null : gamutStatusCopy(status);
  const outside =
    summary.outside === 0
      ? null
      : `${summary.outside} ${summary.reference ? "other outside" : "outside"}`;
  return Object.freeze({
    reference,
    target,
    status,
    statusText,
    outside,
    /** One punctuated sentence for assistive technology; the visible parts stay terse. */
    description: [
      [[reference, target].filter(Boolean).join(" "), statusText].filter(Boolean).join(", "),
      outside,
    ]
      .filter(Boolean)
      .join(". "),
  });
}

/** Closed disclosure exposes exceptional accepted facts without a second information panel. */
export function gamutDisclosureCopy<G extends string>(
  state: InstrumentViewState<G>,
  checks: readonly GamutCheckResult[],
  paused: readonly G[],
) {
  const summary = gamutSummary(state, checks);
  const copy = gamutSummaryCopy(summary);
  const outside = summary.outside + (summary.reference?.status === "outside" ? 1 : 0);
  const pausedCount = state.visibleGuides.filter((id) => paused.includes(id)).length;
  const unavailable = exactResultOrder.filter(
    (id) => requestedGamutStatus(state.checkedGamuts, checks, id) === "unavailable",
  );
  const status =
    outside > 0
      ? "outside"
      : unavailable.length > 0
        ? "unavailable"
        : (summary.reference?.status ?? (summary.requested === 0 ? "off" : undefined));
  const cue =
    outside > 0
      ? outside === 1 && summary.reference?.status === "outside"
        ? `Outside ${summary.reference.label}`
        : `${outside} outside`
      : status === "unavailable" || status === "off"
        ? gamutStatusCopy(status)
        : null;
  const details = [
    ...unavailable
      .filter((id) => id !== summary.reference?.gamutId)
      .map((id) => `${exactGamutUi[id].label} unavailable`),
    pausedCount > 0
      ? `${pausedCount} requested ${pausedCount === 1 ? "boundary" : "boundaries"} paused`
      : null,
  ].filter(Boolean);
  return {
    cue:
      [cue, pausedCount > 0 ? generalizedCopy.boundaryPaused : null].filter(Boolean).join(" · ") ||
      null,
    status,
    description: copy.description + (details.length > 0 ? `. ${details.join(". ")}.` : ""),
  };
}

/** One mutually exclusive choice, including the explicit absence of a Reference. */
export function referenceChoices(referenceGamutId: GamutId | null) {
  return Object.freeze([
    ...admittedReferenceGamuts.map((gamutId) =>
      Object.freeze({
        value: gamutId as string,
        gamutId: gamutId as GamutId | null,
        label: exactGamutUi[gamutId].label,
        selected: referenceGamutId === gamutId,
      }),
    ),
    Object.freeze({
      value: "none",
      gamutId: null,
      label: generalizedCopy.referenceNone,
      selected: referenceGamutId === null,
    }),
  ]);
}

/** Full accessible explanation for the terse visible "Paused" state. */
export function boundaryPausedCopy(selection: Readonly<{ editorId: string | null }>): string {
  return `${generalizedCopy.boundaryPaused}: ${
    selection.editorId === null ? generalizedCopy.guidesPending : generalizedCopy.guidesUnavailable
  }`;
}

/** The single accepted-state route for the inspector and plane accelerator; no coupling. */
export function requestGamutAction<G extends string>(
  state: InstrumentViewState<G>,
  action: GamutAction<G>,
  knownGuides: readonly G[],
): InstrumentViewState<G> {
  if (action.kind === "status") return requestCheckedGamut(state, action.gamutId, action.requested);
  if (action.kind === "boundary")
    return requestVisibleGuide(state, action.guideId, action.requested, knownGuides);
  return requestReferenceGamut(state, action.gamutId);
}

/** Same close glyph geometry in native Vue/React markup. */
export const gamutCloseGlyphPath = "M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5";
