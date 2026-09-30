import { afterEach, describe, expect, it, vi } from "vitest";
import { createColorValue, represent, snapshotColor } from "@gamut-plane/core";
import { analyzeRequestedGamuts } from "@gamut-plane/core/internal/capabilities";
import { fieldSupport } from "../src/capabilities/fieldSupport.js";
import { resolveEditorVisualSupport, resolveField } from "../src/capabilities/editorResolution.js";
import { resolveRequestedGuides } from "../src/capabilities/guideResolution.js";
import { generalizedEditableDetail } from "../src/current/generalizedDisplay.js";
import { createFieldRenderer, fieldCacheKey } from "../src/fieldRenderer.js";
import { pointStyle } from "../src/geometry.js";

afterEach(() => vi.unstubAllGlobals());

describe("native RGB field presentation", () => {
  it("serializes every finite extended authored position as valid CSS", () => {
    expect(pointStyle({ x: 1e308, y: -1e308 })).toEqual({
      left: "1e310%",
      top: "-1e310%",
    });
    expect(pointStyle({ x: 1.2, y: 0.4 })).toEqual({
      left: "120.00000000%",
      top: "40.00000000%",
    });
  });

  it.each([
    ["srgb-rg", "srgb", 2, [0.71, 0.63, -0.4]],
    ["srgb-rb", "srgb", 1, [0.71, -0.4, 0.63]],
    ["srgb-gb", "srgb", 0, [-0.4, 0.71, 0.63]],
    ["display-p3-rg", "display-p3", 2, [0.71, 0.63, -0.4]],
    ["display-p3-rb", "display-p3", 1, [0.71, -0.4, 0.63]],
    ["display-p3-gb", "display-p3", 0, [-0.4, 0.71, 0.63]],
  ] as const)(
    "samples %s with independently specified orientation and actual fixed coordinate",
    (id, space, fixedIndex, expected) => {
      const channels: [number, number, number] = [0.12, 0.34, 0.56];
      channels[fixedIndex] = -0.4;
      const created = createColorValue({ space, channels, alpha: 0.37 });
      if (!created.ok) throw Error("fixture");
      const before = snapshotColor(created.value);
      const editor = resolveEditorVisualSupport(id);
      const field = resolveField(created.value, editor);
      expect(field).toMatchObject({ kind: "available", samplingFixed: -0.4 });
      if (field.kind !== "available") throw Error("fixture");
      const sampler = fieldSupport[id].plane;
      expect(sampler.id).toBe(field.projection.geometryId);
      expect(sampler.sampleField({ x: 0.71, y: 0.37 }, field.samplingFixed)).toEqual({
        space,
        channels: expected,
        alpha: 1,
      });
      const positive = sampler.sampleField({ x: 0.71, y: 0.37 }, 1.6);
      expect(positive.channels[fixedIndex]).toBe(1.6);
      expect(resolveRequestedGuides(created.value, editor, ["srgb-boundary"])).toMatchObject([
        {
          guideId: "srgb-boundary",
          kind: "resolved",
          forms: { kind: "rgb", contour: { kind: "available" } },
        },
      ]);
      expect(snapshotColor(created.value)).toEqual(before);
    },
  );

  it("keeps native editable detail when OKLCH and requested exact analysis cannot convert", () => {
    const created = createColorValue({ space: "srgb", channels: [1.2, 0.4, 1e308], alpha: 0.37 });
    if (!created.ok) throw Error("fixture");
    expect(represent(created.value, "oklch").ok).toBe(false);
    expect(analyzeRequestedGamuts(created.value, ["srgb-gamut"])[0]?.result.ok).toBe(false);
    const editor = resolveEditorVisualSupport("srgb-rg");
    const field = resolveField(created.value, editor);
    expect(field).toMatchObject({ kind: "available", markerInDomain: false, samplingFixed: 1e308 });
    const visual = generalizedEditableDetail(
      created.value,
      represent(created.value, "srgb"),
      editor,
      field,
    );
    if (visual.kind !== "available" || visual.detail.view !== "srgb")
      throw Error("native detail unavailable");
    expect(visual.oklch).toBeNull();
    expect(visual.detail.activeCss).toBe("color(srgb 1.2 0.4 1e+308 / 0.37)");
    expect(visual.detail.markerCss).toBe("color(srgb 1.2 0.4 1e+308)");
    expect(visual.detail.gradients.r).toContain("color(srgb 0.5 0.4 1e+308) 50.000%");
    expect(visual.detail.gradients.g).toContain("color(srgb 1.2 0.5 1e+308) 50.000%");
    expect(visual.detail.gradients.b).toContain("color(srgb 1.2 0.4 0.5) 50.000%");
  });

  it("keys native slices by selected sampler, actual fixed coordinate, dimensions, DPR, grant and quality", () => {
    const input = {
      plane: fieldSupport["srgb-rg"].plane,
      fieldId: "srgb-rg-rectangle",
      fixed: -0.1,
      pixelRatio: 1,
      interactionPreview: false,
    };
    const size = { width: 320, height: 320, pixelRatio: 1 };
    const key = fieldCacheKey(input, size, "srgb", "full");
    for (const changed of [
      fieldCacheKey(
        { ...input, plane: fieldSupport["srgb-rb"].plane, fieldId: "srgb-rb-rectangle" },
        size,
        "srgb",
        "full",
      ),
      fieldCacheKey({ ...input, fixed: 1.1 }, size, "srgb", "full"),
      fieldCacheKey(input, { ...size, width: 440 }, "srgb", "full"),
      fieldCacheKey(input, { ...size, height: 440 }, "srgb", "full"),
      fieldCacheKey(input, { ...size, pixelRatio: 2 }, "srgb", "full"),
      fieldCacheKey(input, size, "display-p3", "full"),
      fieldCacheKey(input, size, "srgb", "preview"),
    ])
      expect(changed).not.toBe(key);
  });

  it("renders native Display P3 samples on a granted sRGB context and caches the unchanged slice", () => {
    const addColorStop = vi.fn();
    const context = {
      getContextAttributes: () => ({ colorSpace: "srgb" }),
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      createLinearGradient: () => ({ addColorStop }),
      fillRect: vi.fn(),
    };
    const canvas = {
      getContext: vi.fn(() => context),
      getBoundingClientRect: () => ({ width: 16, height: 16 }),
      width: 16,
      height: 16,
    } as unknown as HTMLCanvasElement;
    const capability = vi.fn();
    const renderer = createFieldRenderer(canvas, capability);
    const input = {
      plane: fieldSupport["display-p3-rg"].plane,
      fieldId: "display-p3-rg-rectangle",
      fixed: -0.1,
      pixelRatio: 1,
      interactionPreview: false,
    };
    expect(renderer.draw(input)).toBe("full");
    expect(capability).toHaveBeenCalledExactlyOnceWith("srgb");
    expect(addColorStop.mock.calls[0]![1]).toBe("color(display-p3 0 1 -0.1)");
    renderer.draw(input);
    expect(context.clearRect).toHaveBeenCalledOnce();
    renderer.draw({
      ...input,
      plane: fieldSupport["display-p3-rb"].plane,
      fieldId: "display-p3-rb-rectangle",
    });
    expect(addColorStop.mock.calls).toContainEqual([0, "color(display-p3 0 -0.1 1)"]);
    renderer.draw({ ...input, fixed: 1.1 });
    expect(context.clearRect).toHaveBeenCalledTimes(3);
    renderer.dispose();
    renderer.draw({ ...input, fixed: 0.5 });
    expect(context.clearRect).toHaveBeenCalledTimes(3);
  });
});
