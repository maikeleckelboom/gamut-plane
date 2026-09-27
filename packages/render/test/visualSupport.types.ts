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
  hypothetical,
  invalidGamut,
  invalidGuideEditor,
];
