import { describe, expect, it, vi } from "vitest";
import * as core from "@gamut-plane/core";
import * as capabilities from "@gamut-plane/core/internal/capabilities";
import * as render from "@gamut-plane/render";
import * as resolution from "@gamut-plane/render/internal/capabilities";
import * as current from "@gamut-plane/render/internal/current";
import { createPickerPresentation as frozenPicker } from "../../render/test/fixtures/v03PickerPresentation.js";

export interface WorkInput {
  value: core.ColorValue;
  view: core.PickerPlaneId;
  boundaryTarget: core.DisplayGamut;
  showSrgbBoundary: boolean;
  showDisplayP3Boundary: boolean;
}

/** Count real owner entry calls around one normal mounted composition, including resource setup. */
export function productionWorkContract(
  mount: (input: WorkInput) => Promise<{
    element: Element;
    flush(): Promise<void>;
    dispose(): Promise<void>;
  }>,
) {
  describe("production authority work", () => {
    for (const view of ["oklch", "oklab"] as const)
      for (const target of ["srgb", "display-p3"] as const)
        for (const srgb of [false, true])
          for (const p3 of [false, true]) {
            it(`${view}, target ${target}, visible sRGB=${srgb} P3=${p3}`, async () => {
              const value = core.createColorValue({
                space: "oklch",
                channels: [0.62, 0.3, 45],
                alpha: 0.37,
              });
              if (!value.ok) throw new Error("Invalid source");
              vi.clearAllMocks();
              const host = await mount({
                value: value.value,
                view,
                boundaryTarget: target,
                showSrgbBoundary: srgb,
                showDisplayP3Boundary: p3,
              });
              try {
                await host.flush();
                const revisions = vi.mocked(capabilities.analyzeRequestedGamuts).mock.calls;
                expect(revisions).toHaveLength(1);
                expect(revisions[0]).toEqual([value.value, ["display-p3-gamut", "srgb-gamut"]]);
                // The owner-local collection performs these two real internal analyses. A root
                // spy sees only direct legacy calls, not those owner-local implementation calls.
                expect(revisions.reduce((count, [, ids]) => count + ids.length, 0)).toBe(2);
                expect(core.analyzeGamut).not.toHaveBeenCalled();
                expect(render).not.toHaveProperty("createPickerPresentation");
                expect(render).not.toHaveProperty("getBoundaryPresentation");
                expect(resolution.resolveField).toHaveBeenCalledTimes(1);
                const active = view === "oklch" ? "oklch-lc-rectangle" : "oklab-ab-disc";
                const inactive = view === "oklch" ? "oklab-ab-disc" : "oklch-lc-rectangle";
                expect(capabilities.geometryDefinitions[active].project).toHaveBeenCalledTimes(1);
                expect(capabilities.geometryDefinitions[inactive].project).toHaveBeenCalledTimes(0);
                expect(core.projectColorToPlane).not.toHaveBeenCalled();
                const visible = Number(srgb) + Number(p3);
                expect(resolution.resolveRequestedGuides).toHaveBeenCalledTimes(1);
                expect(core.OKLCH_LIGHTNESS_CHROMA_PLANE.buildGamutContour).toHaveBeenCalledTimes(
                  view === "oklch" ? visible : 0,
                );
                expect(core.OKLAB_AB_PLANE.buildGamutContour).toHaveBeenCalledTimes(
                  view === "oklab" ? visible : 0,
                );
                expect(core.getHueGuideIntervals).toHaveBeenCalledTimes(
                  view === "oklch" ? visible : 0,
                );
                expect(core.getLightnessGuideIntervals).toHaveBeenCalledTimes(visible);
                const hiddenTarget = target === "srgb" ? !srgb : !p3;
                expect(core.getPickerGuide).toHaveBeenCalledTimes(visible + Number(hiddenTarget));
                // Owner-local guide prerequisites: one OKLCH observation, plus OKLab for its
                // contour fixed coordinate. Detail adds only OKLab's missing OKLCH companion.
                const observations =
                  1 + (visible ? (view === "oklch" ? 1 : 2) : 0) + Number(view === "oklab");
                expect(core.represent).toHaveBeenCalledTimes(observations);
                expect(current.currentEditableDetail).toHaveBeenCalledTimes(1);
                expect(current.currentTargetVisual).toHaveBeenCalledTimes(1);
                const revisionGuides = vi.mocked(resolution.resolveRequestedGuides).mock.results[0]!
                  .value;
                expect(vi.mocked(current.currentGuideDisplay).mock.calls[0]![0]).toBe(
                  revisionGuides,
                );
                expect(host.element.querySelectorAll("[data-gamut-boundary]")).toHaveLength(
                  visible,
                );
                for (const path of host.element.querySelectorAll("[data-gamut-boundary]")) {
                  const hit = host.element.querySelector(
                    `[data-gamut-boundary-hit="${path.getAttribute("data-gamut-boundary")}"]`,
                  );
                  expect(hit?.getAttribute("d")).toBe(path.getAttribute("d"));
                }
                // Independent oracle work runs only after the production work budget is checked.
                const old = frozenPicker(value.value, view, target, {
                  srgb,
                  displayP3: p3,
                });
                const { x, y } = old.projection;
                const label = `${old.plane.label} plane. Horizontal ${old.plane.xAxis.label} ${x.toFixed(3)}. Vertical ${old.plane.yAxis.label} ${y.toFixed(3)}. Arrow keys adjust the selected point.${old.warningVisible ? " Outside Display P3" : ""}`;
                expect(
                  host.element.querySelector('[role="application"]')?.getAttribute("aria-label"),
                ).toBe(label);
                expect(
                  host.element
                    .querySelector("[data-boundary-target-result]")
                    ?.getAttribute("data-target-exact-status"),
                ).toBe(old.targetResult.status);
                expect(
                  vi.mocked(current.currentEditableDetail).mock.results[0]!.value.activeCss,
                ).toBe(old.activeCss);
                for (const [visible, id, table] of [
                  [srgb, "srgb", render.PICKER_GAMUT_TABLES.srgb],
                  [p3, "display-p3", render.PICKER_GAMUT_TABLES.displayP3],
                ] as const) {
                  if (visible)
                    expect(
                      host.element
                        .querySelector(`[data-gamut-boundary="${id}"]`)
                        ?.getAttribute("d"),
                    ).toBe(
                      render.geometryToSvgPath(
                        old.plane.buildGamutContour(table, old.projection.fixed),
                        old.plane.gamutContourClosed,
                      ),
                    );
                }
              } finally {
                await host.dispose();
              }
            });
          }
  });
}
