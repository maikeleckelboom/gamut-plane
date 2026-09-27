import type { ColorSpaceId } from "../../color/representation.js";
import type { normalizeHue } from "../../color/types.js";
import type { ColorValue } from "../../color/value.js";
import type {
  authorPlaneEdit,
  ColorPlaneEdit,
  ColorPlaneProjection,
  projectColorToPlane,
} from "../../picker/edit.js";
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

interface GeometryContexts {
  readonly oklch: Readonly<{
    id: "oklch-lc-rectangle";
    x: "oklch.c";
    y: "oklch.l";
    fixed: "oklch.h";
    domain: Readonly<{ kind: "rectangle"; lightness: readonly [0, 1]; maximumChroma: number }>;
    toPoint: typeof oklchCoordinatesToPlanePoint;
    fromPoint: typeof oklchCoordinatesFromPlanePoint;
  }>;
  readonly oklab: Readonly<{
    id: "oklab-ab-disc";
    x: "oklab.a";
    y: "oklab.b";
    fixed: "oklab.l";
    domain: Readonly<{ kind: "disc"; radius: number }>;
    toPoint: typeof oklabCoordinatesToPlanePoint;
    fromPoint: typeof oklabCoordinatesFromPlanePoint;
  }>;
}

export type GeometryDefinition<S extends PickerPlaneId = PickerPlaneId> = {
  [P in S]: GeometryContexts[P] &
    Readonly<{
      representationId: P;
      planeId: P;
      xDirection: "increasing";
      yDirection: "decreasing";
      /** Projection is raw; only an explicit edit/presentation constraint bounds it. */
      project: typeof projectColorToPlane<P>;
      keyboard: (
        projection: ColorPlaneProjection<P>,
        action: PickerPlaneKeyboardAction,
        coarse: boolean,
      ) => PlanePoint;
      constrain: (point: PlanePoint) => PlanePoint;
      contains: (point: PlanePoint) => boolean;
    }>;
}[S];

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
  geometryId: K extends "point" ? GeometryDefinition<S>["id"] : null;
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
    }>;
}

export type EditOperationDefinitions = {
  readonly [Id in keyof EditOperationContracts]: Readonly<{ id: Id }> & EditOperationContracts[Id];
};
export type EditOperationId = keyof EditOperationDefinitions;
export type EditOperationDefinition = EditOperationDefinitions[EditOperationId];

interface PrimaryEditorIds {
  readonly oklch: "oklch-lc";
  readonly oklab: "oklab-ab";
}

export type EditorDefinition = {
  [S in PickerPlaneId]: Readonly<{
    id: PrimaryEditorIds[S];
    representationId: S;
    geometryId: GeometryDefinition<S>["id"];
    pointOperationId: Extract<
      EditOperationDefinition,
      { kind: "point"; representationId: S }
    >["id"];
  }>;
}[PickerPlaneId];

export type EditorId = EditorDefinition["id"];
export type EditorDefinitions = { readonly [E in EditorDefinition as E["id"]]: E };

/** Cardinality is zero or more; compatibility grants no UI/product admission. */
export type EditorsByRepresentation<
  E extends Readonly<{ id: string; representationId: ColorSpaceId }> = EditorDefinition,
> = {
  readonly [S in ColorSpaceId]: readonly Extract<E, { representationId: S }>["id"][];
};
