import type {
  ColorRepresentation,
  ColorResult,
  ColorValue,
  ConversionError,
} from "@gamut-plane/core";
import type { EditorVisualSupport, FieldResolution } from "../capabilities/editorResolution.js";
import type { GuideResolution } from "../capabilities/guideResolution.js";
import { geometryToSvgPath } from "../geometry.js";
import { currentField, type CurrentField } from "./field.js";
import {
  currentEditableDetail,
  currentOklchObservation,
  currentRgbEditableDetail,
} from "./editableDetail.js";
import { oklabCoordinateIntervals } from "./oklabCoordinateIntervals.js";
import { nativeSelfBoundary } from "./nativeBoundary.js";

type DisplayInterval = Readonly<import("../channelGeometry.js").LinearControlInterval>;
export interface GeneralizedGuideDisplay {
  readonly rgbIntervals: Readonly<Record<"r" | "g" | "b", readonly DisplayInterval[]>>;
  /** The OKLab a/b sliders' gamut intervals; empty unless OKLab detail is supplied. */
  readonly oklabIntervals: Readonly<Record<"a" | "b", readonly DisplayInterval[]>>;
  readonly srgbPath: string | null;
  readonly displayP3Path: string | null;
  readonly hueIntervals: readonly Readonly<{
    start: number;
    end: number;
    tone: "srgb" | "display-p3";
  }>[];
  readonly lightnessIntervals: readonly Readonly<{
    start: number;
    end: number;
    tone: "srgb" | "display-p3";
  }>[];
  readonly chromaIntervals: readonly Readonly<{
    start: number;
    end: number;
    tone: "srgb" | "display-p3";
  }>[];
}

/**
 * Only available guide forms reach visual serialization; requested failures stay in the revision.
 * The OKLab a/b intervals also need the editable detail, whose direct ranges position them.
 */
export function generalizedGuideDisplay(
  guides: readonly GuideResolution[],
  visual?: GeneralizedEditableDetail,
): GeneralizedGuideDisplay {
  const display: {
    rgbIntervals: Record<"r" | "g" | "b", DisplayInterval[]>;
    oklabIntervals: Readonly<Record<"a" | "b", readonly DisplayInterval[]>>;
    srgbPath: string | null;
    displayP3Path: string | null;
    hueIntervals: { start: number; end: number; tone: "srgb" | "display-p3" }[];
    lightnessIntervals: { start: number; end: number; tone: "srgb" | "display-p3" }[];
    chromaIntervals: { start: number; end: number; tone: "srgb" | "display-p3" }[];
  } = {
    rgbIntervals: { r: [], g: [], b: [] },
    oklabIntervals: { a: [], b: [] },
    srgbPath: null,
    displayP3Path: null,
    hueIntervals: [],
    lightnessIntervals: [],
    chromaIntervals: [],
  };
  for (const [id, tone] of [
    ["display-p3-boundary", "display-p3"],
    ["srgb-boundary", "srgb"],
  ] as const) {
    const row = guides.find((candidate) => candidate.guideId === id);
    if (!row || row.kind !== "resolved") continue;
    const { forms } = row;
    if (
      forms.contour.kind === "available" &&
      id !== nativeSelfBoundary(visual?.kind === "available" ? visual.field : null)
    ) {
      const path = geometryToSvgPath(forms.contour.value.points, forms.contour.value.closed);
      if (id === "srgb-boundary") display.srgbPath = path || null;
      else display.displayP3Path = path || null;
    }
    if (forms.kind === "rgb") {
      for (const channel of ["r", "g", "b"] as const) {
        const result = forms.channels[channel].result;
        if (result.kind === "available" && result.value.interval !== null)
          display.rgbIntervals[channel].push({
            ...result.value.interval,
            tone,
            ...(result.value.interval.start === result.value.interval.end
              ? { point: true as const }
              : {}),
          });
      }
      continue;
    }
    if (forms.hueIntervals?.kind === "available")
      display.hueIntervals.push(
        ...forms.hueIntervals.value.map((interval) => ({ ...interval, tone })),
      );
    if (forms.lightnessIntervals.kind === "available")
      display.lightnessIntervals.push(
        ...forms.lightnessIntervals.value.map((interval) => ({ ...interval, tone })),
      );
    if (forms.chromaIntervals.kind === "available")
      display.chromaIntervals.push(
        ...forms.chromaIntervals.value.map((interval) => ({ ...interval, tone })),
      );
  }
  if (visual?.kind === "available" && visual.detail.view === "oklab")
    display.oklabIntervals = oklabCoordinateIntervals(
      guides,
      visual.field.projection.representation.channels,
      visual.detail.coordinates,
    );
  return display;
}

export type GeneralizedEditableDetail =
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{
      kind: "available";
      field: CurrentField;
      oklch: ColorRepresentation<"oklch">;
      detail: ReturnType<typeof currentEditableDetail>;
    }>
  | Readonly<{
      kind: "available";
      field: CurrentField;
      oklch: null;
      detail: ReturnType<typeof currentRgbEditableDetail>;
    }>;

/** Current visuals are optional in generalized mode; the accepted facts remain available. */
export function generalizedEditableDetail(
  source: ColorValue,
  observation: ColorResult<ColorRepresentation, ConversionError>,
  editor: EditorVisualSupport,
  field: FieldResolution,
): GeneralizedEditableDetail {
  if (field.kind !== "available") return { kind: "unavailable" };
  const current = currentField(editor, field);
  if (
    current.projection.representationId === "srgb" ||
    current.projection.representationId === "display-p3"
  ) {
    if (
      !observation.ok ||
      (observation.value.space !== "srgb" && observation.value.space !== "display-p3") ||
      observation.value.space !== current.projection.representationId
    )
      return { kind: "unavailable" };
    return {
      kind: "available",
      field: current,
      oklch: null,
      detail: currentRgbEditableDetail(observation.value),
    };
  }
  try {
    const oklch = currentOklchObservation(source, observation);
    return {
      kind: "available",
      field: current,
      oklch,
      detail: currentEditableDetail(current, oklch),
    };
  } catch (error) {
    if (error instanceof RangeError) return { kind: "unavailable" };
    throw error;
  }
}
