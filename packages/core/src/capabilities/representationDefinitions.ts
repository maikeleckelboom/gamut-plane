import { represent } from "../color/represent.js";
import { createColorValue } from "../color/value.js";
import type { RepresentationDefinitions } from "./types/representationDefinitions.js";

export type {
  ChannelDefinition,
  ChannelId,
  RepresentationDefinition,
} from "./types/representationDefinitions.js";

const finite = Object.freeze({ kind: "finite" } as const);
const nonnegative = Object.freeze({ kind: "finite-lower-bound", minimum: 0 } as const);
const unitReference = Object.freeze([0, 1] as const);
const modelCoordinates = Object.freeze({ kind: "model-coordinates" } as const);
const coordinateFacts = Object.freeze({
  unit: "coordinate",
  domain: finite,
  nominalRange: null,
  cyclic: null,
  missing: "not-supported",
  effect: "always-effective",
} as const);
const lightnessFacts = Object.freeze({ ...coordinateFacts, nominalRange: unitReference });
const rgbFacts = Object.freeze({ ...lightnessFacts, unit: "encoded-rgb" } as const);

/** Closed internal built-ins. Construction support does not imply an instrument editor. */
export const representationDefinitions: RepresentationDefinitions = Object.freeze({
  oklch: Object.freeze({
    id: "oklch",
    associatedGamutId: null,
    model: "oklab",
    coordinateKind: "cylindrical",
    referenceContext: "d65",
    encoding: modelCoordinates,
    channels: Object.freeze([
      Object.freeze({
        ...lightnessFacts,
        id: "oklch.l",
        representationId: "oklch",
        index: 0,
        symbol: "L",
      }),
      Object.freeze({
        ...coordinateFacts,
        id: "oklch.c",
        representationId: "oklch",
        index: 1,
        symbol: "C",
        domain: nonnegative,
      }),
      Object.freeze({
        ...coordinateFacts,
        id: "oklch.h",
        representationId: "oklch",
        index: 2,
        symbol: "H",
        unit: "degree",
        cyclic: Object.freeze({ period: 360 }),
        missing: "oklch-neutral-hue",
        effect: "oklch-hue-at-zero-chroma",
      }),
    ] as const),
    observe: represent,
    author: createColorValue,
  }),
  oklab: Object.freeze({
    id: "oklab",
    associatedGamutId: null,
    model: "oklab",
    coordinateKind: "cartesian",
    referenceContext: "d65",
    encoding: modelCoordinates,
    channels: Object.freeze([
      Object.freeze({
        ...lightnessFacts,
        id: "oklab.l",
        representationId: "oklab",
        index: 0,
        symbol: "L",
      }),
      Object.freeze({
        ...coordinateFacts,
        id: "oklab.a",
        representationId: "oklab",
        index: 1,
        symbol: "a",
      }),
      Object.freeze({
        ...coordinateFacts,
        id: "oklab.b",
        representationId: "oklab",
        index: 2,
        symbol: "b",
      }),
    ] as const),
    observe: represent,
    author: createColorValue,
  }),
  srgb: Object.freeze({
    id: "srgb",
    associatedGamutId: "srgb-gamut",
    model: "rgb",
    coordinateKind: "cartesian",
    referenceContext: "d65",
    encoding: Object.freeze({ kind: "rgb", primaries: "srgb", transfer: "srgb" }),
    channels: Object.freeze([
      Object.freeze({ ...rgbFacts, id: "srgb.r", representationId: "srgb", index: 0, symbol: "R" }),
      Object.freeze({ ...rgbFacts, id: "srgb.g", representationId: "srgb", index: 1, symbol: "G" }),
      Object.freeze({ ...rgbFacts, id: "srgb.b", representationId: "srgb", index: 2, symbol: "B" }),
    ] as const),
    observe: represent,
    author: createColorValue,
  }),
  "display-p3": Object.freeze({
    id: "display-p3",
    associatedGamutId: "display-p3-gamut",
    model: "rgb",
    coordinateKind: "cartesian",
    referenceContext: "d65",
    encoding: Object.freeze({ kind: "rgb", primaries: "display-p3", transfer: "srgb" }),
    channels: Object.freeze([
      Object.freeze({
        ...rgbFacts,
        id: "display-p3.r",
        representationId: "display-p3",
        index: 0,
        symbol: "R",
      }),
      Object.freeze({
        ...rgbFacts,
        id: "display-p3.g",
        representationId: "display-p3",
        index: 1,
        symbol: "G",
      }),
      Object.freeze({
        ...rgbFacts,
        id: "display-p3.b",
        representationId: "display-p3",
        index: 2,
        symbol: "B",
      }),
    ] as const),
    observe: represent,
    author: createColorValue,
  }),
});
