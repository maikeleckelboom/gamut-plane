import type { ColorRepresentation } from "../color/representation.js";
import { represent, type ConversionError } from "../color/represent.js";
import {
  createColorValue,
  definitionOf,
  type ColorValue,
  type DefinitionError,
} from "../color/value.js";
import type { ColorResult } from "../result.js";
import {
  constrainOklabPlanePoint,
  oklabCoordinatesFromPlanePoint,
  oklabCoordinatesToPlanePoint,
  oklchCoordinatesFromPlanePoint,
  oklchCoordinatesToPlanePoint,
  type PickerPlaneId,
  type PlanePoint,
} from "./geometry.js";

export type ColorPlaneProjection<S extends PickerPlaneId = PickerPlaneId> = {
  [P in S]: Readonly<{
    plane: P;
    representation: ColorRepresentation<P>;
    /** Raw point; values outside the instrument remain outside it. */
    point: PlanePoint;
  }>;
}[S];

/** Ephemeral direction for editing a hue-less OKLCH neutral; never stored on ColorValue. */
export type PlaneEditReference = Readonly<{ hue: number }>;

export type ColorPlaneEdit =
  | Readonly<{
      plane: "oklch";
      kind: "channels";
      channels: Readonly<Partial<{ l: number; c: number; h: number | null }>>;
      alpha?: number;
      reference?: PlaneEditReference;
    }>
  | Readonly<{
      plane: "oklch";
      kind: "point";
      point: PlanePoint;
      alpha?: number;
      reference?: PlaneEditReference;
    }>
  | Readonly<{
      plane: "oklab";
      kind: "channels";
      channels: Readonly<Partial<{ l: number; a: number; b: number }>>;
      alpha?: number;
    }>
  | Readonly<{
      plane: "oklab";
      kind: "point";
      point: PlanePoint;
      alpha?: number;
    }>;

export type PlaneEditError =
  | ConversionError
  | DefinitionError
  | Readonly<{ code: "invalid-plane-edit" | "missing-hue-direction" }>;

const invalidEdit = { ok: false, error: { code: "invalid-plane-edit" } } as const;

/** Observes coordinates and raw geometry without creating a defining value. */
export function projectColorToPlane<S extends PickerPlaneId>(
  value: ColorValue,
  plane: S,
): ColorResult<ColorPlaneProjection<S>, ConversionError> {
  if (plane !== "oklch" && plane !== "oklab") throw new TypeError("Unsupported picker plane");
  const observed = represent(value, plane);
  if (!observed.ok) return observed;
  const [l, x, y] = observed.value.channels;
  const point =
    plane === "oklch"
      ? oklchCoordinatesToPlanePoint(l, x)
      : oklabCoordinatesToPlanePoint(x, y as number);
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return {
      ok: false,
      error: { code: "numerical-range", from: definitionOf(value).space, to: plane },
    };
  }
  return {
    ok: true,
    value: { plane, representation: observed.value, point } as ColorPlaneProjection<S>,
  };
}

function hasValidChanges(edit: ColorPlaneEdit): boolean {
  const allowedFields =
    edit.plane === "oklch"
      ? ["plane", "kind", "channels", "point", "alpha", "reference"]
      : ["plane", "kind", "channels", "point", "alpha"];
  if (Object.keys(edit).some((key) => !allowedFields.includes(key))) return false;
  if (edit.kind === "point") {
    return (
      !Object.hasOwn(edit, "channels") &&
      Number.isFinite(edit.point?.x) &&
      Number.isFinite(edit.point?.y)
    );
  }
  if (Object.hasOwn(edit, "point")) return false;
  if (typeof edit.channels !== "object" || edit.channels === null || Array.isArray(edit.channels)) {
    return false;
  }
  const allowed = edit.plane === "oklch" ? ["l", "c", "h"] : ["l", "a", "b"];
  const keys = Object.keys(edit.channels);
  return (
    (keys.length > 0 || Object.hasOwn(edit, "alpha")) && keys.every((key) => allowed.includes(key))
  );
}

/** A real edit re-authors in its named plane; the observed source is never mutated. */
export function authorPlaneEdit(
  value: ColorValue,
  edit: ColorPlaneEdit,
): ColorResult<ColorValue, PlaneEditError> {
  if (edit.plane !== "oklch" && edit.plane !== "oklab") {
    throw new TypeError("Unsupported picker plane");
  }
  if (edit.kind !== "point" && edit.kind !== "channels") {
    throw new TypeError("Unsupported plane edit kind");
  }
  if (!hasValidChanges(edit) || ("reference" in edit && !Number.isFinite(edit.reference?.hue))) {
    return invalidEdit;
  }
  const observed = represent(value, edit.plane);
  if (!observed.ok) return observed;
  const alpha = Object.hasOwn(edit, "alpha") ? edit.alpha! : observed.value.alpha;

  if (edit.plane === "oklch") {
    const [observedL, observedC, observedH] = observed.value
      .channels as ColorRepresentation<"oklch">["channels"];
    const channels = edit.kind === "channels" ? edit.channels : null;
    const point = edit.kind === "point" ? oklchCoordinatesFromPlanePoint(edit.point) : null;
    const l = point?.l ?? (channels && Object.hasOwn(channels, "l") ? channels.l! : observedL);
    const c = point?.c ?? (channels && Object.hasOwn(channels, "c") ? channels.c! : observedC);
    const hasHueEdit = channels !== null && Object.hasOwn(channels, "h");
    let h = hasHueEdit ? channels.h! : observedH;
    if (!hasHueEdit && h === null && edit.reference) h = edit.reference.hue;
    if (c > 0 && h === null && !hasHueEdit) {
      return { ok: false, error: { code: "missing-hue-direction" } };
    }
    return createColorValue({ space: "oklch", channels: [l, c, h], alpha });
  }

  const [observedL, observedA, observedB] = observed.value
    .channels as ColorRepresentation<"oklab">["channels"];
  const channels = edit.kind === "channels" ? edit.channels : null;
  const point =
    edit.kind === "point"
      ? oklabCoordinatesFromPlanePoint(constrainOklabPlanePoint(edit.point))
      : null;
  const l = channels && Object.hasOwn(channels, "l") ? channels.l! : observedL;
  const a = point?.a ?? (channels && Object.hasOwn(channels, "a") ? channels.a! : observedA);
  const b = point?.b ?? (channels && Object.hasOwn(channels, "b") ? channels.b! : observedB);
  return createColorValue({ space: "oklab", channels: [l, a, b], alpha });
}
