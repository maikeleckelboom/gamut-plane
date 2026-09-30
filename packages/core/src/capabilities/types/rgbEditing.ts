import type { ColorRepresentation } from "../../color/representation.js";
import type { ConversionError } from "../../color/represent.js";
import type { ColorValue } from "../../color/value.js";
import type { PlaneEditError } from "../../picker/edit.js";
import type { PlanePoint } from "../../picker/geometry.js";
import type { PickerPlaneKeyboardAction } from "../../picker/keyboard.js";
import type { ColorResult } from "../../result.js";
import type { rgbCoordinatesFromPoint, rgbCoordinatesToPoint } from "../rgbEditing.js";
import type { GeometryContract, GeometryProjection } from "./editingDefinitions.js";
import type { ChannelDefinition } from "./representationDefinitions.js";

export type RgbRepresentationId = "srgb" | "display-p3";

export type RgbDomain = Readonly<{ kind: "rectangle"; x: readonly [0, 1]; y: readonly [0, 1] }>;

export type RgbGeometryDefinition =
  | GeometryContract<
      "srgb",
      "srgb-rg-rectangle",
      "srgb.r",
      "srgb.g",
      "srgb.b",
      RgbDomain,
      typeof rgbCoordinatesToPoint,
      typeof rgbCoordinatesFromPoint
    >
  | GeometryContract<
      "srgb",
      "srgb-rb-rectangle",
      "srgb.r",
      "srgb.b",
      "srgb.g",
      RgbDomain,
      typeof rgbCoordinatesToPoint,
      typeof rgbCoordinatesFromPoint
    >
  | GeometryContract<
      "srgb",
      "srgb-gb-rectangle",
      "srgb.g",
      "srgb.b",
      "srgb.r",
      RgbDomain,
      typeof rgbCoordinatesToPoint,
      typeof rgbCoordinatesFromPoint
    >
  | GeometryContract<
      "display-p3",
      "display-p3-rg-rectangle",
      "display-p3.r",
      "display-p3.g",
      "display-p3.b",
      RgbDomain,
      typeof rgbCoordinatesToPoint,
      typeof rgbCoordinatesFromPoint
    >
  | GeometryContract<
      "display-p3",
      "display-p3-rb-rectangle",
      "display-p3.r",
      "display-p3.b",
      "display-p3.g",
      RgbDomain,
      typeof rgbCoordinatesToPoint,
      typeof rgbCoordinatesFromPoint
    >
  | GeometryContract<
      "display-p3",
      "display-p3-gb-rectangle",
      "display-p3.g",
      "display-p3.b",
      "display-p3.r",
      RgbDomain,
      typeof rgbCoordinatesToPoint,
      typeof rgbCoordinatesFromPoint
    >;

/** The factory's channel indices are correlated with the qualified axis identities. */
export type RgbGeometryBinding = {
  [G in RgbGeometryDefinition as G["id"]]: Pick<
    G,
    "id" | "representationId" | "x" | "y" | "fixed"
  > &
    Readonly<{
      indices: Readonly<{
        x: Extract<ChannelDefinition, { id: G["x"] }>["index"];
        y: Extract<ChannelDefinition, { id: G["y"] }>["index"];
        fixed: Extract<ChannelDefinition, { id: G["fixed"] }>["index"];
      }>;
    }>;
}[RgbGeometryDefinition["id"]];

type BindingKeys = "id" | "representationId" | "x" | "y" | "fixed";
type RgbBoundProjection<B extends RgbGeometryBinding> = GeometryProjection<
  B["representationId"],
  B["id"],
  B["x"],
  B["y"],
  B["fixed"]
>;

/** Factory result retains each literal binding rather than widening to the whole RGB union. */
export type RgbBoundGeometry<B extends RgbGeometryBinding> = Pick<B, BindingKeys> &
  Omit<RgbGeometryDefinition, BindingKeys | "project" | "keyboard"> &
  Readonly<{
    project: (value: ColorValue) => ColorResult<RgbBoundProjection<B>, ConversionError>;
    keyboard: (
      projection: RgbBoundProjection<B>,
      action: PickerPlaneKeyboardAction,
      coarse: boolean,
    ) => PlanePoint;
  }>;

export type RgbPointOperationId<G extends RgbGeometryDefinition["id"]> =
  G extends `${infer Editor}-rectangle` ? `${Editor}-point` : never;

export type RgbPointEdit<G extends RgbGeometryDefinition> = Readonly<{
  representationId: G["representationId"];
  geometryId: G["id"];
  kind: "point";
  point: PlanePoint;
  alpha?: number;
}>;

export type RgbPointOperationContract<G extends RgbGeometryDefinition> = Readonly<{
  id: RgbPointOperationId<G["id"]>;
  representationId: G["representationId"];
  geometryId: G["id"];
  kind: "point";
  request: Pick<RgbPointEdit<G>, "representationId" | "geometryId" | "kind">;
  author: (value: ColorValue, edit: RgbPointEdit<G>) => ColorResult<ColorValue, PlaneEditError>;
}>;
export type RgbPointOperation = {
  [G in RgbGeometryDefinition as G["id"]]: RgbPointOperationContract<G>;
}[RgbGeometryDefinition["id"]];

export type RgbChannelEdit<R extends RgbRepresentationId> = Readonly<{
  representationId: R;
  kind: "channels";
  channels: Readonly<Partial<{ r: number; g: number; b: number }>>;
  alpha?: number;
}>;

export type RgbChannelOperationContract<R extends RgbRepresentationId> = Readonly<{
  id: `${R}-channel-patch`;
  representationId: R;
  geometryId: null;
  kind: "channel-patch";
  request: Pick<RgbChannelEdit<R>, "representationId" | "kind">;
  author: (value: ColorValue, edit: RgbChannelEdit<R>) => ColorResult<ColorValue, PlaneEditError>;
}>;
export type RgbChannelOperation = {
  [R in RgbRepresentationId]: RgbChannelOperationContract<R>;
}[RgbRepresentationId];

export type RgbChannels = ColorRepresentation<RgbRepresentationId>["channels"];
