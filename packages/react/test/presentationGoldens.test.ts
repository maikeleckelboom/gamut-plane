import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createColorValue,
  represent,
  type ColorRepresentation,
  type ColorValue,
  type DisplayGamut,
  type PickerPlaneId,
} from "@gamut-plane/core";
import { analyzeRequestedGamuts } from "@gamut-plane/core/internal/capabilities";
import {
  currentEditorHelp,
  currentTargetPresentation,
  currentWarningVisible,
} from "@gamut-plane/ui";
import {
  resolveEditorVisualSupport,
  resolveField,
} from "../../render/src/capabilities/editorResolution.js";
import { resolveRequestedGuides } from "../../render/src/capabilities/guideResolution.js";
import { geometryToSvgPath } from "../../render/src/geometry.js";
import { PICKER_GAMUT_TABLES } from "../../render/src/generated/gamutTables.js";
import {
  currentEditableDetail,
  currentExactChecks,
  currentField,
  currentGuideDisplay,
  currentOklchObservation,
  currentTargetVisual,
} from "../../render/src/current/index.js";
import { createPickerPresentation as frozenPicker } from "../../render/test/fixtures/v03PickerPresentation.js";
import goldens from "../../render/test/fixtures/presentationGoldens.json" with { type: "json" };

type Golden = {
  name: string;
  definition: ColorRepresentation;
  view: PickerPlaneId;
  target: DisplayGamut;
  visibility: { srgb: boolean; displayP3: boolean };
  expected?: unknown;
  expectedError?: { type: string; message: string };
};

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function sourceOf(definition: ColorRepresentation): ColorValue {
  const result = createColorValue(definition);
  if (!result.ok) throw new Error("Invalid reviewed golden definition");
  return result.value;
}

function frozenFacts(golden: Golden) {
  const old = frozenPicker(
    sourceOf(golden.definition),
    golden.view,
    golden.target,
    golden.visibility,
  );
  const visible = golden.visibility[golden.target === "srgb" ? "srgb" : "displayP3"];
  const table = golden.target === "srgb" ? PICKER_GAMUT_TABLES.srgb : PICKER_GAMUT_TABLES.displayP3;
  return {
    projection: old.projection,
    activeCss: old.activeCss,
    markerCss: old.markerCss,
    gamutStatus: old.gamutStatus,
    warningVisible: old.warningVisible,
    targetGuidePoint: old.targetGuidePoint,
    targetGuideCss: old.targetGuideCss,
    targetGuideLabel: old.targetGuideLabel,
    markers: golden.view === "oklch" ? old.markers : [],
    targetResult: old.targetResult,
    detail:
      golden.view === "oklch"
        ? {
            huePosition: old.huePosition,
            chromaPosition: old.chromaPosition,
            hueHelp: old.hueHelp ?? null,
            chromaHelp: old.chromaHelp ?? null,
          }
        : { domainHelp: old.domainHelp ?? null },
    gradientDigest: digest(
      golden.view === "oklch"
        ? old.hueGradient + old.lightnessGradient + old.chromaGradient
        : old.fixedLightnessGradient,
    ),
    contourDigest: visible
      ? digest(
          geometryToSvgPath(
            old.plane.buildGamutContour(table, old.projection.fixed),
            old.plane.gamutContourClosed,
          ),
        )
      : null,
  };
}

function currentFacts(golden: Golden) {
  const source = sourceOf(golden.definition);
  const observation = represent(source, golden.view);
  const checks = analyzeRequestedGamuts(source, ["display-p3-gamut", "srgb-gamut"]);
  const editor = resolveEditorVisualSupport(golden.view === "oklch" ? "oklch-lc" : "oklab-ab");
  const fieldResolution = resolveField(source, editor);
  const guides = resolveRequestedGuides(
    source,
    editor,
    [
      ...(golden.visibility.displayP3 ? ["display-p3-boundary" as const] : []),
      ...(golden.visibility.srgb ? ["srgb-boundary" as const] : []),
    ],
    checks,
  );
  const field = currentField(golden.view, editor, fieldResolution);
  const oklch = currentOklchObservation(source, observation);
  const exact = currentExactChecks(checks);
  const targetVisual = currentTargetVisual(field.editorId, golden.target, guides, oklch);
  const target = currentTargetPresentation(
    golden.target,
    (golden.target === "srgb" ? exact.srgb : exact.displayP3).status,
    targetVisual,
  );
  const detail = currentEditableDetail(field, oklch);
  const help = currentEditorHelp(golden.view, oklch.channels[2] === null, field.markerInDomain);
  const display = currentGuideDisplay(guides);
  const channels = field.projection.representation.channels;
  const isOklch = detail.view === "oklch";
  return {
    projection: {
      point: field.projection.point,
      x: channels[1],
      y: isOklch ? channels[0] : channels[2],
      fixed: field.samplingFixed,
    },
    activeCss: detail.activeCss,
    markerCss: detail.markerCss,
    gamutStatus: { srgb: exact.srgb.status, displayP3: exact.displayP3.status },
    warningVisible: currentWarningVisible(exact.displayP3.status),
    targetGuidePoint: targetVisual.targetGuidePoint,
    targetGuideCss: targetVisual.targetGuideCss,
    targetGuideLabel: target.targetGuideLabel,
    markers: target.markers,
    targetResult: target.targetResult,
    detail: isOklch
      ? {
          huePosition: detail.huePosition,
          chromaPosition: detail.chromaPosition,
          hueHelp: help.hueHelp ?? null,
          chromaHelp: help.chromaHelp ?? null,
        }
      : { domainHelp: help.domainHelp ?? null },
    gradientDigest: digest(
      isOklch
        ? detail.hueGradient + detail.lightnessGradient + detail.chromaGradient
        : detail.fixedLightnessGradient,
    ),
    contourDigest:
      golden.target === "srgb"
        ? display.srgbPath && digest(display.srgbPath)
        : display.displayP3Path && digest(display.displayP3Path),
  };
}

describe("reviewed v0.3 literal presentation goldens", () => {
  // The reviewed JSON is literal test data; production never parses or casts it.
  it.each(goldens as unknown as readonly Golden[])(
    "freezes $name independently of live lower-level expectations",
    (golden) => {
      if (golden.expectedError) {
        for (const compose of [frozenFacts, currentFacts]) {
          let caught: unknown;
          try {
            compose(golden);
          } catch (error) {
            caught = error;
          }
          expect(caught).toBeInstanceOf(Error);
          expect({
            type: (caught as Error).name,
            message: (caught as Error).message,
          }).toStrictEqual(golden.expectedError);
        }
        return;
      }
      expect(frozenFacts(golden)).toStrictEqual(golden.expected);
      expect(currentFacts(golden)).toStrictEqual(golden.expected);
    },
  );
});
