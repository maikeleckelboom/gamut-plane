import { afterEach, describe, expect, it, vi } from "vitest";
import { createColorValue, represent, snapshotColor } from "@gamut-plane/core";
import * as capabilities from "@gamut-plane/core/internal/capabilities";
import { resolveEditorVisualSupport, resolveField } from "../src/capabilities/editorResolution.js";
import { resolveRequestedGuides } from "../src/capabilities/guideResolution.js";
import {
  generalizedEditableDetail,
  generalizedGuideDisplay,
} from "../src/current/generalizedDisplay.js";
import { RGB_CURVE_MAX_POINTS } from "../src/rgbGuides.js";

vi.mock("@gamut-plane/core/internal/capabilities", async (original) => {
  const actual = await original<typeof capabilities>();
  return {
    ...actual,
    convertLinearRgb: vi.fn(actual.convertLinearRgb),
    encodeRgbCoordinate: vi.fn(actual.encodeRgbCoordinate),
  };
});
afterEach(() => vi.restoreAllMocks());

describe("real RGB contour approximation budgets", () => {
  it.each([
    { limit: "depth", scale: 1e20, offset: 0 },
    { limit: "points", scale: 1e12, offset: 1e12 },
  ])(
    "propagates $limit exhaustion without publishing geometry or changing color facts",
    async ({ limit, scale, offset }) => {
      const actual = await vi.importActual<typeof capabilities>(
        "@gamut-plane/core/internal/capabilities",
      );
      const created = createColorValue({
        space: "display-p3",
        channels: [1.2, 0.4, 0.5],
        alpha: 0.37,
      });
      if (!created.ok) throw Error("fixture");
      const source = created.value;
      const before = snapshotColor(source);
      const checks = capabilities.analyzeRequestedGamuts(source, [
        "srgb-gamut",
        "display-p3-gamut",
      ]);
      const editor = resolveEditorVisualSupport("display-p3-rg");
      const field = resolveField(source, editor);
      const observation = represent(source, "display-p3");

      // Supply deterministic extreme cube vertices at the conversion seam. The real
      // intersection, transfer, chord certificate, recursion and production budgets run.
      // Ordinary built-in cubes are bounded; no public test option or altered limit is needed.
      vi.mocked(capabilities.convertLinearRgb).mockImplementation((channels, from, to) =>
        from === "srgb" && to === "display-p3"
          ? [offset + scale * channels[0], offset + scale * channels[1], channels[2]]
          : actual.convertLinearRgb(channels, from, to),
      );
      vi.mocked(capabilities.encodeRgbCoordinate).mockClear();
      const rows = resolveRequestedGuides(source, editor, ["srgb-boundary"]);
      const row = rows[0]!;
      if (row.kind !== "resolved" || row.forms.kind !== "rgb") throw Error("RGB forms");
      expect(row.forms.contour).toEqual({
        kind: "value-unavailable",
        reason: "approximation-budget",
      });
      // Encoding occurs only for bounds and emitted points. These fixtures distinguish
      // depth exhaustion before the point ceiling from actually filling that ceiling.
      const encoded = vi.mocked(capabilities.encodeRgbCoordinate).mock.calls.length;
      if (limit === "points") expect(encoded).toBeGreaterThanOrEqual(2 * RGB_CURVE_MAX_POINTS);
      else expect(encoded).toBeLessThan(2 * RGB_CURVE_MAX_POINTS);
      expect(generalizedGuideDisplay(rows).srgbPath).toBeNull();
      expect(row.forms.reference.kind).toBe("available");
      expect(
        Object.values(row.forms.channels).every((channel) => channel.result.kind === "available"),
      ).toBe(true);
      expect(generalizedEditableDetail(source, observation, editor, field).kind).toBe("available");
      expect(snapshotColor(source)).toEqual(before);
      expect(
        capabilities.analyzeRequestedGamuts(source, ["srgb-gamut", "display-p3-gamut"]),
      ).toEqual(checks);
    },
  );
});
