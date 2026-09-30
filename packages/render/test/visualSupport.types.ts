import { geometryDefinitions, type EditorId } from "@gamut-plane/core/internal/capabilities";
import { fieldSupport, type FieldSupport } from "../src/capabilities/fieldSupport.js";
import {
  guideDefinitions,
  guideSupport,
  type GuideDefinition,
  type GuideSupport,
} from "../src/capabilities/guideSupport.js";

const lch = fieldSupport["oklch-lc"];
const unknownEditor = { ...lch, editorId: "srgb-channels" } as const;
// @ts-expect-error render cannot introduce an editor independently of core
const invalidEditor: FieldSupport = unknownEditor;
const wrongGeometry = { ...lch, geometry: geometryDefinitions["oklab-ab-disc"] };
// @ts-expect-error field support must use its editor's correlated core geometry
const invalidGeometry: FieldSupport = wrongGeometry;
const wrongBinding = { ...fieldSupport["oklab-ab"], editorId: "oklch-lc" } as const;
// @ts-expect-error another editor's geometry/sampler binding cannot be relabeled
const invalidBinding: FieldSupport = wrongBinding;
const rgbField = {
  ...lch,
  editorId: "srgb-rg",
  geometry: geometryDefinitions["srgb-rg-rectangle"],
} as const;
// @ts-expect-error native RGB geometry cannot use the legacy OKLCH sampler
const unsupportedRgbField: FieldSupport = rgbField;
const wrongRgbSampler = { ...fieldSupport["srgb-rg"], plane: fieldSupport["srgb-rb"].plane };
// @ts-expect-error native Area and sampler identity remain correlated within a representation
const invalidRgbSampler: FieldSupport = wrongRgbSampler;
const wrongRgbSpace = { ...fieldSupport["display-p3-rg"], plane: fieldSupport["srgb-rg"].plane };
// @ts-expect-error native samplers cannot be relabeled across encoded representations
const invalidRgbSpace: FieldSupport = wrongRgbSpace;
// @ts-expect-error hypothetical primary editors must first exist in core
const hypothetical: EditorId = "oklch-hl";
const wrongGamut = { ...guideDefinitions["srgb-boundary"], gamutId: "srgb" } as const;
// @ts-expect-error a guide refers to a core GamutId, not a representation ID
const invalidGamut: GuideDefinition = wrongGamut;
const wrongGuideEditor = {
  ...guideSupport["oklch-lc"]["srgb-boundary"],
  editorId: "xyz-d65",
} as const;
// @ts-expect-error observable representations do not imply a guide-supported editor
const invalidGuideEditor: GuideSupport = wrongGuideEditor;
// @ts-expect-error structural support records cannot be rebound
lch.geometry = geometryDefinitions["oklab-ab-disc"];
void [
  invalidEditor,
  invalidGeometry,
  invalidBinding,
  unsupportedRgbField,
  invalidRgbSampler,
  invalidRgbSpace,
  hypothetical,
  invalidGamut,
  invalidGuideEditor,
];

const relabeledRgbGuide = {
  ...guideSupport["srgb-rg"]["srgb-boundary"],
  editorId: "srgb-rb",
} as const;
// @ts-expect-error RGB guide Area and core geometry are correlated
const invalidRgbGuide: GuideSupport = relabeledRgbGuide;
const perceptualRgbGuide = {
  ...guideSupport["oklch-lc"]["srgb-boundary"],
  editorId: "srgb-rg",
} as const;
// @ts-expect-error native RGB forms cannot masquerade as perceptual forms
const invalidRgbForms: GuideSupport = perceptualRgbGuide;
import type { RgbResolvedGuideForms } from "../src/capabilities/guideResolution.js";
declare const rgbForms: Extract<RgbResolvedGuideForms, { geometry: { id: "srgb-rg-rectangle" } }>;
rgbForms.channels.r.channelId satisfies "srgb.r";
const wrongRgbChannels: RgbResolvedGuideForms = {
  ...rgbForms,
  // @ts-expect-error RGB channel identity cannot be changed to another encoding
  channels: { ...rgbForms.channels, r: { ...rgbForms.channels.r, channelId: "display-p3.r" } },
};
void [invalidRgbGuide, invalidRgbForms, wrongRgbChannels];
