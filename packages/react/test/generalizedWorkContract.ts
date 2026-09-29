import { describe, expect, it, vi } from "vitest";
import * as core from "@gamut-plane/core";
import * as capabilities from "@gamut-plane/core/internal/capabilities";
import * as resolution from "@gamut-plane/render/internal/capabilities";
import type { GamutPlaneState } from "../src/index.js";

type Host = { element: Element; dispose(): Promise<void> };

/** Count owner-entry work through the public component, after one settled mount. */
export function generalizedWorkContract(
  mount: (value: core.ColorValue, state: GamutPlaneState) => Promise<Host>,
) {
  describe("generalized production work", () => {
    const scenarios = [
      {
        name: "observation without checks or guides",
        state: {
          selection: { representationId: "srgb", editorId: null },
          checkedGamuts: [],
          visibleGuides: [],
        },
        exact: 0,
        projection: 0,
        contours: 0,
        references: 0,
      },
      {
        name: "observation with one check",
        state: {
          selection: { representationId: "srgb", editorId: null },
          checkedGamuts: ["srgb-gamut"],
          visibleGuides: [],
        },
        exact: 1,
        projection: 0,
        contours: 0,
        references: 0,
      },
      {
        name: "editor with one guide and no check",
        state: {
          selection: { representationId: "oklch", editorId: "oklch-lc" },
          checkedGamuts: [],
          visibleGuides: ["srgb-boundary"],
        },
        exact: 0,
        projection: 1,
        contours: 1,
        references: 1,
      },
      {
        name: "editor with one check and no guide",
        state: {
          selection: { representationId: "oklch", editorId: "oklch-lc" },
          checkedGamuts: ["srgb-gamut"],
          visibleGuides: [],
        },
        exact: 1,
        projection: 1,
        contours: 0,
        references: 0,
      },
    ] as const satisfies readonly {
      name: string;
      state: GamutPlaneState;
      exact: number;
      projection: number;
      contours: number;
      references: number;
    }[];

    it.each(scenarios)("$name", async ({ state, exact, projection, contours, references }) => {
      const created = core.createColorValue({
        space: "oklch",
        channels: [0.62, 0.2, 45],
        alpha: 0.37,
      });
      if (!created.ok) throw new Error("Invalid fixture");
      vi.clearAllMocks();
      const host = await mount(created.value, state);
      try {
        expect(capabilities.analyzeRequestedGamuts).toHaveBeenCalledTimes(1);
        expect(vi.mocked(capabilities.analyzeRequestedGamuts).mock.calls[0]?.[1]).toEqual(
          state.checkedGamuts,
        );
        expect(state.checkedGamuts).toHaveLength(exact);
        expect(core.represent).toHaveBeenCalledTimes(1 + contours);
        expect(resolution.resolveField).toHaveBeenCalledTimes(1);
        expect(
          capabilities.geometryDefinitions["oklch-lc-rectangle"].project,
        ).toHaveBeenCalledTimes(projection);
        expect(capabilities.geometryDefinitions["oklab-ab-disc"].project).not.toHaveBeenCalled();
        expect(resolution.resolveRequestedGuides).toHaveBeenCalledTimes(1);
        expect(core.OKLCH_LIGHTNESS_CHROMA_PLANE.buildGamutContour).toHaveBeenCalledTimes(contours);
        expect(core.OKLAB_AB_PLANE.buildGamutContour).not.toHaveBeenCalled();
        expect(core.getPickerGuide).toHaveBeenCalledTimes(references);
        expect(core.getHueGuideIntervals).toHaveBeenCalledTimes(contours);
        expect(core.getLightnessGuideIntervals).toHaveBeenCalledTimes(contours);
        expect(host.element.querySelectorAll("[data-gp-part='exact-result']")).toHaveLength(exact);
      } finally {
        await host.dispose();
      }
    });
  });
}
