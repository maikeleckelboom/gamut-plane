import { DisplayP3, DisplayP3Linear, OKLab, convert, sRGB, sRGBLinear } from "@texel/color";

import type { ColorResult } from "../result.js";
import {
  frozenRepresentation,
  isColorSpaceId,
  type ColorRepresentation,
  type ColorSpaceId,
} from "./representation.js";
import { definitionOf, type ColorValue } from "./value.js";

export type ConversionError = Readonly<{
  code: "numerical-range";
  from: ColorSpaceId;
  to: ColorSpaceId;
}>;

const spaces = { oklab: OKLab, srgb: sRGB, "display-p3": DisplayP3 } as const;
const linearSpaces = { srgb: sRGBLinear, "display-p3": DisplayP3Linear } as const;

function labFrom(definition: ColorRepresentation): readonly [number, number, number] | null {
  if (definition.space === "oklab") return definition.channels;
  if (definition.space === "oklch") {
    const [l, c, h] = definition.channels;
    if (c === 0) return [l, 0, 0];
    if (h === null) return null;
    const radians = ((h % 360) * Math.PI) / 180;
    return [l, c * Math.cos(radians), c * Math.sin(radians)];
  }
  const [r, g, b] = definition.channels;
  if (r === g && g === b) {
    const linear = convert([r, g, b], spaces[definition.space], linearSpaces[definition.space]);
    return [Math.cbrt(linear[0]!), 0, 0];
  }
  const converted = convert([r, g, b], spaces[definition.space], OKLab);
  return [converted[0]!, converted[1]!, converted[2]!];
}

export function represent<S extends ColorSpaceId>(
  value: ColorValue,
  space: S,
): ColorResult<ColorRepresentation<S>, ConversionError> {
  const definition = definitionOf(value);
  if (!isColorSpaceId(space)) throw new TypeError("Unsupported color space");
  if (definition.space === space) {
    return { ok: true, value: frozenRepresentation(definition) as ColorRepresentation<S> };
  }

  if (
    (definition.space === "srgb" || definition.space === "display-p3") &&
    (space === "srgb" || space === "display-p3")
  ) {
    const [r, g, b] = definition.channels;
    const target = space as "srgb" | "display-p3";
    const converted =
      r === g && g === b ? [r, g, b] : convert([r, g, b], spaces[definition.space], spaces[target]);
    if (!converted.every(Number.isFinite)) {
      return { ok: false, error: { code: "numerical-range", from: definition.space, to: space } };
    }
    return {
      ok: true,
      value: frozenRepresentation({
        space,
        channels: [converted[0]!, converted[1]!, converted[2]!],
        alpha: definition.alpha,
      } as ColorRepresentation<S>),
    };
  }

  const lab = labFrom(definition);
  let channels: readonly [number, number, number | null];
  if (lab === null || !lab.every(Number.isFinite)) {
    return { ok: false, error: { code: "numerical-range", from: definition.space, to: space } };
  }
  if (space === "oklab") channels = lab;
  else if (space === "oklch") {
    const [l, a, b] = lab;
    const c = Math.hypot(a, b);
    const h = a === 0 && b === 0 ? null : ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
    channels = [l, c, h];
  } else {
    const target = space as "srgb" | "display-p3";
    let converted: number[];
    if (lab[1] === 0 && lab[2] === 0) {
      const neutralLinear = lab[0] ** 3;
      converted = convert(
        [neutralLinear, neutralLinear, neutralLinear],
        linearSpaces[target],
        spaces[target],
      );
    } else converted = convert([lab[0], lab[1], lab[2]], OKLab, spaces[target]);
    channels = [converted[0]!, converted[1]!, converted[2]!];
  }
  if (!channels.every((component) => component === null || Number.isFinite(component))) {
    return { ok: false, error: { code: "numerical-range", from: definition.space, to: space } };
  }
  return {
    ok: true,
    value: frozenRepresentation({
      space,
      channels,
      alpha: definition.alpha,
    } as ColorRepresentation<S>),
  };
}
