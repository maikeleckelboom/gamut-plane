import { represent, type ConversionError } from "../color/represent.js";
import { createColorValue, definitionOf, type ColorValue } from "../color/value.js";
import type { PlaneEditError } from "../picker/edit.js";
import {
  assertFinitePoint,
  clampPlanePointToInstrumentBounds,
  type PlanePoint,
} from "../picker/geometry.js";
import type { PickerPlaneKeyboardAction } from "../picker/keyboard.js";
import type { ColorResult } from "../result.js";
import type { GeometryProjection } from "./types/editingDefinitions.js";
import type {
  RgbChannelEdit,
  RgbChannelOperationContract,
  RgbChannels,
  RgbBoundGeometry,
  RgbGeometryBinding,
  RgbGeometryDefinition,
  RgbPointEdit,
  RgbPointOperationId,
  RgbPointOperationContract,
  RgbRepresentationId,
} from "./types/rgbEditing.js";

/** Raw encoded-coordinate conversion. Interaction constraints are a separate operation. */
export function rgbCoordinatesToPoint(x: number, y: number): PlanePoint {
  assertFinitePoint({ x, y });
  return { x, y: 1 - y };
}

export function rgbCoordinatesFromPoint(point: PlanePoint): Readonly<{ x: number; y: number }> {
  assertFinitePoint(point);
  return { x: point.x, y: 1 - point.y };
}

function containsRgbPoint(point: PlanePoint): boolean {
  assertFinitePoint(point);
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

function keyboardRgbPoint(
  point: PlanePoint,
  action: PickerPlaneKeyboardAction,
  coarse: boolean,
): PlanePoint {
  const step = coarse ? 0.02 : 0.005;
  let { x, y } = point;
  switch (action) {
    case "decrease-x":
      x -= step;
      break;
    case "increase-x":
      x += step;
      break;
    case "increase-y":
      y -= step;
      break;
    case "decrease-y":
      y += step;
      break;
    case "minimum-x":
      x = 0;
      break;
    case "maximum-x":
      x = 1;
      break;
  }
  return clampPlanePointToInstrumentBounds({ x, y });
}

/** A closed typed binding shares math without inferring an Area from the representation. */
export function createRgbGeometry<B extends RgbGeometryBinding>(binding: B): RgbBoundGeometry<B> {
  type Projection = GeometryProjection<B["representationId"], B["id"], B["x"], B["y"], B["fixed"]>;
  return Object.freeze({
    id: binding.id,
    representationId: binding.representationId,
    x: binding.x,
    y: binding.y,
    fixed: binding.fixed,
    xDirection: "increasing" as const,
    yDirection: "decreasing" as const,
    domain: Object.freeze({
      kind: "rectangle" as const,
      x: Object.freeze([0, 1] as const),
      y: Object.freeze([0, 1] as const),
    }),
    toPoint: rgbCoordinatesToPoint,
    fromPoint: rgbCoordinatesFromPoint,
    project(value: ColorValue): ColorResult<Projection, ConversionError> {
      const observed = represent(value, binding.representationId);
      if (!observed.ok) return observed;
      const channels = observed.value.channels;
      const coordinates = {
        x: channels[binding.indices.x],
        y: channels[binding.indices.y],
        fixed: channels[binding.indices.fixed],
      };
      const point = { x: coordinates.x, y: 1 - coordinates.y };
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        return {
          ok: false,
          error: {
            code: "numerical-range",
            from: definitionOf(value).space,
            to: binding.representationId,
          },
        };
      }
      return {
        ok: true,
        value: {
          representationId: binding.representationId,
          geometryId: binding.id,
          representation: observed.value,
          coordinates,
          point,
          channels: { x: binding.x, y: binding.y, fixed: binding.fixed },
        },
      };
    },
    keyboard: (projection: Projection, action: PickerPlaneKeyboardAction, coarse: boolean) =>
      keyboardRgbPoint(projection.point, action, coarse),
    constrain: clampPlanePointToInstrumentBounds,
    contains: containsRgbPoint,
    samplingFixed: (fixed: number | null) =>
      fixed !== null && Number.isFinite(fixed) ? fixed : null,
  });
}

const invalidEdit = { ok: false, error: { code: "invalid-plane-edit" } } as const;

function validRequest(input: unknown, fields: readonly string[]): input is Record<string, unknown> {
  return (
    typeof input === "object" &&
    input !== null &&
    !Array.isArray(input) &&
    Object.keys(input).every((key) => fields.includes(key))
  );
}

export function createRgbPointOperation<G extends RgbGeometryDefinition>(
  id: RgbPointOperationId<NoInfer<G["id"]>>,
  geometry: G,
): RgbPointOperationContract<G> {
  const request = Object.freeze({
    representationId: geometry.representationId,
    geometryId: geometry.id,
    kind: "point" as const,
  });
  return Object.freeze({
    id,
    representationId: geometry.representationId,
    geometryId: geometry.id,
    kind: "point" as const,
    request,
    author(value: ColorValue, edit: RgbPointEdit<G>): ColorResult<ColorValue, PlaneEditError> {
      if (
        !validRequest(edit, ["representationId", "geometryId", "kind", "point", "alpha"]) ||
        edit.representationId !== request.representationId ||
        edit.geometryId !== request.geometryId ||
        edit.kind !== request.kind ||
        !validRequest(edit.point, ["x", "y"]) ||
        !Number.isFinite(edit.point.x) ||
        !Number.isFinite(edit.point.y)
      )
        return invalidEdit;
      const projected = geometry.project(value);
      if (!projected.ok) return projected;
      const observed = projected.value.representation;
      const { x, y } = geometry.fromPoint(geometry.constrain(edit.point));
      const [r, g, b] = observed.channels;
      const channels: RgbChannels =
        geometry.fixed === "srgb.b" || geometry.fixed === "display-p3.b"
          ? [x, y, b]
          : geometry.fixed === "srgb.g" || geometry.fixed === "display-p3.g"
            ? [x, g, y]
            : [r, x, y];
      return createColorValue({
        space: geometry.representationId,
        channels,
        alpha: Object.hasOwn(edit, "alpha") ? edit.alpha! : observed.alpha,
      });
    },
  });
}

/** Raw patches observe their selected encoding and preserve every unedited coordinate. */
export function createRgbChannelPatch<R extends RgbRepresentationId>(
  representationId: R,
): RgbChannelOperationContract<R> {
  const request = Object.freeze({ representationId, kind: "channels" as const });
  return Object.freeze({
    id: `${representationId}-channel-patch` as const,
    representationId,
    geometryId: null,
    kind: "channel-patch" as const,
    request,
    author(value: ColorValue, edit: RgbChannelEdit<R>): ColorResult<ColorValue, PlaneEditError> {
      if (
        !validRequest(edit, ["representationId", "kind", "channels", "alpha"]) ||
        edit.representationId !== representationId ||
        edit.kind !== request.kind ||
        !validRequest(edit.channels, ["r", "g", "b"]) ||
        (Object.keys(edit.channels).length === 0 && !Object.hasOwn(edit, "alpha"))
      )
        return invalidEdit;
      const observed = represent(value, representationId);
      if (!observed.ok) return observed;
      const [r, g, b] = observed.value.channels;
      return createColorValue({
        space: representationId,
        channels: [
          Object.hasOwn(edit.channels, "r") ? edit.channels.r! : r,
          Object.hasOwn(edit.channels, "g") ? edit.channels.g! : g,
          Object.hasOwn(edit.channels, "b") ? edit.channels.b! : b,
        ],
        alpha: Object.hasOwn(edit, "alpha") ? edit.alpha! : observed.value.alpha,
      });
    },
  });
}
