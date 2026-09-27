import type { ColorPlaneProjection, ColorValue, ConversionError } from "@gamut-plane/core";
import {
  editorDefinitions,
  geometryDefinitions,
  type EditorDefinition,
  type EditorId,
  type GeometryDefinition,
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

type FixedCoordinate =
  | Readonly<{ channelId: "oklch.h"; value: number | null }>
  | Readonly<{ channelId: "oklab.l"; value: number }>;

interface ProjectedField {
  readonly projection: ColorPlaneProjection;
  readonly fixedCoordinate: FixedCoordinate;
  /** Raw projection stays outside the editing domain; presentation may constrain its marker. */
  readonly markerInDomain: boolean;
}

export type FieldResolution =
  | Readonly<{ kind: "no-field-requested" }>
  | Readonly<{ kind: "field-unsupported" }>
  | Readonly<{
      kind: "value-unavailable";
      reason: "projection-failed";
      error: ConversionError;
    }>
  | (ProjectedField &
      Readonly<{
        kind: "value-unavailable";
        reason: "fixed-lightness-out-of-range";
      }>)
  | (ProjectedField &
      Readonly<{
        kind: "available";
        /** Missing Hue uses the existing achromatic slice, without inventing an observed Hue. */
        samplingFixed: number;
      }>);

/** Projects only the active editor. No Canvas access, other editor projection, or re-authorship. */
export function resolveField(value: ColorValue, support: EditorVisualSupport): FieldResolution {
  if (support.kind === "no-editor-requested") return { kind: "no-field-requested" };
  if (support.field === null) return { kind: "field-unsupported" };
  const { geometry } = support;
  const result =
    geometry.planeId === "oklch"
      ? geometry.project(value, geometry.planeId)
      : geometry.project(value, geometry.planeId);
  if (!result.ok) {
    return { kind: "value-unavailable", reason: "projection-failed", error: result.error };
  }
  const projection = result.value;
  const fixedCoordinate: FixedCoordinate =
    projection.plane === "oklch"
      ? { channelId: "oklch.h", value: projection.representation.channels[2] }
      : { channelId: "oklab.l", value: projection.representation.channels[0] };
  const facts = {
    projection,
    fixedCoordinate,
    markerInDomain: geometry.contains(projection.point),
  };
  if (
    fixedCoordinate.channelId === "oklab.l" &&
    (fixedCoordinate.value < 0 || fixedCoordinate.value > 1)
  ) {
    return { ...facts, kind: "value-unavailable", reason: "fixed-lightness-out-of-range" };
  }
  return { ...facts, kind: "available", samplingFixed: fixedCoordinate.value ?? 0 };
}
