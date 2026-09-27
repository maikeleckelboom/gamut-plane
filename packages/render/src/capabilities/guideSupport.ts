import {
  convertOklchToOklab,
  getHueGuideIntervals,
  getLightnessGuideIntervals,
  getPickerGuide,
  type GamutBoundaryTable,
  type GamutId,
  type OklchSample,
  type PickerPlaneGeometry,
  type PlanePoint,
} from "@gamut-plane/core";
import type { EditorId } from "@gamut-plane/core/internal/capabilities";
import { PICKER_GAMUT_TABLES } from "../generated/gamutTables.js";
import { fieldSupport } from "./fieldSupport.js";

export type GuideId = "srgb-boundary" | "display-p3-boundary";
export interface GuideDefinition {
  readonly id: GuideId;
  readonly gamutId: GamutId;
  readonly table: GamutBoundaryTable;
}

/** A sampled reference to a gamut, not an analyzer or proof of membership. */
export const guideDefinitions = Object.freeze({
  "srgb-boundary": Object.freeze({
    id: "srgb-boundary",
    gamutId: "srgb-gamut",
    table: PICKER_GAMUT_TABLES.srgb,
  }),
  "display-p3-boundary": Object.freeze({
    id: "display-p3-boundary",
    gamutId: "display-p3-gamut",
    table: PICKER_GAMUT_TABLES.displayP3,
  }),
} satisfies { readonly [G in GuideId]: GuideDefinition & { readonly id: G } });

interface GuideForms {
  readonly contour: Readonly<{
    build: PickerPlaneGeometry["buildGamutContour"];
    closed: boolean;
  }>;
  readonly hueIntervals: typeof getHueGuideIntervals | null;
  readonly lightnessIntervals: typeof getLightnessGuideIntervals;
  /** Produced for both views; currently displayed only by the OKLCH Chroma control. */
  readonly chromaIntervals: "oklch-maximum-chroma";
  readonly targetMarker: Readonly<{
    requires: "exact-outside";
    position: (color: OklchSample) => PlanePoint;
  }>;
  readonly reference: typeof getPickerGuide;
}

export interface GuideSupport {
  readonly guideId: GuideId;
  readonly editorId: EditorId;
  readonly forms: GuideForms;
}

const lch = fieldSupport["oklch-lc"];
const lab = fieldSupport["oklab-ab"];

function positionLchGuide(color: OklchSample): PlanePoint {
  return lch.geometry.constrain(lch.geometry.toPoint(color.l, color.c));
}

function positionLabGuide(color: OklchSample): PlanePoint {
  const coordinates = convertOklchToOklab(color);
  return lab.geometry.constrain(lab.geometry.toPoint(coordinates[1]!, coordinates[2]!));
}

const lchForms = Object.freeze({
  contour: Object.freeze({
    build: lch.plane.buildGamutContour,
    closed: lch.plane.gamutContourClosed,
  }),
  hueIntervals: getHueGuideIntervals,
  lightnessIntervals: getLightnessGuideIntervals,
  chromaIntervals: "oklch-maximum-chroma",
  targetMarker: Object.freeze({ requires: "exact-outside", position: positionLchGuide }),
  reference: getPickerGuide,
} satisfies GuideForms);

const labForms = Object.freeze({
  contour: Object.freeze({
    build: lab.plane.buildGamutContour,
    closed: lab.plane.gamutContourClosed,
  }),
  hueIntervals: null,
  lightnessIntervals: getLightnessGuideIntervals,
  chromaIntervals: "oklch-maximum-chroma",
  targetMarker: Object.freeze({ requires: "exact-outside", position: positionLabGuide }),
  reference: getPickerGuide,
} satisfies GuideForms);

/** Only the four current editor/guide combinations. Visibility remains separate v0.3 state. */
export const guideSupport = Object.freeze({
  "oklch-lc": Object.freeze({
    "srgb-boundary": Object.freeze({
      guideId: "srgb-boundary",
      editorId: lch.editorId,
      forms: lchForms,
    }),
    "display-p3-boundary": Object.freeze({
      guideId: "display-p3-boundary",
      editorId: lch.editorId,
      forms: lchForms,
    }),
  }),
  "oklab-ab": Object.freeze({
    "srgb-boundary": Object.freeze({
      guideId: "srgb-boundary",
      editorId: lab.editorId,
      forms: labForms,
    }),
    "display-p3-boundary": Object.freeze({
      guideId: "display-p3-boundary",
      editorId: lab.editorId,
      forms: labForms,
    }),
  }),
} satisfies {
  readonly [E in EditorId]: {
    readonly [G in GuideId]: GuideSupport & { readonly editorId: E; readonly guideId: G };
  };
});
