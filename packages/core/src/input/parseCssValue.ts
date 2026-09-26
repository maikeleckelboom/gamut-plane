import type { ColorResult } from "../result.js";
import { createColorValue, type ColorValue } from "../color/value.js";
import type { ColorRepresentation } from "../color/representation.js";

export interface CssColorSource {
  readonly kind: "css";
  readonly originalText: string;
  readonly syntax: "hex" | "rgb" | "color" | "oklab" | "oklch";
}
export interface ParsedCssColor {
  readonly value: ColorValue;
  readonly source: CssColorSource;
}
export type CssInputError = Readonly<{
  code:
    | "invalid-literal"
    | "unsupported-syntax"
    | "unsupported-missing-component"
    | "requires-css-normalization";
}>;

const numberToken = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const hueToken = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(?:deg)?$/i;

function parseNumber(token: string): number | null {
  if (!numberToken.test(token)) return null;
  const number = Number(token);
  return Number.isFinite(number) ? number : null;
}

function parseHue(token: string): number | null {
  const match = hueToken.exec(token);
  return match ? parseNumber(match[1]!) : null;
}

function parseBody(body: string): readonly [string[], string | undefined] | null {
  const parts = body.trim().split("/");
  if (parts.length > 2 || parts[0]?.trim() === "") return null;
  const channels = parts[0]!.trim().split(/\s+/);
  const alpha = parts[1]?.trim();
  if (parts.length === 2 && !alpha) return null;
  return [channels, alpha];
}

function fail(code: CssInputError["code"]): ColorResult<ParsedCssColor, CssInputError> {
  return { ok: false, error: { code } };
}

export function parseCssValue(text: string): ColorResult<ParsedCssColor, CssInputError> {
  if (typeof text !== "string") return fail("invalid-literal");
  const input = text.trim();
  let syntax: CssColorSource["syntax"];
  let definition: ColorRepresentation;

  if (input.startsWith("#")) {
    if (!/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(input))
      return fail("invalid-literal");
    syntax = "hex";
    const digits = input.slice(1);
    const expanded =
      digits.length <= 4 ? [...digits].map((digit) => digit + digit).join("") : digits;
    const bytes = expanded.match(/.{2}/g)!.map((part) => Number.parseInt(part, 16));
    definition = {
      space: "srgb",
      channels: [bytes[0]! / 255, bytes[1]! / 255, bytes[2]! / 255],
      alpha: bytes[3] === undefined ? 1 : bytes[3] / 255,
    };
  } else {
    const match = /^([a-z-]+)\((.*)\)$/is.exec(input);
    if (!match) return fail("unsupported-syntax");
    const name = match[1]!.toLowerCase();
    if (
      name !== "rgb" &&
      name !== "rgba" &&
      name !== "color" &&
      name !== "oklab" &&
      name !== "oklch"
    )
      return fail("unsupported-syntax");
    syntax = name === "rgba" ? "rgb" : name;
    const body = parseBody(match[2]!);
    if (!body) return fail("invalid-literal");
    const [tokens, alphaToken] = body;
    if (/\bnone\b/i.test(match[2]!)) {
      const neutralNone =
        name === "oklch" &&
        tokens.length === 3 &&
        tokens[2]?.toLowerCase() === "none" &&
        parseNumber(tokens[1]!) === 0 &&
        alphaToken?.toLowerCase() !== "none";
      if (!neutralNone) return fail("unsupported-missing-component");
    }
    if (input.includes(",") || input.includes("%")) return fail("unsupported-syntax");
    const alpha = alphaToken === undefined ? 1 : parseNumber(alphaToken);
    if (alpha === null) return fail("invalid-literal");
    if (alpha < 0 || alpha > 1) return fail("requires-css-normalization");
    if (name === "color") {
      const space = tokens.shift()?.toLowerCase();
      if (space !== "srgb" && space !== "display-p3") return fail("unsupported-syntax");
      if (tokens.length !== 3) return fail("invalid-literal");
      const channels = tokens.map(parseNumber);
      if (channels.some((part) => part === null)) return fail("invalid-literal");
      definition = { space, channels: channels as [number, number, number], alpha };
    } else {
      if (tokens.length !== 3) return fail("invalid-literal");
      const first = parseNumber(tokens[0]!);
      const second = parseNumber(tokens[1]!);
      const third =
        name === "oklch" && tokens[2]!.toLowerCase() === "none"
          ? null
          : name === "oklch"
            ? parseHue(tokens[2]!)
            : parseNumber(tokens[2]!);
      if (first === null || second === null || (third === null && name !== "oklch"))
        return fail("invalid-literal");
      if (name === "rgb" || name === "rgba") {
        if (third === null) return fail("invalid-literal");
        if ([first, second, third].some((part) => part < 0 || part > 255))
          return fail("requires-css-normalization");
        definition = { space: "srgb", channels: [first / 255, second / 255, third / 255], alpha };
      } else if (name === "oklab") {
        if (third === null) return fail("invalid-literal");
        if (first < 0 || first > 1) return fail("requires-css-normalization");
        definition = { space: "oklab", channels: [first, second, third], alpha };
      } else {
        if (first < 0 || first > 1 || second < 0 || (third !== null && (third < 0 || third >= 360)))
          return fail("requires-css-normalization");
        definition = { space: "oklch", channels: [first, second, third], alpha };
      }
    }
  }
  const created = createColorValue(definition);
  if (!created.ok) return fail("invalid-literal");
  return {
    ok: true,
    value: {
      value: created.value,
      source: Object.freeze({ kind: "css", originalText: text, syntax }),
    },
  };
}
