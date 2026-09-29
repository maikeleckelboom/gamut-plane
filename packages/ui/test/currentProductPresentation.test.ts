import { describe, expect, it } from "vitest";
import {
  currentEditorCopy,
  currentEditorHelp,
  currentTargetCopy,
  currentTargetPresentation,
  currentWarningVisible,
} from "../src/currentProductPresentation.js";
import { targetGamutUi } from "../src/instrumentMetadata.js";

describe("current product copy and formatting", () => {
  it("keeps missing Hue, overflow and disc help exact", () => {
    expect(currentEditorHelp("oklch", true, true)).toEqual({
      hueHelp: "Hue is unset. Edit Hue to choose a direction.",
      chromaHelp: "Set Hue before increasing chroma.",
      domainHelp: undefined,
    });
    expect(currentEditorHelp("oklch", false, false).chromaHelp).toBe(
      "Selected chroma is outside the visible editing range. Use the numeric field to edit the full value.",
    );
    expect(currentEditorHelp("oklab", false, false).domainHelp).toBe(
      "Selected color is outside the OKLab editing disc. The marker is shown at the edge; the color is preserved.",
    );
    expect(currentEditorHelp("oklch", false, true).chromaHelp).toBeUndefined();
    expect(currentEditorCopy.chromaMissingHue).toBe("Set Hue before increasing chroma.");
  });

  it("keeps gamut target labels distinct from representation metadata", () => {
    expect(targetGamutUi.srgb.label).toBe("sRGB");
    expect(targetGamutUi["display-p3"].label).toBe("Display P3");
    expect(currentTargetCopy).toMatchObject({
      heading: "Target",
      guideChroma: "Guide C",
      guideDelta: "ΔC",
      inside: "Inside",
      outside: "Outside",
      warning: "Outside Display P3",
    });
  });

  it("keeps four-decimal target precision, marker label, accessible copy and delta visibility", () => {
    const visible = currentTargetPresentation("srgb", "outside", {
      maximumChroma: 0.20433181166648864,
      deltaC: 0.03566818833351135,
      swatchCss: "oklch(62% 0.20433181166648864 270 / 0.5)",
      targetGuideCss: "oklch(62% 0.20433181166648864 270)",
      marker: { chroma: 0.20433181166648864, position: 0.5108295291662216 },
    });
    expect(visible.targetResult).toEqual({
      target: "srgb",
      targetLabel: "sRGB",
      status: "outside",
      guideChroma: "0.2043",
      guideDelta: "0.0357",
      showGuideDelta: true,
      swatchCss: "oklch(62% 0.20433181166648864 270 / 0.5)",
    });
    expect(visible.markers).toEqual([
      {
        id: "srgb-target-guide",
        label: "sRGB sampled target guide C 0.2043",
        position: 0.5108295291662216,
        tone: "guide",
        lane: "srgb",
        cssColor: "oklch(62% 0.20433181166648864 270)",
      },
    ]);
    expect(visible.targetGuideLabel).toBe("sRGB sampled target guide");
    expect(visible.accessibleLabel).toBe("sRGB target boundary result");
    expect(visible.swatchLabel).toBe(
      "sRGB sampled boundary-guide color oklch(62% 0.20433181166648864 270 / 0.5)",
    );
    expect(visible.displayStatus).toBe("Outside");
    expect(visible.displayTone).toBe("outside");

    const tolerance = currentTargetPresentation("display-p3", "within-tolerance", {
      maximumChroma: 0.3017243387735229,
      deltaC: 0,
      swatchCss: "oklch(60% 0.3017243387735229 327.9946167919165)",
      targetGuideCss: "",
      marker: null,
    });
    expect(tolerance.targetResult.guideChroma).toBe("0.3017");
    expect(tolerance.targetResult.guideDelta).toBe("0.0000");
    expect(tolerance.targetResult.showGuideDelta).toBe(false);
    expect(tolerance.targetResult.status).toBe("within-tolerance");
    expect(tolerance.displayStatus).toBe("Inside");
    expect(tolerance.displayTone).toBe("inside");
    expect(tolerance.markers).toEqual([]);
    expect(tolerance.accessibleLabel).toBe("Display P3 target boundary result");
  });

  it("shows the primary warning only for exact outside", () => {
    expect(currentWarningVisible("inside")).toBe(false);
    expect(currentWarningVisible("within-tolerance")).toBe(false);
    expect(currentWarningVisible("outside")).toBe(true);
  });
});
