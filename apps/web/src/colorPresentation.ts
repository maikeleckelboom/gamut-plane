import type { OklchColor } from "@gamut-plane/core";

export const CSS_DISPLAY_DECIMALS = 6;

function formatDecimal(value: number, maximumDecimals = CSS_DISPLAY_DECIMALS): string {
  if (!Number.isFinite(value)) {
    throw new TypeError("CSS display values must be finite");
  }

  const rounded = Number(value.toFixed(maximumDecimals));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** Formats canonical OKLCH for compact display without changing the copied source value. */
export function formatOklchForDisplay(color: OklchColor): string {
  const coordinates = `${formatDecimal(color.l * 100, 3)}% ${formatDecimal(
    color.c,
  )} ${formatDecimal(color.h)}`;
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
    return `color(${space} ${channels.join(" ")})`;
  }

  const rgbaMatch = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([^)]+)\)$/.exec(serialized);
  if (rgbaMatch) {
    const [, red, green, blue, alpha] = rgbaMatch;
    return `rgba(${red}, ${green}, ${blue}, ${formatDecimal(Number(alpha))})`;
  }

  return serialized;
}
