import {
  represent,
  type ColorRepresentation,
  type ColorResult,
  type ColorValue,
  type ConversionError,
  type GamutId,
} from "../../src/index.js";
import type { RepresentationDefinition } from "../../src/capabilities/representationDefinitions.js";
import {
  analyzeRequestedGamuts,
  type GamutCheckResult,
} from "../../src/capabilities/requestedGamuts.js";

declare const value: ColorValue;
declare const representationId: RepresentationDefinition["id"];
represent(value, representationId) satisfies ColorResult<ColorRepresentation, ConversionError>;
represent(value, "srgb") satisfies ColorResult<ColorRepresentation<"srgb">, ConversionError>;
represent(value, "oklch") satisfies ColorResult<ColorRepresentation<"oklch">, ConversionError>;
// @ts-expect-error observation result remains correlated with the requested representation
represent(value, "srgb") satisfies ColorResult<ColorRepresentation<"oklch">, ConversionError>;
declare const row: GamutCheckResult;
row.gamutId satisfies GamutId;
analyzeRequestedGamuts(value, []) satisfies readonly GamutCheckResult[];
// @ts-expect-error representation identities are not gamut identities
analyzeRequestedGamuts(value, ["srgb"]);
// @ts-expect-error result collections are derived readonly facts
analyzeRequestedGamuts(value, []).push(row);
// @ts-expect-error collection operation stays out of the public root
export type RootCollection = typeof import("../../src/index.js").analyzeRequestedGamuts;
