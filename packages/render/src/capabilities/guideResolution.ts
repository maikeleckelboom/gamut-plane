import {
  OKLCH_PICKER_MAX_CHROMA,
  represent,
  type ColorValue,
  type ConversionError,
  type GamutAnalysisError,
  type GamutStatus,
  type HueGuideInterval,
  type LightnessGuideInterval,
  type OklchSample,
  type PickerGuide,
  type PlanePoint,
} from "@gamut-plane/core";
import type { EditorId, GamutCheckResult } from "@gamut-plane/core/internal/capabilities";
import type { EditorVisualSupport } from "./editorResolution.js";
import { guideDefinitions, guideSupport, type GuideId, type GuideSupport } from "./guideSupport.js";

type GuideValueIssue =
  | Readonly<{ reason: "observation-failed"; error: ConversionError }>
  | Readonly<{ reason: "lightness-out-of-range"; lightness: number }>;

export type GuideFormResult<T> =
  | Readonly<{ kind: "available"; value: T }>
  | (Readonly<{ kind: "value-unavailable" }> & GuideValueIssue);

export type GuideMarkerResult =
  | GuideFormResult<PlanePoint>
  | Readonly<{ kind: "check-not-requested" }>
  | Readonly<{ kind: "exact-not-outside"; status: Exclude<GamutStatus, "outside"> }>
  | Readonly<{ kind: "exact-unavailable"; error: GamutAnalysisError }>;

export interface ResolvedGuideForms {
  readonly contour: GuideFormResult<Readonly<{ points: Float32Array; closed: boolean }>>;
  /** Null is structural absence, not a failed observation or an empty successful interval set. */
  readonly hueIntervals: GuideFormResult<readonly HueGuideInterval[]> | null;
  readonly lightnessIntervals: GuideFormResult<readonly LightnessGuideInterval[]>;
  readonly chromaIntervals: GuideFormResult<readonly Readonly<{ start: number; end: number }>[]>;
  readonly reference: GuideFormResult<PickerGuide>;
  readonly targetMarker: GuideMarkerResult;
}

export type GuideResolution = Readonly<{ guideId: GuideId }> &
  (
    | Readonly<{ kind: "no-editor" | "no-field" | "no-guide-for-editor" }>
    | Readonly<{ kind: "resolved"; support: GuideSupport; forms: ResolvedGuideForms }>
  );

function available<T>(value: T): GuideFormResult<T> {
  return { kind: "available", value };
}

function boundedLightness(lightness: number): GuideFormResult<number> {
  return lightness < 0 || lightness > 1
    ? { kind: "value-unavailable", reason: "lightness-out-of-range", lightness }
    : available(lightness);
}

/** Observes only the requested forms' common sampled coordinates; never constructs a ColorValue. */
function guideSample(value: ColorValue): GuideFormResult<OklchSample> {
  const observed = represent(value, "oklch");
  if (!observed.ok) {
    return { kind: "value-unavailable", reason: "observation-failed", error: observed.error };
  }
  const [l, c, h] = observed.value.channels;
  return available({ l, c, h: h ?? 0, alpha: observed.value.alpha });
}

function targetMarker(
  guideId: GuideId,
  support: GuideSupport,
  reference: GuideFormResult<PickerGuide>,
  checks: readonly GamutCheckResult[],
): GuideMarkerResult {
  const check = checks.find((row) => row.gamutId === guideDefinitions[guideId].gamutId);
  if (!check) return { kind: "check-not-requested" };
  if (!check.result.ok) return { kind: "exact-unavailable", error: check.result.error };
  if (check.result.value.status !== "outside") {
    return { kind: "exact-not-outside", status: check.result.value.status };
  }
  if (reference.kind !== "available") return reference;
  return available(support.forms.targetMarker.position(reference.value.color));
}

/**
 * Retains every validated request in supplied order. Static support, each form's prerequisites,
 * and supplied exact truth are independent. No analysis, admission, or request canonicalization.
 */
export function resolveRequestedGuides(
  value: ColorValue,
  editor: EditorVisualSupport,
  requested: readonly GuideId[],
  checks: readonly GamutCheckResult[],
): readonly GuideResolution[] {
  if (requested.length === 0) return [];
  if (editor.kind === "no-editor-requested") {
    return requested.map((guideId) => ({ guideId, kind: "no-editor" }));
  }
  if (editor.field === null) return requested.map((guideId) => ({ guideId, kind: "no-field" }));
  const relations: Readonly<
    Partial<Record<EditorId, Readonly<Partial<Record<GuideId, GuideSupport>>>>>
  > = guideSupport;
  // Local lazy prerequisites are shared only within this call, never persisted or globally cached.
  let sample: GuideFormResult<OklchSample> | undefined;
  let contourFixed: GuideFormResult<number> | undefined;
  function getSample(): GuideFormResult<OklchSample> {
    return (sample ??= guideSample(value));
  }
  function getContourFixed(): GuideFormResult<number> {
    if (contourFixed) return contourFixed;
    if (editor.kind === "editor" && editor.geometry.planeId === "oklab") {
      const observed = represent(value, "oklab");
      contourFixed = observed.ok
        ? boundedLightness(observed.value.channels[0])
        : { kind: "value-unavailable", reason: "observation-failed", error: observed.error };
    } else {
      const observed = getSample();
      contourFixed = observed.kind === "available" ? available(observed.value.h) : observed;
    }
    return contourFixed;
  }
  return requested.map((guideId): GuideResolution => {
    const support = relations[editor.editor.id]?.[guideId];
    if (!support) return { guideId, kind: "no-guide-for-editor" };
    const table = guideDefinitions[guideId].table;
    const fixed = getContourFixed();
    const coordinates = getSample();
    const lightness =
      coordinates.kind === "available" ? boundedLightness(coordinates.value.l) : coordinates;
    const reference: GuideFormResult<PickerGuide> =
      coordinates.kind !== "available"
        ? coordinates
        : lightness.kind !== "available"
          ? lightness
          : available(support.forms.reference(coordinates.value, table));
    return {
      guideId,
      kind: "resolved",
      support,
      forms: {
        contour:
          fixed.kind === "available"
            ? available({
                points: support.forms.contour.build(table, fixed.value),
                closed: support.forms.contour.closed,
              })
            : fixed,
        hueIntervals: !support.forms.hueIntervals
          ? null
          : coordinates.kind !== "available"
            ? coordinates
            : lightness.kind !== "available"
              ? lightness
              : available(support.forms.hueIntervals(table, coordinates.value)),
        lightnessIntervals:
          coordinates.kind === "available"
            ? available(support.forms.lightnessIntervals(table, coordinates.value))
            : coordinates,
        chromaIntervals:
          reference.kind === "available"
            ? available([
                {
                  start: 0,
                  end: Math.min(
                    1,
                    Math.max(0, reference.value.maximumChroma / OKLCH_PICKER_MAX_CHROMA),
                  ),
                },
              ])
            : reference,
        reference,
        targetMarker: targetMarker(guideId, support, reference, checks),
      },
    };
  });
}
