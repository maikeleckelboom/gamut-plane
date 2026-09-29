import type { ColorRepresentation, ColorSpaceId } from "../../color/representation.js";
import type { ConversionError } from "../../color/represent.js";
import type { normalizeHue } from "../../color/types.js";
import type { ColorValue } from "../../color/value.js";
import type { ColorResult } from "../../result.js";
import type { authorPlaneEdit, ColorPlaneEdit } from "../../picker/edit.js";
import type {
  oklabCoordinatesFromPlanePoint,
  oklabCoordinatesToPlanePoint,
  oklchCoordinatesFromPlanePoint,
  oklchCoordinatesToPlanePoint,
  PickerPlaneId,
  PlanePoint,
} from "../../picker/geometry.js";
import type {
  oklabCoordinatePlanePoint,
  PickerPlaneKeyboardAction,
} from "../../picker/keyboard.js";
import type { ChannelDefinition } from "./representationDefinitions.js";
import type { resolveOklabDirectRange, authorOklabDirectCoordinate } from "../directCoordinate.js";

type ChannelOf<R extends ColorSpaceId> = Extract<ChannelDefinition, { representationId: R }>["id"];

export type GeometryProjection<
  R extends ColorSpaceId = ColorSpaceId,
  G extends string = string,
  X extends string = string,
  Y extends string = string,
  F extends string = string,
> = Readonly<{
  representationId: R;
  geometryId: G;
  representation: ColorRepresentation<R>;
  point: PlanePoint;
  coordinates: Readonly<{ x: number | null; y: number | null; fixed: number | null }>;
  channels: Readonly<{ x: X; y: Y; fixed: F }>;
}>;

/** A geometry is a coordinate binding, independent of its representation and renderer. */
export type GeometryContract<
  R extends ColorSpaceId,
  G extends string,
  X extends ChannelOf<R>,
  Y extends ChannelOf<R>,
  F extends ChannelOf<R>,
  Domain,
  ToPoint,
  FromPoint,
> = Readonly<{
  id: G;
  representationId: R;
  x: X;
  y: Y;
  fixed: F;
  xDirection: "increasing" | "decreasing";
  yDirection: "increasing" | "decreasing";
  domain: Domain;
  toPoint: ToPoint;
  fromPoint: FromPoint;
  project: (value: ColorValue) => ColorResult<GeometryProjection<R, G, X, Y, F>, ConversionError>;
  keyboard: (
    projection: GeometryProjection<R, G, X, Y, F>,
    action: PickerPlaneKeyboardAction,
    coarse: boolean,
  ) => PlanePoint;
  constrain: (point: PlanePoint) => PlanePoint;
  contains: (point: PlanePoint) => boolean;
  /** null means the raw fixed coordinate cannot sample this editing geometry. */
  samplingFixed: (fixed: number | null) => number | null;
}>;

export type GeometryDefinition =
  | GeometryContract<
      "oklch",
      "oklch-lc-rectangle",
      "oklch.c",
      "oklch.l",
      "oklch.h",
      Readonly<{ kind: "rectangle"; lightness: readonly [0, 1]; maximumChroma: number }>,
      typeof oklchCoordinatesToPlanePoint,
      typeof oklchCoordinatesFromPlanePoint
    >
  | GeometryContract<
      "oklab",
      "oklab-ab-disc",
      "oklab.a",
      "oklab.b",
      "oklab.l",
      Readonly<{ kind: "disc"; radius: number }>,
      typeof oklabCoordinatesToPlanePoint,
      typeof oklabCoordinatesFromPlanePoint
    >;

export type GeometryId = GeometryDefinition["id"];
export type GeometryDefinitions = { readonly [G in GeometryDefinition as G["id"]]: G };

type EditRequest<S extends PickerPlaneId, K extends ColorPlaneEdit["kind"]> = Extract<
  ColorPlaneEdit,
  { plane: S; kind: K }
>;
type Author<Request> = (value: ColorValue, request: Request) => ReturnType<typeof authorPlaneEdit>;

type DirectEdit<S extends PickerPlaneId, K extends ColorPlaneEdit["kind"]> = Readonly<{
  representationId: S;
  kind: K extends "channels" ? "channel-patch" : "point";
  geometryId: K extends "point" ? Extract<GeometryDefinition, { representationId: S }>["id"] : null;
  request: Readonly<{ plane: S; kind: K }>;
  author: Author<EditRequest<S, K>>;
}>;

/** Closed compositions: callers use the constituents in order, with no new dispatcher. */
interface EditOperationContracts {
  readonly "oklch-channel-patch": DirectEdit<"oklch", "channels">;
  readonly "oklch-hue-edit": Omit<DirectEdit<"oklch", "channels">, "kind" | "author"> &
    Readonly<{
      kind: "normalized-hue";
      channelId: "oklch.h";
      patchOperationId: "oklch-channel-patch";
      normalize: typeof normalizeHue;
      author: Author<
        Readonly<{ plane: "oklch"; kind: "channels"; channels: Readonly<{ h: number }> }>
      >;
    }>;
  readonly "oklch-lc-point": DirectEdit<"oklch", "point">;
  readonly "oklab-channel-patch": DirectEdit<"oklab", "channels">;
  readonly "oklab-ab-point": DirectEdit<"oklab", "point">;
  readonly "oklab-disc-coordinate": Omit<DirectEdit<"oklab", "point">, "kind"> &
    Readonly<{
      kind: "disc-coordinate";
      bindings: Readonly<{ "oklab.a": "a"; "oklab.b": "b" }>;
      pointOperationId: "oklab-ab-point";
      /** Existing helper scalar-preclamps, then radially constrains the coupled point. */
      toPoint: typeof oklabCoordinatePlanePoint;
      directRange: typeof resolveOklabDirectRange;
      authorCoordinate: typeof authorOklabDirectCoordinate;
    }>;
}

export type EditOperationDefinitions = {
  readonly [Id in keyof EditOperationContracts]: Readonly<{ id: Id }> & EditOperationContracts[Id];
};
export type EditOperationId = keyof EditOperationDefinitions;
export type EditOperationDefinition = EditOperationDefinitions[EditOperationId];

export type EditorContract<
  R extends ColorSpaceId,
  E extends string,
  G extends string,
  O extends string,
> = Readonly<{
  id: E;
  representationId: R;
  geometryId: G;
  pointOperationId: O;
}>;

export type EditorDefinition =
  | EditorContract<"oklch", "oklch-lc", "oklch-lc-rectangle", "oklch-lc-point">
  | EditorContract<"oklab", "oklab-ab", "oklab-ab-disc", "oklab-ab-point">;

export type EditorId = EditorDefinition["id"];
export type EditorDefinitions = { readonly [E in EditorDefinition as E["id"]]: E };

/** Cardinality is zero or more; compatibility grants no UI/product admission. */
export type EditorsByRepresentation<
  E extends Readonly<{ id: string; representationId: ColorSpaceId }> = EditorDefinition,
> = {
  readonly [S in ColorSpaceId]: readonly Extract<E, { representationId: S }>["id"][];
};
