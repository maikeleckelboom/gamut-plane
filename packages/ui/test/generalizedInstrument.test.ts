import { describe, expect, it } from "vitest";
import {
  canonicalInstrumentState,
  formatInspectionNumber,
  initialInstrumentState,
  requestCheckedGamut,
  requestInspection,
  requestRepresentation,
  requestVisibleGuide,
} from "../src/generalizedInstrument.js";

const guides = ["display-p3-boundary", "srgb-boundary"] as const;

describe("public instrument state requests", () => {
  it("keeps all dimensions independent, canonical and immutable", () => {
    const original = initialInstrumentState<(typeof guides)[number]>();
    const rgb = requestRepresentation(original, "srgb");
    const check = requestCheckedGamut(rgb, "srgb-gamut", true);
    const both = requestCheckedGamut(check, "display-p3-gamut", true);
    const guide = requestVisibleGuide(both, "srgb-boundary", true, guides);
    const bothGuides = requestVisibleGuide(guide, "display-p3-boundary", true, guides);
    expect(original.selection).toEqual({ representationId: "oklch", editorId: "oklch-lc" });
    expect(rgb.selection).toEqual({ representationId: "srgb", editorId: null });
    expect(check.visibleGuides).toEqual([]);
    expect(both.checkedGamuts).toEqual(["display-p3-gamut", "srgb-gamut"]);
    expect(guide.visibleGuides).toEqual(["srgb-boundary"]);
    expect(bothGuides.visibleGuides).toEqual(["display-p3-boundary", "srgb-boundary"]);
    expect(requestVisibleGuide(bothGuides, "srgb-boundary", false, guides).checkedGamuts).toEqual(
      both.checkedGamuts,
    );
    expect(requestRepresentation(guide, "oklch").visibleGuides).toEqual(["srgb-boundary"]);
    expect(requestInspection(original, true).selection).toEqual({
      representationId: "oklch",
      editorId: null,
    });
    for (const state of [original, rgb, check, both, guide]) {
      expect(Object.isFrozen(state)).toBe(true);
      expect(Object.isFrozen(state.selection)).toBe(true);
      expect(Object.isFrozen(state.checkedGamuts)).toBe(true);
      expect(Object.isFrozen(state.visibleGuides)).toBe(true);
    }
  });

  it("rejects malformed public state and never treats empty sets as defaults", () => {
    const input = {
      selection: { representationId: "srgb", editorId: null },
      checkedGamuts: [] as string[],
      visibleGuides: [] as string[],
    };
    expect(canonicalInstrumentState(input, guides)).toMatchObject({
      checkedGamuts: [],
      visibleGuides: [],
    });
    expect(() =>
      canonicalInstrumentState({ ...input, visibleGuides: ["unknown"] }, guides),
    ).toThrow("unknown-guide");
    expect(() =>
      canonicalInstrumentState(
        { ...input, selection: { representationId: "srgb", editorId: "oklab-ab" } },
        guides,
      ),
    ).toThrow("editor-representation-mismatch");
    expect(input.visibleGuides).toEqual([]);
  });
});

describe("inspection number policy", () => {
  it("retains null hue, signed zero, extended and tiny finite coordinates", () => {
    expect(formatInspectionNumber(null)).toBe("missing");
    expect(formatInspectionNumber(0)).toBe("0");
    expect(formatInspectionNumber(-0)).toBe("-0");
    expect(formatInspectionNumber(-0.123456789123)).toBe("-0.123456789");
    expect(formatInspectionNumber(1e-12)).toBe("1e-12");
    expect(formatInspectionNumber(1e25)).toBe("1e+25");
    expect(formatInspectionNumber(1.5)).toBe("1.5");
    expect(() => formatInspectionNumber(Infinity)).toThrow("finite coordinate");
  });
});
