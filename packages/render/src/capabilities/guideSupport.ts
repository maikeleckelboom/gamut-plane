import {
  getHueGuideIntervals,
  getLightnessGuideIntervals,
  getPickerGuide,
  type DisplayGamut,
  type GamutBoundaryTable,
  type GamutId,
  type OklchSample,
  type PickerGuide,
} from "@gamut-plane/core";
import {
  editorDefinitions,
  gamutRayIntervals,
  geometryDefinitions,
  type EditorId,
  type EditorDefinition,
  type GeometryDefinition,
} from "@gamut-plane/core/internal/capabilities";
import {
  getTracedPickerGuide,
  traceLightnessChromaGuide,
  traceOklabGuide,
  type TracedGuide,
} from "../perceptualGuides.js";
import { PICKER_GAMUT_TABLES } from "../generated/gamutTables.js";

export type GuideId = "srgb-boundary" | "display-p3-boundary";

/** Explicit primary spatial Reference policy; never inferred from guide inventory order. */
export const referenceGuidePolicy = Object.freeze({
  "srgb-gamut": "srgb-boundary",
  "display-p3-gamut": "display-p3-boundary",
} as const satisfies Readonly<Partial<Record<GamutId, GuideId>>>);
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

/** Guide facts for one observed color against one guide's gamut. */
export type GuideReference = (color: OklchSample, guide: GuideDefinition) => PickerGuide;

/** The sampled table's interpolation, kept for RGB editors whose spatial guide is their own slice. */
const sampledReference: GuideReference = (color, guide) => getPickerGuide(color, guide.table);

interface GuideForms {
  readonly kind: "perceptual";
  /**
   * The traced boundary of this editor's slice at a fixed coordinate, refined toward
   * render's fidelity target, or an explicit work/topology failure.
   */
  readonly contour: Readonly<{
    build: (gamut: DisplayGamut, fixed: number) => TracedGuide;
    closed: boolean;
  }>;
  /** Hue and Lightness slider intervals keep the sampled table; the camera never magnifies them. */
  readonly hueIntervals: typeof getHueGuideIntervals | null;
  readonly lightnessIntervals: typeof getLightnessGuideIntervals;
  /**
   * In-gamut chroma intervals along the observed color's own ray, the same numerical crossings the
   * traced contour uses. Produced for both views; displayed only by the OKLCH Chroma control.
   */
  readonly chromaIntervals: typeof gamutRayIntervals;
  readonly reference: GuideReference;
}

type RgbEditor = Extract<EditorDefinition, { representationId: "srgb" | "display-p3" }>;
export type RgbGuideSupport = {
  [E in RgbEditor as E["id"]]: Readonly<{
    guideId: GuideId;
    editorId: E["id"];
    forms: Readonly<{
      kind: "rgb";
      geometry: Extract<GeometryDefinition, { id: E["geometryId"] }>;
      reference: GuideReference;
    }>;
  }>;
}[RgbEditor["id"]];
export type GuideSupport =
  | Readonly<{ guideId: GuideId; editorId: "oklch-lc" | "oklab-ab"; forms: GuideForms }>
  | RgbGuideSupport;

function rgbSupport<E extends RgbEditor["id"]>(editorId: E) {
  const forms = Object.freeze({
    kind: "rgb" as const,
    geometry: geometryDefinitions[editorDefinitions[editorId].geometryId],
    reference: sampledReference,
  });
  // The closed core editor map supplies this literal geometry pairing.
  return Object.freeze({
    "srgb-boundary": Object.freeze({ editorId, guideId: "srgb-boundary", forms }),
    "display-p3-boundary": Object.freeze({ editorId, guideId: "display-p3-boundary", forms }),
  }) as {
    readonly [G in GuideId]: Extract<RgbGuideSupport, { editorId: E }> & { readonly guideId: G };
  };
}

// Guide geometry and contour math predate Canvas field support; the relations are independent.
/** Reference uses the true ray crossing; the drawn guide approximates that boundary. */
const tracedReference: GuideReference = (color, guide) =>
  getTracedPickerGuide(color, guide.table.gamut);

const lchForms = Object.freeze({
  kind: "perceptual",
  contour: Object.freeze({ build: traceLightnessChromaGuide, closed: false }),
  hueIntervals: getHueGuideIntervals,
  lightnessIntervals: getLightnessGuideIntervals,
  chromaIntervals: gamutRayIntervals,
  reference: tracedReference,
} satisfies GuideForms);

const labForms = Object.freeze({
  kind: "perceptual",
  contour: Object.freeze({ build: traceOklabGuide, closed: true }),
  hueIntervals: null,
  lightnessIntervals: getLightnessGuideIntervals,
  chromaIntervals: gamutRayIntervals,
  reference: tracedReference,
} satisfies GuideForms);

/** Technical existence implies neither a guide relation nor any successful forms. */
type SupportFor<E extends EditorId> = E extends RgbEditor["id"]
  ? Extract<RgbGuideSupport, { editorId: E }>
  : Readonly<{ guideId: GuideId; editorId: E; forms: GuideForms }>;
export const guideSupport: {
  readonly [E in EditorId]: { readonly [G in GuideId]: SupportFor<E> & { readonly guideId: G } };
} = Object.freeze({
  "srgb-rg": rgbSupport("srgb-rg"),
  "srgb-rb": rgbSupport("srgb-rb"),
  "srgb-gb": rgbSupport("srgb-gb"),
  "display-p3-rg": rgbSupport("display-p3-rg"),
  "display-p3-rb": rgbSupport("display-p3-rb"),
  "display-p3-gb": rgbSupport("display-p3-gb"),

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
  readonly [E in EditorId]?: {
    readonly [G in GuideId]?: GuideSupport & { readonly editorId: E; readonly guideId: G };
  };
});
