import type {
  ColorRepresentation,
  CssOutputError,
  DisplayGamut,
  GamutStatus,
  HexOutputError,
} from "@gamut-plane/core";

export const CSS_DISPLAY_DECIMALS = 6;
export const exactStatusLabel: Record<GamutStatus, string> = {
  inside: "Inside",
  "within-tolerance": "Within tolerance",
  outside: "Outside",
};

export function unavailableOutput(
  code: CssOutputError["code"] | HexOutputError["code"],
  gamut: DisplayGamut,
) {
  const label = gamut === "srgb" ? "sRGB" : "Display P3";
  if (code === "out-of-gamut")
    return {
      compact: `Unavailable · outside ${label}`,
      explanation: `Selected color is outside ${label}; no clipped value is emitted.`,
      showBoundaryPreview: true,
    };
  if (code === "boundary-tolerance")
    return {
      compact: "Unavailable · boundary tolerance",
      explanation: `Selected color is within tolerance of the ${label} boundary; strict output is unavailable.`,
      showBoundaryPreview: true,
    };
  const reason = {
    "numerical-range": "numerical range",
    "alpha-required": "alpha required",
    "invalid-definition": "invalid definition",
    "requires-css-normalization": "CSS normalization required",
  }[code];
  return {
    compact: `Unavailable · ${reason}`,
    explanation: `${label} output is unavailable: ${reason}.`,
    showBoundaryPreview: false,
  };
}

function formatDecimal(value: number, maximumDecimals = CSS_DISPLAY_DECIMALS): string {
  if (!Number.isFinite(value)) {
    throw new TypeError("CSS display values must be finite");
  }

  const rounded = Number(value.toFixed(maximumDecimals));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** Formats an observed OKLCH representation without changing the copied source value. */
export function formatOklchForDisplay(color: ColorRepresentation<"oklch">): string {
  const [l, c, h] = color.channels;
  const coordinates = `${formatDecimal(l * 100, 3)}% ${formatDecimal(c)} ${h === null ? "none" : formatDecimal(h)}`;
  const alpha = color.alpha < 1 ? ` / ${formatDecimal(color.alpha)}` : "";
  return `oklch(${coordinates}${alpha})`;
}

/** Rounds color() channels for display while preserving its color-space identifier. */
export function formatRgbCssForDisplay(serialized: string): string {
  const colorMatch = /^color\((display-p3|srgb)\s+(.+)\)$/.exec(serialized);
  if (colorMatch) {
    const [, space, body] = colorMatch;
    if (!space || !body) return serialized;
    const channels = body
      .trim()
      .split(/\s+/)
      .map((token) => {
        if (token === "/") return token;
        const value = Number(token);
        return Number.isFinite(value) ? formatDecimal(value) : token;
      });
    // Alpha 1 is optional in color(); keep the displayed line compact without changing copy output.
    if (channels.at(-2) === "/" && channels.at(-1) === "1") channels.splice(-2);
    return `color(${space} ${channels.join(" ")})`;
  }

  const rgbaMatch = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([^)]+)\)$/.exec(serialized);
  if (rgbaMatch) {
    const [, red, green, blue, alpha] = rgbaMatch;
    return `rgba(${red}, ${green}, ${blue}, ${formatDecimal(Number(alpha))})`;
  }

  return serialized;
}
