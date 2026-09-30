import type { ColorRepresentation, PlanePoint } from "@gamut-plane/core";
import {
  representationDefinitions,
  type GeometryDefinition,
} from "@gamut-plane/core/internal/capabilities";

type RgbGeometry = Extract<GeometryDefinition, { representationId: "srgb" | "display-p3" }>;
export type NativeRgbSample<R extends "srgb" | "display-p3" = "srgb" | "display-p3"> = Pick<
  ColorRepresentation<R>,
  "space" | "channels" | "alpha"
>;

/** Render-owned sampling; the legacy public picker planes keep their OKLCH sample contract. */
export interface NativeRgbFieldSampler<G extends RgbGeometry = RgbGeometry> {
  readonly id: G["id"];
  readonly sampleKind: "native-rgb";
  readonly label: string;
  readonly xAxis: Readonly<{ id: G["x"]; label: string; symbol: string }>;
  readonly yAxis: Readonly<{ id: G["y"]; label: string; symbol: string }>;
  readonly fixedAxis: Readonly<{ id: G["fixed"]; label: string; symbol: string }>;
  readonly fieldSampling: Readonly<{ kind: "column-gradient"; rowStep: number }>;
  sampleField(point: PlanePoint, fixed: number): NativeRgbSample<G["representationId"]>;
}

/** Native encoded CSS samples require neither ColorValue authorship nor an OKLCH conversion. */
export function serializeNativeRgbSample(sample: NativeRgbSample): string {
  return `color(${sample.space} ${sample.channels.join(" ")}${sample.alpha === 1 ? "" : ` / ${sample.alpha}`})`;
}

export function createRgbFieldSampler<G extends RgbGeometry>(
  geometry: G,
): NativeRgbFieldSampler<G> {
  const [r, g, b] = representationDefinitions[geometry.representationId].channels;
  const names = { R: "Red", G: "Green", B: "Blue" } as const;
  function axis<C extends G["x"] | G["y"] | G["fixed"]>(id: C) {
    const channel = [r, g, b].find((channel) => channel.id === id)!;
    return Object.freeze({ id, label: names[channel.symbol], symbol: channel.symbol });
  }
  return Object.freeze({
    id: geometry.id,
    sampleKind: "native-rgb",
    label: geometry.representationId === "srgb" ? "sRGB" : "Display P3",
    xAxis: axis(geometry.x),
    yAxis: axis(geometry.y),
    fixedAxis: axis(geometry.fixed),
    fieldSampling: Object.freeze({ kind: "column-gradient", rowStep: 10 }),
    sampleField(point: PlanePoint, fixed: number): NativeRgbSample<G["representationId"]> {
      const channelValue = (id: typeof r.id | typeof g.id | typeof b.id) =>
        id === geometry.x ? point.x : id === geometry.y ? 1 - point.y : fixed;
      return {
        space: geometry.representationId,
        channels: [channelValue(r.id), channelValue(g.id), channelValue(b.id)],
        alpha: 1,
      };
    },
  });
}
