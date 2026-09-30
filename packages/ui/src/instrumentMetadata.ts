import type {
  ChannelDefinition,
  ChannelId,
  EditOperationDefinition,
  EditOperationId,
  EditorDefinition,
  EditorId,
  RepresentationDefinition,
} from "@gamut-plane/core/internal/capabilities";

/** Technical compatibility only; the concrete rows below decide product exposure. */
export type CompanionBinding = {
  [O in EditOperationDefinition as O["id"]]: O extends {
    kind: "normalized-hue";
    channelId: infer C extends ChannelId;
  }
    ? Readonly<{ channelId: C; operationId: O["id"] }>
    : O extends { kind: "disc-coordinate"; bindings: infer B }
      ? Readonly<{ channelId: keyof B & ChannelId; operationId: O["id"] }>
      : O extends { kind: "channel-patch" }
        ? Readonly<{
            channelId: ChannelDefinition<O["representationId"]>["id"];
            operationId: O["id"];
          }>
        : never;
}[EditOperationId];

type NumericPresentation = Readonly<{
  label: string;
  step: number;
  precision: number;
}>;

/** Input mechanism is separate from semantic authorship. No executor or value-derived facts. */
export type CompanionControl = CompanionBinding &
  NumericPresentation &
  Readonly<{
    controlKind: "range-and-number";
    symbol: "H" | "L" | "C" | "a" | "b" | "R" | "G" | "B";
  }> &
  (
    | Readonly<{
        sliderRange: Readonly<{ min: number; max: number }>;
        numericBounds: Readonly<{ min?: number; max?: number }>;
      }>
    | Readonly<{
        operationId: "oklab-disc-coordinate";
        sliderRange: "geometry";
        numericBounds: "geometry";
        accessibleLabel: string;
      }>
  );

export type EditorUi = {
  [E in EditorDefinition as E["id"]]: Readonly<{
    id: E["id"];
    representationId: E["representationId"];
    label: string;
    description: string;
    optionLabel?: string;
    companions: readonly (CompanionControl & {
      readonly channelId: ChannelDefinition<E["representationId"]>["id"];
    })[];
  }>;
}[EditorId];

/** Metadata existence grants neither primary admission nor selector exposure. */
export const representationUi = Object.freeze({
  oklch: Object.freeze({ id: "oklch", label: "OKLCH" }),
  oklab: Object.freeze({ id: "oklab", label: "OKLab" }),
  srgb: Object.freeze({ id: "srgb", label: "sRGB" }),
  "display-p3": Object.freeze({ id: "display-p3", label: "Display P3" }),
} satisfies {
  readonly [R in RepresentationDefinition["id"]]: Readonly<{ id: R; label: string }>;
});

// Ordinary UI policies, deliberately independent of authored validity and geometry math.
const unitBounds = Object.freeze({ min: 0, max: 1 });
const hueBounds = Object.freeze({ min: 0, max: 360 });
const chromaSliderRange = Object.freeze({ min: 0, max: 0.4 });
const chromaNumericBounds = Object.freeze({ min: 0 });
const rgbNumericBounds = Object.freeze({});

function rgbCompanions<R extends "srgb" | "display-p3">(representationId: R) {
  const common = {
    operationId: `${representationId}-channel-patch`,
    controlKind: "range-and-number",
    sliderRange: unitBounds,
    numericBounds: rgbNumericBounds,
    step: 0.001,
    precision: 4,
  } as const;
  return Object.freeze([
    Object.freeze({
      ...common,
      channelId: `${representationId}.r`,
      coordinate: "r",
      symbol: "R",
      label: "Red",
    } as const),
    Object.freeze({
      ...common,
      channelId: `${representationId}.g`,
      coordinate: "g",
      symbol: "G",
      label: "Green",
    } as const),
    Object.freeze({
      ...common,
      channelId: `${representationId}.b`,
      coordinate: "b",
      symbol: "B",
      label: "Blue",
    } as const),
  ] as const);
}
const srgbCompanions = rgbCompanions("srgb");
const p3Companions = rgbCompanions("display-p3");

export const editorUi = Object.freeze({
  "oklch-lc": Object.freeze({
    id: "oklch-lc",
    representationId: "oklch",
    label: "Lightness / Chroma",
    description: "Lightness and chroma area with fixed Hue",
    companions: Object.freeze([
      Object.freeze({
        channelId: "oklch.h",
        operationId: "oklch-hue-edit",
        controlKind: "range-and-number",
        symbol: "H",
        label: "Hue",
        sliderRange: hueBounds,
        numericBounds: hueBounds,
        step: 0.1,
        precision: 1,
      }),
      Object.freeze({
        channelId: "oklch.l",
        operationId: "oklch-channel-patch",
        controlKind: "range-and-number",
        symbol: "L",
        label: "Lightness",
        sliderRange: unitBounds,
        numericBounds: unitBounds,
        step: 0.001,
        precision: 4,
      }),
      Object.freeze({
        channelId: "oklch.c",
        operationId: "oklch-channel-patch",
        controlKind: "range-and-number",
        symbol: "C",
        label: "Chroma",
        sliderRange: chromaSliderRange,
        numericBounds: chromaNumericBounds,
        step: 0.001,
        precision: 4,
      }),
    ] as const),
  }),
  "oklab-ab": Object.freeze({
    id: "oklab-ab",
    representationId: "oklab",
    label: "a / b",
    description: "a and b disc with fixed Lightness",
    companions: Object.freeze([
      Object.freeze({
        channelId: "oklab.l",
        operationId: "oklab-channel-patch",
        controlKind: "range-and-number",
        symbol: "L",
        label: "Lightness",
        sliderRange: unitBounds,
        numericBounds: unitBounds,
        step: 0.001,
        precision: 4,
      }),
      Object.freeze({
        channelId: "oklab.a",
        operationId: "oklab-disc-coordinate",
        controlKind: "range-and-number",
        symbol: "a",
        label: "a",
        accessibleLabel: "OKLab a",
        sliderRange: "geometry",
        numericBounds: "geometry",
        step: 0.001,
        precision: 4,
      }),
      Object.freeze({
        channelId: "oklab.b",
        operationId: "oklab-disc-coordinate",
        controlKind: "range-and-number",
        symbol: "b",
        label: "b",
        accessibleLabel: "OKLab b",
        sliderRange: "geometry",
        numericBounds: "geometry",
        step: 0.001,
        precision: 4,
      }),
    ] as const),
  }),
  "srgb-rg": Object.freeze({
    id: "srgb-rg",
    representationId: "srgb",
    label: "R / G",
    optionLabel: "R / G · fixed B",
    description: "Horizontal Red and vertical Green with fixed Blue.",
    companions: srgbCompanions,
  }),
  "srgb-rb": Object.freeze({
    id: "srgb-rb",
    representationId: "srgb",
    label: "R / B",
    optionLabel: "R / B · fixed G",
    description: "Horizontal Red and vertical Blue with fixed Green.",
    companions: srgbCompanions,
  }),
  "srgb-gb": Object.freeze({
    id: "srgb-gb",
    representationId: "srgb",
    label: "G / B",
    optionLabel: "G / B · fixed R",
    description: "Horizontal Green and vertical Blue with fixed Red.",
    companions: srgbCompanions,
  }),
  "display-p3-rg": Object.freeze({
    id: "display-p3-rg",
    representationId: "display-p3",
    label: "R / G",
    optionLabel: "R / G · fixed B",
    description: "Horizontal Red and vertical Green with fixed Blue.",
    companions: p3Companions,
  }),
  "display-p3-rb": Object.freeze({
    id: "display-p3-rb",
    representationId: "display-p3",
    label: "R / B",
    optionLabel: "R / B · fixed G",
    description: "Horizontal Red and vertical Blue with fixed Green.",
    companions: p3Companions,
  }),
  "display-p3-gb": Object.freeze({
    id: "display-p3-gb",
    representationId: "display-p3",
    label: "G / B",
    optionLabel: "G / B · fixed R",
    description: "Horizontal Green and vertical Blue with fixed Red.",
    companions: p3Companions,
  }),
} satisfies { readonly [E in EditorUi as E["id"]]?: E });

/** Explicit current admission and order. Never enumerate technical capability catalogs. */
export const currentPrimaryEditors = Object.freeze([
  editorUi["oklch-lc"],
  editorUi["oklab-ab"],
  editorUi["srgb-rg"],
  editorUi["srgb-rb"],
  editorUi["srgb-gb"],
  editorUi["display-p3-rg"],
  editorUi["display-p3-rb"],
  editorUi["display-p3-gb"],
] as const);

/** Admission is a product decision; this default says nothing about technical cardinality. */
export const preferredEditors = Object.freeze({
  oklch: editorUi["oklch-lc"].id,
  oklab: editorUi["oklab-ab"].id,
  srgb: editorUi["srgb-rg"].id,
  "display-p3": editorUi["display-p3-rg"].id,
} as const);
