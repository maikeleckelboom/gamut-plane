import { describe, expect, it } from "vitest";
import { createColorValue, serializeOklchSample, type GamutStatus } from "@gamut-plane/core";
import { analyzeRequestedGamuts } from "@gamut-plane/core/internal/capabilities";
import { resolveEditorVisualSupport } from "../src/capabilities/editorResolution.js";
import { resolveRequestedGuides } from "../src/capabilities/guideResolution.js";
import { currentGuideDisplay, currentTargetVisual } from "../src/current/index.js";
import { getBoundaryPresentation as frozenBoundary } from "./fixtures/v03BoundaryPresentation.js";

const visibilities = [
  { srgb: true, displayP3: true },
  { srgb: false, displayP3: true },
  { srgb: true, displayP3: false },
  { srgb: false, displayP3: false },
];
const statuses = ["inside", "within-tolerance", "outside"] as const;

describe("frozen v0.3 target and guide matrix after factory retirement", () => {
  it.each(["oklch", "oklab"] as const)(
    "preserves %s sampled facts, visible forms and exact-marker policy",
    (view) => {
      const editorId = view === "oklch" ? "oklch-lc" : "oklab-ab";
      const editor = resolveEditorVisualSupport(editorId);
      for (const c of [0.01, 0.24, 0.52]) {
        const sample = { l: 0.62, c, h: 270, alpha: 0.372913 };
        const source = createColorValue({
          space: "oklch",
          channels: [sample.l, c, sample.h],
          alpha: sample.alpha,
        });
        if (!source.ok) throw new Error("Invalid frozen matrix source");
        const analyzed = analyzeRequestedGamuts(source.value, ["display-p3-gamut", "srgb-gamut"]);
        for (const target of ["srgb", "display-p3"] as const)
          for (const visibility of visibilities)
            for (const srgb of statuses)
              for (const displayP3 of statuses) {
                const exactStatus = { srgb, displayP3 };
                const checks = analyzed.map((row) => {
                  if (!row.result.ok) throw new Error("Invalid frozen matrix analysis");
                  const status: GamutStatus = row.gamutId === "srgb-gamut" ? srgb : displayP3;
                  return {
                    gamutId: row.gamutId,
                    result: { ok: true as const, value: { ...row.result.value, status } },
                  };
                });
                const requested = [
                  ...(visibility.displayP3 ? ["display-p3-boundary" as const] : []),
                  ...(visibility.srgb ? ["srgb-boundary" as const] : []),
                ];
                const guides = resolveRequestedGuides(source.value, editor, requested, checks);
                const visual = currentTargetVisual(editorId, target, guides, {
                  space: "oklch",
                  channels: [sample.l, sample.c, sample.h],
                  alpha: sample.alpha,
                });
                const display = currentGuideDisplay(guides);
                const frozen = frozenBoundary(sample, view, target, visibility, exactStatus);
                expect(visual.targetGuidePoint).toStrictEqual(frozen.targetGuidePoint);
                expect(visual.targetGuideCss).toBe(frozen.targetGuideCss);
                expect(visual.swatchCss).toBe(serializeOklchSample(frozen.targetGuide.color));
                expect(visual.maximumChroma).toBe(frozen.targetGuide.maximumChroma);
                expect(visual.deltaC).toBe(frozen.targetGuide.deltaC);
                expect(visual.marker?.position ?? null).toBe(
                  view === "oklch" ? (frozen.markers[0]?.position ?? null) : null,
                );
                expect(display.hueIntervals).toStrictEqual(frozen.hueIntervals);
                expect(display.lightnessIntervals).toStrictEqual(frozen.lightnessIntervals);
                expect(display.chromaIntervals).toStrictEqual(
                  view === "oklch" ? frozen.chromaIntervals : [],
                );
              }
      }
    },
  );
});
