import { describe, expect, it, vi } from "vitest";
import {
  createColorValue,
  represent,
  type ColorRepresentation,
  type ColorValue,
  type PickerPlaneId,
} from "@gamut-plane/core";
import { analyzeRequestedGamuts } from "@gamut-plane/core/internal/capabilities";
import { resolveEditorVisualSupport, resolveField } from "../src/capabilities/editorResolution.js";
import { resolveRequestedGuides } from "../src/capabilities/guideResolution.js";
import { createPickerPresentation } from "./fixtures/v03PickerPresentation.js";
import { PICKER_GAMUT_TABLES } from "../src/generated/gamutTables.js";
import { geometryToSvgPath, pointStyle } from "../src/geometry.js";
import { guideConnectorStyle } from "../src/presentation.js";
import {
  currentField,
  currentExactChecks,
  currentOklchObservation,
  currentEditableDetail,
  currentGuideDisplay,
  currentTargetVisual,
} from "../src/current/index.js";

vi.mock("../src/geometry.js", { spy: true });

const definitions = [
  { space: "oklch", channels: [0.6, 0.05, 45], alpha: 1 },
  { space: "oklab", channels: [0.6, 0.08, -0.05], alpha: 1 },
  { space: "display-p3", channels: [0, 1, 0], alpha: 0.372913 },
  { space: "oklch", channels: [0.62, 0.24, 270], alpha: 0.5 },
  { space: "oklch", channels: [0.6, 0, null], alpha: 0 },
  { space: "oklch", channels: [0.62, 0.52, 45], alpha: 0.4 },
  { space: "oklab", channels: [0.6, 0.8, -0.7], alpha: 0.3 },
  { space: "srgb", channels: [-1e-10, 0.5, 0.5], alpha: 1 },
  { space: "display-p3", channels: [-1e-10, 0.5, 0.5], alpha: 1 },
  { space: "srgb", channels: [1, 0, 0], alpha: 1 },
  { space: "oklch", channels: [0.6, 0.1, 720], alpha: 1 },
  { space: "oklch", channels: [0.6, 0.1, -45], alpha: 1 },
  { space: "oklab", channels: [-0, -0, -0], alpha: -0 },
] as const satisfies readonly ColorRepresentation[];
function color(definition: ColorRepresentation): ColorValue {
  const result = createColorValue(definition);
  if (!result.ok) throw new Error("Invalid fixture");
  return result.value;
}
function resolve(source: ColorValue, view: PickerPlaneId, srgb: boolean, p3: boolean) {
  const observation = represent(source, view);
  const checks = analyzeRequestedGamuts(source, ["display-p3-gamut", "srgb-gamut"]);
  const editor = resolveEditorVisualSupport(view === "oklch" ? "oklch-lc" : "oklab-ab");
  const field = resolveField(source, editor);
  const guides = resolveRequestedGuides(
    source,
    editor,
    [...(p3 ? ["display-p3-boundary" as const] : []), ...(srgb ? ["srgb-boundary" as const] : [])],
    checks,
  );
  return { observation, checks, editor, field, guides };
}

describe("current production families against the independent v0.3 oracle", () => {
  it.each(["oklch", "oklab"] as const)(
    "serializes %s owner buffers by identity and preserves visual order",
    (view) => {
      const source = color(definitions[0]);
      const accepted = resolve(source, view, true, true);
      vi.mocked(geometryToSvgPath).mockClear();
      const display = currentGuideDisplay(accepted.guides.toReversed());
      expect(geometryToSvgPath).toHaveBeenCalledTimes(2);
      accepted.guides.forEach((row, index) => {
        if (row.kind !== "resolved" || row.forms.contour.kind !== "available")
          throw new Error("Missing contour");
        expect(vi.mocked(geometryToSvgPath).mock.calls[index]![0]).toBe(
          row.forms.contour.value.points,
        );
        expect(vi.mocked(geometryToSvgPath).mock.calls[index]![1]).toBe(
          row.forms.contour.value.closed,
        );
      });
      expect(display.lightnessIntervals.map((row) => row.tone)).toEqual(["display-p3", "srgb"]);
    },
  );

  it("keeps current invariants and unavailable/empty/structural guide forms distinct", () => {
    const source = color(definitions[0]);
    const accepted = resolve(source, "oklch", true, false);
    expect(() => currentField("oklch", accepted.editor, { kind: "no-field-requested" })).toThrow(
      "requires a requested field",
    );
    expect(() => currentField("oklch", accepted.editor, { kind: "field-unsupported" })).toThrow(
      "requires a supported field",
    );
    expect(() => currentField("oklab", accepted.editor, accepted.field)).toThrow(
      "requires matching field support",
    );
    expect(() => currentExactChecks([])).toThrow("requires both exact checks");
    const row = accepted.guides[0]!;
    if (
      row.kind !== "resolved" ||
      !accepted.observation.ok ||
      accepted.observation.value.space !== "oklch"
    )
      throw new Error("Invalid fixture");
    const empty = {
      ...row,
      forms: { ...row.forms, hueIntervals: { kind: "available" as const, value: [] } },
    };
    expect(currentGuideDisplay([empty]).hueIntervals).toEqual([]);
    expect(
      currentGuideDisplay([{ ...row, forms: { ...row.forms, hueIntervals: null } }]).hueIntervals,
    ).toEqual([]);
    expect(row.forms.hueIntervals?.kind).toBe("available");
    const failed = resolve(
      color({ space: "oklch", channels: [1.4, 0.2, 40], alpha: 1 }),
      "oklch",
      true,
      false,
    );
    expect(() => currentGuideDisplay(failed.guides)).toThrow(
      new RangeError("OKLCH lightness must be between 0 and 1"),
    );
    const oklch = accepted.observation.value;
    const missingCheck = {
      ...row,
      forms: { ...row.forms, targetMarker: { kind: "check-not-requested" as const } },
    };
    expect(() => currentTargetVisual("oklch-lc", "srgb", [missingCheck], oklch)).toThrow(
      "requires its accepted exact check",
    );
  });
  it.each(definitions)("preserves consumed output for $space $channels", (definition) => {
    const source = color(definition);
    for (const view of ["oklch", "oklab"] as const)
      for (const target of ["srgb", "display-p3"] as const)
        for (const srgb of [false, true])
          for (const displayP3 of [false, true]) {
            const old = createPickerPresentation(source, view, target, { srgb, displayP3 });
            const accepted = resolve(source, view, srgb, displayP3);
            const forms = () =>
              accepted.guides.map((row) => (row.kind === "resolved" ? row.forms : row.kind));
            const before = structuredClone(forms());
            const field = currentField(view, accepted.editor, accepted.field);
            const oklch = currentOklchObservation(source, accepted.observation);
            const checks = currentExactChecks(accepted.checks);
            const targetVisual = currentTargetVisual(
              field.editorId,
              target,
              accepted.guides,
              oklch,
            );
            const detail = currentEditableDetail(field, oklch);
            const guides = currentGuideDisplay(accepted.guides);
            expect(field.plane).toBe(old.plane);
            expect(field.projection.point).toStrictEqual(old.projection.point);
            expect(field.samplingFixed).toBe(old.projection.fixed);
            expect(field.projection).toBe(
              "projection" in accepted.field ? accepted.field.projection : null,
            );
            expect(oklch).toStrictEqual(old.oklch);
            if (accepted.observation.ok && accepted.observation.value.space === "oklch") {
              expect(oklch).toBe(accepted.observation.value);
            }
            expect(checks.srgb.status).toBe(old.gamutStatus.srgb);
            expect(checks.displayP3.status === "outside").toBe(old.warningVisible);
            for (const [key, value] of Object.entries(detail)) {
              if (key === "view") expect(value).toBe(view);
              else expect(value).toStrictEqual(old[key as keyof typeof old]);
            }
            expect(targetVisual.targetGuidePoint).toStrictEqual(old.targetGuidePoint);
            expect(targetVisual.targetGuideCss).toBe(old.targetGuideCss);
            expect(targetVisual.swatchCss).toBe(old.targetResult.swatchCss);
            expect(targetVisual.maximumChroma.toFixed(4)).toBe(old.targetResult.guideChroma);
            expect(targetVisual.deltaC.toFixed(4)).toBe(old.targetResult.guideDelta);
            if (view === "oklch" && old.markers[0]) {
              expect(targetVisual.marker?.position).toBe(old.markers[0].position);
              expect(targetVisual.marker?.chroma.toFixed(4)).toBe(
                old.markers[0].label.split(" C ")[1],
              );
            } else expect(targetVisual.marker).toBeNull();
            expect(guides.hueIntervals).toStrictEqual(old.hueIntervals);
            expect(guides.lightnessIntervals).toStrictEqual(old.lightnessIntervals);
            expect(guides.chromaIntervals).toStrictEqual(
              view === "oklch" ? old.chromaIntervals : [],
            );
            for (const [visible, path, table] of [
              [srgb, guides.srgbPath, PICKER_GAMUT_TABLES.srgb],
              [displayP3, guides.displayP3Path, PICKER_GAMUT_TABLES.displayP3],
            ] as const) {
              expect(path).toBe(
                visible
                  ? geometryToSvgPath(
                      old.plane.buildGamutContour(table, old.projection.fixed),
                      old.plane.gamutContourClosed,
                    )
                  : null,
              );
            }
            const activePoint = field.plane.constrainPoint(field.projection.point);
            expect(pointStyle(activePoint)).toEqual(
              pointStyle(old.plane.constrainPoint(old.projection.point)),
            );
            if (targetVisual.targetGuidePoint && old.targetGuidePoint) {
              expect(
                guideConnectorStyle(activePoint, targetVisual.targetGuidePoint, view === "oklab"),
              ).toEqual(
                guideConnectorStyle(
                  old.plane.constrainPoint(old.projection.point),
                  old.targetGuidePoint,
                  view === "oklab",
                ),
              );
              const row = accepted.guides.find((row) => row.guideId === `${target}-boundary`);
              if (row?.kind !== "resolved" || row.forms.targetMarker.kind !== "available")
                throw new Error("Missing accepted target");
              expect(targetVisual.targetGuidePoint).toBe(row.forms.targetMarker.value);
            }
            expect(forms()).toStrictEqual(before);
          }
  });

  it.each([
    { space: "srgb", channels: [1e308, 0, 0], alpha: 1 },
    { space: "srgb", channels: [2.5e128, 2.5e128, 0], alpha: 1 },
    { space: "oklch", channels: [1.4, 0.2, 30], alpha: 1 },
    { space: "oklch", channels: [-0.2, 0.2, 30], alpha: 1 },
    { space: "oklab", channels: [1.2, 0.1, 0.1], alpha: 1 },
    { space: "oklab", channels: [-0.2, 0.1, 0.1], alpha: 1 },
    { space: "oklab", channels: [0.5, 7e307, 7e307], alpha: 1 },
    { space: "oklch", channels: [0.5, 1e308, 40], alpha: 1 },
    { space: "oklch", channels: [1e200, 0, null], alpha: 1 },
  ] as const)("preserves failure type and message for $space $channels", (definition) => {
    const source = color(definition);
    for (const view of ["oklch", "oklab"] as const)
      for (const visible of [false, true]) {
        let previous: unknown;
        try {
          createPickerPresentation(source, view, "srgb", { srgb: visible, displayP3: visible });
        } catch (error) {
          previous = error;
        }
        expect(previous).toBeInstanceOf(Error);
        const compose = () => {
          const accepted = resolve(source, view, visible, visible);
          const field = currentField(view, accepted.editor, accepted.field);
          const oklch = currentOklchObservation(source, accepted.observation);
          currentExactChecks(accepted.checks);
          currentTargetVisual(field.editorId, "srgb", accepted.guides, oklch);
          currentEditableDetail(field, oklch);
          currentGuideDisplay(accepted.guides);
        };
        expect(compose).toThrow(previous as Error);
      }
  });
});
