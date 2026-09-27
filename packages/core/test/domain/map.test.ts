import { describe, expect, it } from "vitest";
import {
  analyzeGamut,
  createColorValue,
  definitionOf,
  mapToGamut,
  represent,
} from "../../src/index.js";

describe("explicit fixed-L/H chroma reduction", () => {
  it("leaves a strictly contained source untouched", () => {
    const source = createColorValue({ space: "srgb", channels: [0.2, 0.4, 0.6], alpha: 0.372913 });
    if (!source.ok) throw new Error("fixture failed");
    const result = mapToGamut(source.value, "srgb-gamut", "oklch-chroma-reduction-v1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mapped).toBe(source.value);
      expect(result.value.changed).toBe(false);
    }
  });

  it("maps P3-only color to a newly defined OKLCH value at fixed L/H", () => {
    const source = createColorValue({ space: "display-p3", channels: [0, 1, 0], alpha: 0.372913 });
    if (!source.ok) throw new Error("fixture failed");
    const observed = represent(source.value, "oklch");
    if (!observed.ok) throw new Error("fixture conversion failed");
    const result = mapToGamut(source.value, "srgb-gamut", "oklch-chroma-reduction-v1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.source).toBe(source.value);
    expect(result.value.changed).toBe(true);
    expect(result.value.method).toBe("oklch-chroma-reduction-v1");
    const mapped = definitionOf(result.value.mapped);
    expect(mapped.space).toBe("oklch");
    expect(mapped.channels[0]).toBe(observed.value.channels[0]);
    expect(mapped.channels[2]).toBe(observed.value.channels[2]);
    expect(mapped.channels[1]!).toBeLessThan(observed.value.channels[1]);
    expect(mapped.alpha).toBe(0.372913);
    expect(definitionOf(source.value).space).toBe("display-p3");
    expect(analyzeGamut(result.value.mapped, "srgb-gamut")).toMatchObject({
      ok: true,
      value: { status: "inside" },
    });
  });

  it("reports an impossible neutral anchor and numerical overflow", () => {
    const anchor = createColorValue({ space: "oklch", channels: [2, 0.2, 20], alpha: 1 });
    if (!anchor.ok) throw new Error("fixture failed");
    expect(mapToGamut(anchor.value, "srgb-gamut", "oklch-chroma-reduction-v1")).toMatchObject({
      ok: false,
      error: { code: "neutral-anchor-outside-target" },
    });
    const overflow = createColorValue({
      space: "oklab",
      channels: [1e308, 1e308, 1e308],
      alpha: 1,
    });
    if (!overflow.ok) throw new Error("fixture failed");
    expect(mapToGamut(overflow.value, "srgb-gamut", "oklch-chroma-reduction-v1")).toMatchObject({
      ok: false,
      error: { code: "numerical-range" },
    });
  });

  it("maps a tolerance-fringe input to a strictly inside endpoint", () => {
    const source = createColorValue({
      space: "srgb",
      channels: [-1e-10, 0.5, 0.5],
      alpha: 0.372913,
    });
    if (!source.ok) throw new Error("fixture failed");
    expect(analyzeGamut(source.value, "srgb-gamut")).toMatchObject({
      ok: true,
      value: { status: "within-tolerance" },
    });
    const mapped = mapToGamut(source.value, "srgb-gamut", "oklch-chroma-reduction-v1");
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.value.changed).toBe(true);
      expect(analyzeGamut(mapped.value.mapped, "srgb-gamut")).toMatchObject({
        ok: true,
        value: { status: "inside" },
      });
      expect(definitionOf(mapped.value.mapped).alpha).toBe(0.372913);
    }
  });

  it("keeps defining coordinates during an alpha-only reconstruction", () => {
    const source = createColorValue({
      space: "display-p3",
      channels: [1.2, -0.1, 0.5],
      alpha: 0.3,
    });
    if (!source.ok) throw new Error("fixture failed");
    const definition = definitionOf(source.value);
    const edited = createColorValue({ ...definition, alpha: 0.7 });
    if (!edited.ok) throw new Error("edit failed");
    expect(definitionOf(edited.value).space).toBe("display-p3");
    expect(definitionOf(edited.value).channels).toEqual(definition.channels);
  });
});
