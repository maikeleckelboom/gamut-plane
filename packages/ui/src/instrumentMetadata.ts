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
  numericBounds: Readonly<{ min: number; max?: number }>;
  step: number;
  precision: number;
}>;

/** Input mechanism is separate from semantic authorship. No executor or value-derived facts. */
export type CompanionControl = CompanionBinding &
  NumericPresentation &
  (
    | Readonly<{
        controlKind: "range-and-number";
        symbol: "H" | "L" | "C";
        sliderRange: Readonly<{ min: number; max: number }>;
      }>
    | Readonly<{ controlKind: "number"; symbol: "a" | "b"; numericLabel: string }>
  );

export type EditorUi = {
  [E in EditorDefinition as E["id"]]: Readonly<{
    id: E["id"];
    representationId: E["representationId"];
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
const discNumericBounds = Object.freeze({ min: -0.4, max: 0.4 });

export const editorUi = Object.freeze({
  "oklch-lc": Object.freeze({
    id: "oklch-lc",
    representationId: "oklch",
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
    companions: Object.freeze([
      Object.freeze({
        channelId: "oklab.l",
        operationId: "oklab-channel-patch",
        controlKind: "range-and-number",
        symbol: "L",
        label: "OKLab lightness · fixed axis",
        sliderRange: unitBounds,
        numericBounds: unitBounds,
        step: 0.001,
        precision: 4,
      }),
      Object.freeze({
        channelId: "oklab.a",
        operationId: "oklab-disc-coordinate",
        controlKind: "number",
        symbol: "a",
        label: "a",
        numericLabel: "OKLab a numeric value",
        numericBounds: discNumericBounds,
        step: 0.001,
        precision: 4,
      }),
      Object.freeze({
        channelId: "oklab.b",
        operationId: "oklab-disc-coordinate",
        controlKind: "number",
        symbol: "b",
        label: "b",
        numericLabel: "OKLab b numeric value",
        numericBounds: discNumericBounds,
        step: 0.001,
        precision: 4,
      }),
    ] as const),
  }),
} satisfies { readonly [E in EditorUi as E["id"]]: E });

/** Explicit current admission and order. Never enumerate technical capability catalogs. */
export const currentPrimaryEditors = Object.freeze([
  editorUi["oklch-lc"],
  editorUi["oklab-ab"],
] as const);
export const currentViewOptions = Object.freeze(
  currentPrimaryEditors.map((editor) => editor.representationId),
);
type CurrentView = (typeof currentViewOptions)[number];

/** Bounded bridge for the unchanged public two-view API. Render's bridge is contract-tested. */
export const currentEditorByView = Object.freeze({
  oklch: editorUi["oklch-lc"].id,
  oklab: editorUi["oklab-ab"].id,
} satisfies {
  readonly [V in CurrentView]: Extract<EditorDefinition, { representationId: V }>["id"];
});
