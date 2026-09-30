import {
  editorDefinitions,
  editorsByRepresentation,
} from "../../src/capabilities/editorDefinitions.js";
import { editOperationDefinitions as operations } from "../../src/capabilities/editOperationDefinitions.js";
import {
  geometryDefinitions as geometries,
  keyboardGeometryPoint,
} from "../../src/capabilities/geometryDefinitions.js";
import { createRgbGeometry, createRgbPointOperation } from "../../src/capabilities/rgbEditing.js";
import type {
  EditorContract,
  EditorDefinition,
  GeometryDefinition,
  GeometryProjection,
  EditOperationDefinition,
} from "../../src/capabilities/types/editingDefinitions.js";
import type { ColorValue } from "../../src/color/value.js";
import { authorPlaneEdit } from "../../src/index.js";

declare const color: ColorValue;
declare const rg: GeometryProjection<"srgb", "srgb-rg-rectangle", "srgb.r", "srgb.g", "srgb.b">;
declare const rb: GeometryProjection<"srgb", "srgb-rb-rectangle", "srgb.r", "srgb.b", "srgb.g">;
declare const p3rg: GeometryProjection<
  "display-p3",
  "display-p3-rg-rectangle",
  "display-p3.r",
  "display-p3.g",
  "display-p3.b"
>;

editorDefinitions["srgb-rg"] satisfies EditorContract<
  "srgb",
  "srgb-rg",
  "srgb-rg-rectangle",
  "srgb-rg-point"
>;
editorDefinitions["srgb-rb"] satisfies EditorContract<
  "srgb",
  "srgb-rb",
  "srgb-rb-rectangle",
  "srgb-rb-point"
>;
editorDefinitions["srgb-gb"] satisfies EditorContract<
  "srgb",
  "srgb-gb",
  "srgb-gb-rectangle",
  "srgb-gb-point"
>;
editorDefinitions["display-p3-rg"] satisfies EditorContract<
  "display-p3",
  "display-p3-rg",
  "display-p3-rg-rectangle",
  "display-p3-rg-point"
>;
editorDefinitions["display-p3-rb"] satisfies EditorContract<
  "display-p3",
  "display-p3-rb",
  "display-p3-rb-rectangle",
  "display-p3-rb-point"
>;
editorDefinitions["display-p3-gb"] satisfies EditorContract<
  "display-p3",
  "display-p3-gb",
  "display-p3-gb-rectangle",
  "display-p3-gb-point"
>;

operations["srgb-rg-point"].author(color, {
  ...operations["srgb-rg-point"].request,
  point: geometries["srgb-rg-rectangle"].keyboard(rg, "maximum-x", true),
});
operations["display-p3-rg-point"].author(color, {
  ...operations["display-p3-rg-point"].request,
  point: keyboardGeometryPoint(p3rg, "increase-y", false),
});
operations["srgb-channel-patch"].author(color, {
  ...operations["srgb-channel-patch"].request,
  channels: { r: -0.2, g: 1.5, b: 0.4 },
});

// @ts-expect-error an Area cannot bind another Area's geometry in the same representation
const wrongArea: EditorDefinition = {
  ...editorDefinitions["srgb-rg"],
  geometryId: "srgb-rb-rectangle",
};
// @ts-expect-error a point operation is geometry-bound even within the same representation
const wrongOperation: EditorDefinition = {
  ...editorDefinitions["srgb-rg"],
  pointOperationId: "srgb-gb-point",
};
// @ts-expect-error RGB encodings remain different representations
const wrongRepresentation: EditorDefinition = {
  ...editorDefinitions["srgb-rg"],
  representationId: "display-p3",
};
// @ts-expect-error the geometry identity fixes its ordered axes
const wrongAxis: GeometryDefinition = { ...geometries["srgb-rg-rectangle"], y: "srgb.b" };
// @ts-expect-error its actual fixed coordinate cannot be rebound
const wrongFixed: GeometryDefinition = { ...geometries["srgb-rg-rectangle"], fixed: "srgb.r" };
// @ts-expect-error point operations cannot masquerade as another Area
const wrongPointBinding: EditOperationDefinition = {
  ...operations["srgb-rg-point"],
  geometryId: "srgb-rb-rectangle",
};
// @ts-expect-error keyboard projection is correlated with the Area, not just RGB representation
geometries["srgb-rg-rectangle"].keyboard(rb, "maximum-x", false);
// @ts-expect-error keyboard projection is correlated with the RGB encoding
geometries["srgb-rg-rectangle"].keyboard(p3rg, "maximum-x", false);
// @ts-expect-error no mismatched geometry request, even though both requests author sRGB
operations["srgb-rg-point"].author(color, {
  ...operations["srgb-rb-point"].request,
  point: rg.point,
});
// @ts-expect-error no mismatched RGB encoding request
operations["srgb-rg-point"].author(color, {
  ...operations["display-p3-rg-point"].request,
  point: rg.point,
});
operations["srgb-channel-patch"].author(color, {
  ...operations["srgb-channel-patch"].request,
  // @ts-expect-error patch requests cannot supply a plane point
  point: rg.point,
});
operations["display-p3-channel-patch"].author(color, {
  ...operations["display-p3-channel-patch"].request,
  // @ts-expect-error encoded RGB patches cannot author Hue
  channels: { h: 30 },
});
// @ts-expect-error patch authorship must observe the selected RGB encoding
operations["srgb-channel-patch"].author(color, {
  ...operations["display-p3-channel-patch"].request,
  channels: { r: 0.5 },
});
// @ts-expect-error factory operation identity cannot be inferred from an incompatible geometry
createRgbPointOperation("srgb-rb-point", geometries["srgb-rg-rectangle"]);
createRgbGeometry({
  id: "srgb-rg-rectangle",
  representationId: "srgb",
  x: "srgb.r",
  y: "srgb.g",
  fixed: "srgb.b",
  // @ts-expect-error the shared factory preserves qualified-channel versus tuple-index correlation
  indices: { x: 1, y: 0, fixed: 2 },
});
// @ts-expect-error sRGB relation cannot acquire a Display P3 editor
editorsByRepresentation.srgb satisfies readonly "display-p3-rg"[];
// @ts-expect-error native editing remains internal, without widening the legacy public plane API
authorPlaneEdit(color, { plane: "srgb", kind: "point", point: { x: 0.5, y: 0.5 } });

void [wrongArea, wrongOperation, wrongRepresentation, wrongAxis, wrongFixed, wrongPointBinding];
