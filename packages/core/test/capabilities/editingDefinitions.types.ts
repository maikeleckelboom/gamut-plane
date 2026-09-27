import {
  editorDefinitions,
  editorsByRepresentation,
  type EditorDefinition,
  type EditorId,
  type EditorsByRepresentation,
} from "../../src/capabilities/editorDefinitions.js";
import {
  editOperationDefinitions as operations,
  type EditOperationDefinition,
  type EditOperationId,
} from "../../src/capabilities/editOperationDefinitions.js";
import {
  geometryDefinitions,
  type GeometryDefinition,
} from "../../src/capabilities/geometryDefinitions.js";
import type {
  EditorDefinitions,
  EditOperationDefinitions,
} from "../../src/capabilities/types/editingDefinitions.js";
import type { ColorValue } from "../../src/color/value.js";
import type { ColorPlaneProjection, PlaneEditError } from "../../src/picker/edit.js";
import type { ColorResult } from "../../src/result.js";

declare const color: ColorValue;
declare const labProjection: ColorPlaneProjection<"oklab">;
declare const lchProjection: ColorPlaneProjection<"oklch">;
const editor = editorDefinitions["oklch-lc"];
const geometry = geometryDefinitions[editor.geometryId];
const point = operations[editor.pointOperationId];
const result: ColorResult<ColorValue, PlaneEditError> = point.author(color, {
  ...point.request,
  point: geometry.keyboard(lchProjection, "maximum-x", false),
});
void result;

const wrongGeometry = { ...editor, geometryId: "oklab-ab-disc" } as const;
// @ts-expect-error an editor cannot bind a geometry from another representation
const invalidGeometry: EditorDefinition = wrongGeometry;
const wrongPoint = { ...editor, pointOperationId: "oklab-ab-point" } as const;
// @ts-expect-error editor point authorship must agree with its representation
const invalidPoint: EditorDefinition = wrongPoint;
const wrongRepresentation = {
  ...operations["oklab-channel-patch"],
  representationId: "oklch",
} as const;
// @ts-expect-error operation and representation are correlated
const invalidOperation: EditOperationDefinition = wrongRepresentation;
const wrongAxis = { ...geometry, x: "oklab.a" } as const;
// @ts-expect-error geometry axes must belong to its representation
const invalidAxis: GeometryDefinition = wrongAxis;

const duplicateEditors = { ...editorDefinitions, "oklab-ab": editor };
// @ts-expect-error keyed built-ins cannot reuse a different entry's ID
const invalidDuplicate: EditorDefinitions = duplicateEditors;
const incompleteOperations = { "oklch-channel-patch": operations["oklch-channel-patch"] };
// @ts-expect-error built-ins must cover all six closed operation contracts
const incomplete: EditOperationDefinitions = incompleteOperations;
const wrongRelation = { ...editorsByRepresentation, srgb: [editor.id] } as const;
// @ts-expect-error constructible RGB has no compatible primary editor
const invalidRelation: EditorsByRepresentation = wrongRelation;
// @ts-expect-error Hue is an operation, never a primary editor
const companion: EditorId = "oklch-hue-edit";
// @ts-expect-error no input-mechanism-specific operation IDs
const widget: EditOperationId = "oklch-hue-range-operation";

const patch = operations["oklab-channel-patch"];
// @ts-expect-error raw Lab requests do not accept Hue
patch.author(color, { ...patch.request, channels: { h: 20 } });
// @ts-expect-error raw patches cannot silently become point edits
patch.author(color, { ...point.request, point: { x: 0, y: 0 } });
const hue = operations["oklch-hue-edit"];
// @ts-expect-error deliberate normalized Hue authorship is H-only
hue.author(color, { ...hue.request, channels: { l: 0.5 } });
// @ts-expect-error deliberate Hue establishes a numeric direction
hue.author(color, { ...hue.request, channels: { h: null } });
const disc = operations["oklab-disc-coordinate"];
disc.toPoint(labProjection, disc.bindings["oklab.a"], 0.4);
// @ts-expect-error disc helper takes the correlated OKLab observation
disc.toPoint(lchProjection, "a", 0.4);
// @ts-expect-error coordinate requests cannot edit fixed Lightness
disc.toPoint(labProjection, "l", 0.4);
// @ts-expect-error keyboard math is bound to the geometry's representation
geometry.keyboard(labProjection, "maximum-x", false);
// @ts-expect-error internal relation arrays cannot be mutated
editorsByRepresentation.oklch.push(editor.id);

void [
  invalidGeometry,
  invalidPoint,
  invalidOperation,
  invalidAxis,
  invalidDuplicate,
  incomplete,
  invalidRelation,
  companion,
  widget,
];
