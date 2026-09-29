import {
  OKLAB_AB_PLANE,
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  getHueGuideIntervals,
  getLightnessGuideIntervals,
  getPickerGuide,
  type GamutBoundaryTable,
  type GamutId,
  type PickerPlaneGeometry,
} from "@gamut-plane/core";
import { editorDefinitions, type EditorId } from "@gamut-plane/core/internal/capabilities";
import { PICKER_GAMUT_TABLES } from "../generated/gamutTables.js";

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
  readonly reference: typeof getPickerGuide;
}

export interface GuideSupport {
  readonly guideId: GuideId;
  readonly editorId: EditorId;
  readonly forms: GuideForms;
}

// Guide geometry and contour math predate Canvas field support; the relations are independent.
const lchForms = Object.freeze({
  contour: Object.freeze({
    build: OKLCH_LIGHTNESS_CHROMA_PLANE.buildGamutContour,
    closed: OKLCH_LIGHTNESS_CHROMA_PLANE.gamutContourClosed,
  }),
  hueIntervals: getHueGuideIntervals,
  lightnessIntervals: getLightnessGuideIntervals,
  chromaIntervals: "oklch-maximum-chroma",
  reference: getPickerGuide,
} satisfies GuideForms);

const labForms = Object.freeze({
  contour: Object.freeze({
    build: OKLAB_AB_PLANE.buildGamutContour,
    closed: OKLAB_AB_PLANE.gamutContourClosed,
  }),
  hueIntervals: null,
  lightnessIntervals: getLightnessGuideIntervals,
  chromaIntervals: "oklch-maximum-chroma",
  reference: getPickerGuide,
} satisfies GuideForms);

/** Only the four currently admitted editor/guide combinations. */
export const guideSupport = Object.freeze({
  "oklch-lc": Object.freeze({
    "srgb-boundary": Object.freeze({
      guideId: "srgb-boundary",
      editorId: editorDefinitions["oklch-lc"].id,
      forms: lchForms,
    }),
    "display-p3-boundary": Object.freeze({
      guideId: "display-p3-boundary",
      editorId: editorDefinitions["oklch-lc"].id,
      forms: lchForms,
    }),
  }),
  "oklab-ab": Object.freeze({
    "srgb-boundary": Object.freeze({
      guideId: "srgb-boundary",
      editorId: editorDefinitions["oklab-ab"].id,
      forms: labForms,
    }),
    "display-p3-boundary": Object.freeze({
      guideId: "display-p3-boundary",
      editorId: editorDefinitions["oklab-ab"].id,
      forms: labForms,
    }),
  }),
} satisfies {
  readonly [E in EditorId]: {
    readonly [G in GuideId]: GuideSupport & { readonly editorId: E; readonly guideId: G };
  };
});
