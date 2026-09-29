import type { ColorValue, ConversionError, ColorResult } from "@gamut-plane/core";
import {
  editorDefinitions,
  geometryDefinitions,
  type EditorDefinition,
  type EditorId,
  type GeometryDefinition,
  type GeometryProjection,
} from "@gamut-plane/core/internal/capabilities";
import { fieldSupport, type FieldSupport } from "./fieldSupport.js";

export type EditorVisualSupport =
  | Readonly<{ kind: "no-editor-requested" }>
  | Readonly<{
      kind: "editor";
      editor: EditorDefinition;
      geometry: GeometryDefinition;
      /** A technical editor need not have a field renderer. */
      field: FieldSupport | null;
    }>;

export type ProductionProjection =
  | GeometryProjection<"oklch", "oklch-lc-rectangle", "oklch.c", "oklch.l", "oklch.h">
  | GeometryProjection<"oklab", "oklab-ab-disc", "oklab.a", "oklab.b", "oklab.l">;

/** Technical facts only. Product admission and environment readiness belong to callers. */
export function resolveEditorVisualSupport(editorId: EditorId | null): EditorVisualSupport {
  if (editorId === null) return { kind: "no-editor-requested" };
  const editor = editorDefinitions[editorId];
  const fields: Readonly<Partial<Record<EditorId, FieldSupport>>> = fieldSupport;
  return {
    kind: "editor",
    editor,
    geometry: geometryDefinitions[editor.geometryId],
    field: fields[editorId] ?? null,
  };
}

type FixedCoordinate = Readonly<{ channelId: string; value: number | null }>;

interface ProjectedField<P extends GeometryProjection = GeometryProjection> {
  readonly projection: P;
  readonly fixedCoordinate: FixedCoordinate;
  /** Raw projection stays outside the editing domain; presentation may constrain its marker. */
  readonly markerInDomain: boolean;
}

export type FieldResolution<P extends GeometryProjection = ProductionProjection> =
  | Readonly<{ kind: "no-field-requested" }>
  | Readonly<{ kind: "field-unsupported" }>
  | Readonly<{
      kind: "value-unavailable";
      reason: "projection-failed";
      error: ConversionError;
    }>
  | (ProjectedField<P> &
      Readonly<{
        kind: "value-unavailable";
        reason: "fixed-coordinate-out-of-domain";
      }>)
  | (ProjectedField<P> &
      Readonly<{
        kind: "available";
        /** Missing Hue uses the existing achromatic slice, without inventing an observed Hue. */
        samplingFixed: number;
      }>);

/** The geometry owns projection and fixed-axis validity, including test-only geometries. */
export function resolveGeometryField<P extends GeometryProjection>(
  value: ColorValue,
  geometry: Readonly<{
    project: (value: ColorValue) => ColorResult<P, ConversionError>;
    contains: (point: P["point"]) => boolean;
    samplingFixed: (fixed: number | null) => number | null;
  }>,
): FieldResolution<P> {
  const result = geometry.project(value);
  if (!result.ok) {
    return { kind: "value-unavailable", reason: "projection-failed", error: result.error };
  }
  const projection = result.value;
  const fixedCoordinate: FixedCoordinate = {
    channelId: projection.channels.fixed,
    value: projection.coordinates.fixed,
  };
  const facts = {
    projection,
    fixedCoordinate,
    markerInDomain: geometry.contains(projection.point),
  };
  const samplingFixed = geometry.samplingFixed(fixedCoordinate.value);
  if (samplingFixed === null)
    return { ...facts, kind: "value-unavailable", reason: "fixed-coordinate-out-of-domain" };
  return { ...facts, kind: "available", samplingFixed };
}

/** Projects only the selected technical editor; field rendering is a separate capability. */
export function resolveField(value: ColorValue, support: EditorVisualSupport): FieldResolution {
  if (support.kind === "no-editor-requested") return { kind: "no-field-requested" };
  if (support.field === null) return { kind: "field-unsupported" };
  return resolveGeometryField<ProductionProjection>(value, support.geometry);
}
