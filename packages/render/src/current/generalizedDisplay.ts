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
import { currentEditableDetail, currentOklchObservation } from "./editableDetail.js";
import type { CurrentGuideDisplay } from "./guideDisplay.js";

/** Only available guide forms reach visual serialization; requested failures stay in the revision. */
export function generalizedGuideDisplay(guides: readonly GuideResolution[]): CurrentGuideDisplay {
  const display: {
    srgbPath: string | null;
    displayP3Path: string | null;
    hueIntervals: { start: number; end: number; tone: "srgb" | "display-p3" }[];
    lightnessIntervals: { start: number; end: number; tone: "srgb" | "display-p3" }[];
    chromaIntervals: { start: number; end: number; tone: "srgb" | "display-p3" }[];
  } = {
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
    if (forms.contour.kind === "available") {
      const path = geometryToSvgPath(forms.contour.value.points, forms.contour.value.closed);
      if (id === "srgb-boundary") display.srgbPath = path;
      else display.displayP3Path = path;
    }
    if (forms.hueIntervals?.kind === "available")
      display.hueIntervals.push(
        ...forms.hueIntervals.value.map((interval) => ({ ...interval, tone })),
      );
    if (forms.lightnessIntervals.kind === "available")
      display.lightnessIntervals.push(
        ...forms.lightnessIntervals.value.map((interval) => ({ ...interval, tone })),
      );
    if (row.support.editorId === "oklch-lc" && forms.chromaIntervals.kind === "available")
      display.chromaIntervals.push(
        ...forms.chromaIntervals.value.map((interval) => ({ ...interval, tone })),
      );
  }
  return display;
}

export type GeneralizedEditableDetail =
  | Readonly<{ kind: "unavailable" }>
  | Readonly<{
      kind: "available";
      field: CurrentField;
      oklch: ColorRepresentation<"oklch">;
      detail: ReturnType<typeof currentEditableDetail>;
    }>;

/** Current visuals are optional in generalized mode; the accepted facts remain available. */
export function generalizedEditableDetail(
  source: ColorValue,
  observation: ColorResult<ColorRepresentation, ConversionError>,
  editor: EditorVisualSupport,
  field: FieldResolution,
): GeneralizedEditableDetail {
  if (field.kind !== "available") return { kind: "unavailable" };
  const current = currentField(field.projection.plane, editor, field);
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
