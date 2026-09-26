import type { ColorResult } from "../result.js";
import {
  frozenRepresentation,
  isRepresentation,
  type ColorRepresentation,
} from "./representation.js";

declare const colorValueBrand: unique symbol;
export type ColorValue = Readonly<{ readonly [colorValueBrand]: "ColorValue" }>;
export type DefinitionError = Readonly<{ code: "invalid-definition" }>;

type ColorValueDataV1 = Readonly<{
  kind: "gamut-plane/color-value";
  version: 1;
  definition: ColorRepresentation;
}>;

export function createColorValue(
  definition: ColorRepresentation,
): ColorResult<ColorValue, DefinitionError> {
  if (!isRepresentation(definition)) return { ok: false, error: { code: "invalid-definition" } };
  const value: ColorValueDataV1 = Object.freeze({
    kind: "gamut-plane/color-value",
    version: 1,
    definition: frozenRepresentation(definition),
  });
  return { ok: true, value: value as unknown as ColorValue };
}

export function isColorValue(input: unknown): input is ColorValue {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const fields = ["kind", "version", "definition"];
  if (!hasFrozenDataFields(input, fields)) return false;
  const data = input as Partial<ColorValueDataV1>;
  if (
    data.kind !== "gamut-plane/color-value" ||
    data.version !== 1 ||
    !isRepresentation(data.definition) ||
    !hasFrozenDataFields(data.definition, ["space", "channels", "alpha"]) ||
    !Array.isArray(data.definition.channels) ||
    !Object.isFrozen(data.definition.channels) ||
    Reflect.ownKeys(data.definition.channels).length !== 4
  )
    return false;
  return [0, 1, 2].every((index) =>
    Object.hasOwn(Object.getOwnPropertyDescriptor(data.definition!.channels, index) ?? {}, "value"),
  );
}

function hasFrozenDataFields(input: object, fields: readonly string[]): boolean {
  if (!Object.isFrozen(input)) return false;
  const keys = Reflect.ownKeys(input);
  return (
    keys.length === fields.length &&
    keys.every(
      (key) =>
        typeof key === "string" &&
        fields.includes(key) &&
        Object.hasOwn(Object.getOwnPropertyDescriptor(input, key) ?? {}, "value"),
    )
  );
}

export function definitionOf(value: ColorValue): ColorRepresentation {
  if (!isColorValue(value)) throw new TypeError("Expected a ColorValue");
  return (value as unknown as ColorValueDataV1).definition;
}

export function definingEquals(a: ColorValue, b: ColorValue): boolean {
  const left = definitionOf(a);
  const right = definitionOf(b);
  return (
    left.space === right.space &&
    left.channels.every((component, index) => Object.is(component, right.channels[index])) &&
    Object.is(left.alpha, right.alpha)
  );
}
