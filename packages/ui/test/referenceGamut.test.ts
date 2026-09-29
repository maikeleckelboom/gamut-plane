import { describe, expect, it } from "vitest";
import { createColorValue } from "@gamut-plane/core";
import { analyzeRequestedGamuts } from "@gamut-plane/core/internal/capabilities";
import {
  initialInstrumentState,
  referenceWarning,
  requestCheckedGamut,
  requestReferenceGamut,
  requestVisibleGuide,
} from "../src/generalizedInstrument.js";
import {
  admittedReferenceGamuts,
  instrumentViewStatesEqual,
  semanticContextKey,
  validateInstrumentViewState,
} from "../src/instrumentState.js";

const guides = ["display-p3-boundary", "srgb-boundary"] as const;
const initial = initialInstrumentState(guides);

describe("independent Reference product policy", () => {
  it("composes the default, but never couples runtime requests or edit identity", () => {
    expect(initial).toEqual({
      selection: { representationId: "oklch", editorId: "oklch-lc" },
      checkedGamuts: ["display-p3-gamut", "srgb-gamut"],
      visibleGuides: guides,
      referenceGamutId: "srgb-gamut",
    });
    const hidden = requestVisibleGuide(
      requestCheckedGamut(initial, "srgb-gamut", false),
      "srgb-boundary",
      false,
      guides,
    );
    expect(hidden.referenceGamutId).toBe("srgb-gamut");
    for (const reference of [...admittedReferenceGamuts, null]) {
      const next = requestReferenceGamut(hidden, reference);
      expect(next.checkedGamuts).toBe(hidden.checkedGamuts);
      expect(next.visibleGuides).toBe(hidden.visibleGuides);
      expect(next.selection).toBe(hidden.selection);
      expect(semanticContextKey(next.selection)).toBe(semanticContextKey(initial.selection));
      expect(instrumentViewStatesEqual(hidden, next)).toBe(reference === hidden.referenceGamutId);
    }
  });

  it.each([undefined, "srgb", "rec2020-gamut", "future-known-gamut", {}, 1])(
    "rejects the entire invalid Reference request: %s",
    (referenceGamutId) => {
      expect(validateInstrumentViewState({ ...initial, referenceGamutId }, guides)).toEqual({
        ok: false,
        issue: { code: "reference-not-admitted" },
      });
    },
  );

  it.each([
    ["inside", [0.5, 0.5, 0.5]],
    ["within-tolerance", [-1e-10, 0.5, 0.5]],
    ["outside", [-0.1, 0.5, 0.5]],
    ["unavailable", [1e308, 0, 0]],
  ] as const)("only exact outside warns, including %s", (status, channels) => {
    const created = createColorValue({ space: "srgb", channels, alpha: 0.37 });
    if (!created.ok) throw new Error("Invalid fixture");
    const checks = analyzeRequestedGamuts(created.value, ["srgb-gamut"]);
    expect(checks[0]?.result.ok ? checks[0].result.value.status : "unavailable").toBe(status);
    expect(referenceWarning("srgb-gamut", checks)).toBe(
      status === "outside" ? "Outside sRGB" : null,
    );
    expect(referenceWarning("display-p3-gamut", checks)).toBeNull();
    expect(referenceWarning(null, checks)).toBeNull();
    expect(referenceWarning("srgb-gamut", [])).toBeNull();
  });
});
