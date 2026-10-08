import {
  OKLCH_PICKER_MAX_CHROMA,
  represent,
  type ColorValue,
  type ConversionError,
  type DisplayGamut,
  type HueGuideInterval,
  type LightnessGuideInterval,
  type OklchSample,
  type PickerGuide,
} from "@gamut-plane/core";
import type { EditorId } from "@gamut-plane/core/internal/capabilities";
import type { TracedGuide } from "../perceptualGuides.js";
import type { EditorVisualSupport } from "./editorResolution.js";
import { guideDefinitions, guideSupport, type GuideId, type GuideSupport } from "./guideSupport.js";

import {
  rgbGamutSlice,
  rgbChannelIntervals,
  rgbAxisIndices,
  type RgbContour,
  type RgbGeometry,
  type RgbInterval,
} from "../rgbGuides.js";

type GuideValueIssue =
  | Readonly<{ reason: "numerical-failure" | "approximation-budget" }>
  | Readonly<{ reason: "observation-failed"; error: ConversionError }>
  | Readonly<{ reason: "lightness-out-of-range"; lightness: number }>;

export type GuideFormResult<T> =
  | Readonly<{ kind: "available"; value: T }>
  | (Readonly<{ kind: "value-unavailable" }> & GuideValueIssue);

export interface PerceptualGuideForms {
  readonly kind: "perceptual";
  readonly contour: GuideFormResult<Readonly<{ points: Float32Array; closed: boolean }>>;
  /** Null is structural absence, not a failed observation or an empty successful interval set. */
  readonly hueIntervals: GuideFormResult<readonly HueGuideInterval[]> | null;
  readonly lightnessIntervals: GuideFormResult<readonly LightnessGuideInterval[]>;
  readonly chromaIntervals: GuideFormResult<readonly Readonly<{ start: number; end: number }>[]>;
  readonly reference: GuideFormResult<PickerGuide>;
}

export type RgbResolvedGuideForms = {
  [G in RgbGeometry as G["id"]]: Readonly<{
    kind: "rgb";
    geometry: G;
    contour: GuideFormResult<RgbContour>;
    channels: {
      readonly [C in "r" | "g" | "b"]: Readonly<{
        channelId: `${G["representationId"]}.${C}`;
        result: GuideFormResult<RgbInterval>;
      }>;
    };
    reference: GuideFormResult<PickerGuide>;
  }>;
}[RgbGeometry["id"]];
export type ResolvedGuideForms = PerceptualGuideForms | RgbResolvedGuideForms;

export type GuideResolution = Readonly<{ guideId: GuideId }> &
  (
    | Readonly<{ kind: "no-editor" | "no-guide-for-editor" }>
    | Readonly<{ kind: "resolved"; support: GuideSupport; forms: ResolvedGuideForms }>
  );

function available<T>(value: T): GuideFormResult<T> {
  return { kind: "available", value };
}

/** Chroma as a fraction of the Chroma control's 0 to 0.4 span. */
function chromaFraction(chroma: number): number {
  return Math.min(1, Math.max(0, chroma / OKLCH_PICKER_MAX_CHROMA));
}

/** A traced contour, or the honest failure when its bounded work could not meet the contract. */
function tracedContour(
  contour: Readonly<{
    build: (gamut: DisplayGamut, fixed: number) => TracedGuide;
    closed: boolean;
  }>,
  gamut: DisplayGamut,
  fixed: GuideFormResult<number>,
): GuideFormResult<Readonly<{ points: Float32Array; closed: boolean }>> {
  if (fixed.kind !== "available") return fixed;
  const traced = contour.build(gamut, fixed.value);
  return typeof traced === "string"
    ? { kind: "value-unavailable", reason: traced }
    : available({ points: traced, closed: contour.closed });
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

/**
 * Retains every validated request in supplied order. Static support, each form's prerequisites,
 * and sampled references are independent. No analysis, admission, or request canonicalization.
 */
export function resolveRequestedGuides(
  value: ColorValue,
  editor: EditorVisualSupport,
  requested: readonly GuideId[],
): readonly GuideResolution[] {
  if (requested.length === 0) return [];
  if (editor.kind === "no-editor-requested") {
    return requested.map((guideId) => ({ guideId, kind: "no-editor" }));
  }
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
    if (editor.kind === "editor" && editor.geometry.domain.kind === "disc") {
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
    const guide = guideDefinitions[guideId];
    const { table } = guide;

    const coordinates = getSample();
    const lightness =
      coordinates.kind === "available" ? boundedLightness(coordinates.value.l) : coordinates;
    const reference: GuideFormResult<PickerGuide> =
      coordinates.kind !== "available"
        ? coordinates
        : lightness.kind !== "available"
          ? lightness
          : available(support.forms.reference(coordinates.value, guide));
    if (support.forms.kind === "rgb") {
      const geometry = support.forms.geometry;
      const observed = represent(value, geometry.representationId);
      const target = guideId === "srgb-boundary" ? "srgb" : "display-p3";
      const unavailable = observed.ok
        ? null
        : {
            kind: "value-unavailable" as const,
            reason: "observation-failed" as const,
            error: observed.error,
          };
      return {
        guideId,
        kind: "resolved",
        support,
        forms: {
          kind: "rgb",
          geometry,
          contour: observed.ok
            ? rgbGamutSlice(
                geometry,
                target,
                observed.value.channels[rgbAxisIndices(geometry).fixed],
              )
            : unavailable!,
          channels: observed.ok
            ? rgbChannelIntervals(observed.value, target)
            : {
                r: { channelId: `${geometry.representationId}.r`, result: unavailable! },
                g: { channelId: `${geometry.representationId}.g`, result: unavailable! },
                b: { channelId: `${geometry.representationId}.b`, result: unavailable! },
              },
          reference,
          // Observation and qualified channels were constructed from this exact geometry above.
        } as RgbResolvedGuideForms,
      };
    }
    const fixed = getContourFixed();
    return {
      guideId,
      kind: "resolved",
      support,
      forms: {
        kind: "perceptual",
        contour: tracedContour(support.forms.contour, table.gamut, fixed),
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
          reference.kind !== "available"
            ? reference
            : coordinates.kind !== "available"
              ? coordinates
              : available(
                  support.forms
                    .chromaIntervals(coordinates.value.l, coordinates.value.h, table.gamut)
                    .map((interval) => ({
                      start: chromaFraction(interval.start),
                      end: chromaFraction(interval.end),
                    })),
                ),
        reference,
      },
    };
  });
}
