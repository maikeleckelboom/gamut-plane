import { OKLCH, parse } from "@texel/color";

import { assertOklchColor, normalizeHue, type OklchColor } from "../color/types.js";

const NUMBER_OR_PERCENT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?%?$/i;
const HUE = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(?:deg)?$/i;

export class UnsupportedColorInputError extends TypeError {
  override name = "UnsupportedColorInputError";
}

function fail(message: string): never {
  throw new UnsupportedColorInputError(message);
}

function parseFinite(token: string, label: string): number {
  const value = Number.parseFloat(token);
  if (!Number.isFinite(value)) fail(`${label} must be a finite number`);
  return value;
}

function validateUnitInterval(token: string, label: string): void {
  if (!NUMBER_OR_PERCENT.test(token)) fail(`${label} has unsupported syntax`);
  const value = parseFinite(token, label);
  const maximum = token.endsWith("%") ? 100 : 1;
  if (value < 0 || value > maximum) fail(`${label} must be between 0 and ${maximum}`);
}

function splitSlash(body: string): [string, string | undefined] {
  const parts = body.split("/");
  if (parts.length > 2) fail("Color input contains more than one alpha separator");
  const channels = parts[0]?.trim();
  if (!channels) fail("Color input is missing channels");
  const alpha = parts[1]?.trim();
  if (parts.length === 2 && !alpha) fail("Color input is missing alpha");
  return [channels, alpha];
}

function validateAlpha(alpha: string | undefined): void {
  if (alpha !== undefined) validateUnitInterval(alpha, "Alpha");
}

function validateRgb(body: string): void {
  if (body.includes(",")) {
    if (body.includes("/")) fail("Comma RGB syntax cannot use a slash alpha separator");
    const tokens = body.split(",").map((token) => token.trim());
    if (tokens.length !== 3 && tokens.length !== 4)
      fail("RGB input requires three channels and optional alpha");
    for (const [index, token] of tokens.slice(0, 3).entries()) {
      if (!NUMBER_OR_PERCENT.test(token ?? ""))
        fail(`RGB channel ${index + 1} has unsupported syntax`);
      const value = parseFinite(token ?? "", `RGB channel ${index + 1}`);
      const maximum = token?.endsWith("%") ? 100 : 255;
      if (value < 0 || value > maximum)
        fail(`RGB channel ${index + 1} must be between 0 and ${maximum}`);
    }
    validateAlpha(tokens[3]);
    return;
  }

  const [channels, alpha] = splitSlash(body);
  const tokens = channels.split(/\s+/);
  if (tokens.length !== 3) fail("RGB input requires exactly three channels");
  for (const [index, token] of tokens.entries()) {
    if (!NUMBER_OR_PERCENT.test(token ?? ""))
      fail(`RGB channel ${index + 1} has unsupported syntax`);
    const value = parseFinite(token ?? "", `RGB channel ${index + 1}`);
    const maximum = token?.endsWith("%") ? 100 : 255;
    if (value < 0 || value > maximum)
      fail(`RGB channel ${index + 1} must be between 0 and ${maximum}`);
  }
  validateAlpha(alpha);
}

function rgbChannelForTexel(token: string): string {
  return token.endsWith("%") ? String((parseFinite(token, "RGB channel") / 100) * 255) : token;
}

function normalizeRgbPercentages(name: string, body: string): string {
  if (body.includes(",")) {
    const tokens = body.split(",").map((token) => token.trim());
    const channels = tokens.slice(0, 3).map(rgbChannelForTexel);
    const alpha = tokens[3];
    return `${name}(${alpha === undefined ? channels.join(", ") : `${channels.join(", ")}, ${alpha}`})`;
  }

  const [channels, alpha] = splitSlash(body);
  const normalizedChannels = channels.split(/\s+/).map(rgbChannelForTexel).join(" ");
  return `${name}(${normalizedChannels}${alpha === undefined ? "" : ` / ${alpha}`})`;
}

function validateOklch(body: string): void {
  const [channels, alpha] = splitSlash(body);
  const tokens = channels.split(/\s+/);
  if (tokens.length !== 3) fail("OKLCH input requires exactly three channels");
  validateUnitInterval(tokens[0] ?? "", "OKLCH lightness");
  if (!NUMBER_OR_PERCENT.test(tokens[1] ?? "")) fail("OKLCH chroma has unsupported syntax");
  if (parseFinite(tokens[1] ?? "", "OKLCH chroma") < 0) fail("OKLCH chroma must not be negative");
  if (!HUE.test(tokens[2] ?? "")) fail("OKLCH hue must be a number or degrees");
  parseFinite(tokens[2] ?? "", "OKLCH hue");
  validateAlpha(alpha);
}

function validateOklab(body: string): void {
  const [channels, alpha] = splitSlash(body);
  const tokens = channels.split(/\s+/);
  if (tokens.length !== 3) fail("OKLab input requires exactly three channels");
  validateUnitInterval(tokens[0] ?? "", "OKLab lightness");
  for (const [index, token] of tokens.slice(1).entries()) {
    if (!NUMBER_OR_PERCENT.test(token ?? ""))
      fail(`OKLab axis ${index + 1} has unsupported syntax`);
    parseFinite(token ?? "", `OKLab axis ${index + 1}`);
  }
  validateAlpha(alpha);
}

function validateColorFunction(body: string): void {
  const [channelsWithSpace, alpha] = splitSlash(body);
  const tokens = channelsWithSpace.split(/\s+/);
  const space = tokens.shift()?.toLowerCase();
  if (!space || !["srgb", "display-p3"].includes(space)) {
    fail("color() supports only srgb and display-p3 inputs");
  }
  if (tokens.length !== 3) fail("color() requires exactly three channels");
  for (const [index, token] of tokens.entries()) {
    validateUnitInterval(token ?? "", `color() channel ${index + 1}`);
  }
  validateAlpha(alpha);
}

function expandFourDigitHex(input: string): string {
  if (input.length !== 5) return input;
  const chars = input.slice(1).split("");
  return `#${chars.map((char) => `${char}${char}`).join("")}`;
}

function validateAndNormalizeInput(raw: string): string {
  const input = raw.trim();
  if (input.length === 0) fail("Color input must not be empty");

  if (input.startsWith("#")) {
    if (!/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(input)) {
      fail("Hex colors must use 3, 4, 6, or 8 hexadecimal digits");
    }
    return expandFourDigitHex(input);
  }

  const match = /^(rgb|rgba|oklab|oklch|color)\((.*)\)$/i.exec(input);
  if (!match) fail("Supported inputs are hex, rgb(), oklab(), oklch(), and color()");
  const name = match[1]?.toLowerCase();
  const body = match[2] ?? "";
  if (name === "rgb" || name === "rgba") {
    validateRgb(body);
    return normalizeRgbPercentages(name, body);
  } else if (name === "oklch") validateOklch(body);
  else if (name === "oklab") validateOklab(body);
  else validateColorFunction(body);
  return input;
}

/** Strict CSS color adapter. All successful results use neutral OKLCH state. */
export function parseCssColor(raw: string): OklchColor {
  if (typeof raw !== "string") fail("Color input must be a string");
  const normalizedInput = validateAndNormalizeInput(raw);

  try {
    const vector = parse(normalizedInput, OKLCH);
    const color: OklchColor = {
      l: Math.min(1, Math.max(0, vector[0] ?? Number.NaN)),
      c: Math.max(0, vector[1] ?? Number.NaN),
      h: normalizeHue(vector[2] ?? 0),
      alpha: Math.min(1, Math.max(0, vector[3] ?? 1)),
    };
    assertOklchColor(color);
    return color;
  } catch (error) {
    if (error instanceof UnsupportedColorInputError) throw error;
    const reason = error instanceof Error ? error.message : String(error);
    fail(`Unable to parse supported color input: ${reason}`);
  }
}
