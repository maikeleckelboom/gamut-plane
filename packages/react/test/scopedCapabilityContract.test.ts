import { describe, expect, it } from "vitest";
import {
  createColorValue,
  represent,
  snapshotColor,
  type ColorRepresentation,
  type ColorValue,
} from "@gamut-plane/core";
import {
  validateInstrumentViewState,
  type InstrumentSelection,
  type InstrumentViewState,
} from "@gamut-plane/ui";
import { analyzeRequestedGamuts } from "../../core/src/capabilities/requestedGamuts.js";
import {
  resolveEditorVisualSupport,
  resolveField,
} from "../../render/src/capabilities/editorResolution.js";
import { resolveRequestedGuides } from "../../render/src/capabilities/guideResolution.js";
import { guideDefinitions, type GuideId } from "../../render/src/capabilities/guideSupport.js";

// Test-only future adapter composition. No runtime package acquires cross-family authority.
function resolve(value: ColorValue, state: InstrumentViewState<GuideId>) {
  const observation = represent(value, state.selection.representationId);
  const checks = analyzeRequestedGamuts(value, state.checkedGamuts);
  const editor = resolveEditorVisualSupport(state.selection.editorId);
  return {
    observation,
    checks,
    editor,
    field: resolveField(value, editor),
    guides: resolveRequestedGuides(value, editor, state.visibleGuides, checks),
  };
}

const allGuides = Object.values(guideDefinitions).map((definition) => definition.id);
const bothChecks = ["display-p3-gamut", "srgb-gamut"] as const;
const bothGuides = ["display-p3-boundary", "srgb-boundary"] as const;
function accepted(
  selection: InstrumentSelection,
  checkedGamuts: InstrumentViewState<GuideId>["checkedGamuts"] = bothChecks,
  visibleGuides: readonly GuideId[] = bothGuides,
) {
  const result = validateInstrumentViewState(
    { selection, checkedGamuts, visibleGuides },
    allGuides,
  );
  if (!result.ok) throw new Error(`Invalid scenario: ${result.issue.code}`);
  return result.value;
}
function color(definition: ColorRepresentation) {
  const result = createColorValue(definition);
  if (!result.ok) throw new Error("Invalid fixture");
  return result.value;
}
const ordinary = color({ space: "oklch", channels: [0.62, 0.24, 270], alpha: 0.37 });

describe("validated Phase 2E state composed with independent Phase 2F facts", () => {
  it.each([
    { name: "A — OKLCH L/C", selection: { representationId: "oklch", editorId: "oklch-lc" } },
    { name: "B — OKLab a/b", selection: { representationId: "oklab", editorId: "oklab-ab" } },
  ] as const)("$name resolves both checks and both guides", ({ selection }) => {
    const { representationId, editorId } = selection;
    const state = accepted(selection);
    const before = JSON.stringify(state);
    const authored = snapshotColor(ordinary);
    const facts = resolve(ordinary, state);
    expect(facts.observation).toMatchObject({ ok: true, value: { space: representationId } });
    expect(facts.checks.map((row) => row.gamutId)).toEqual(bothChecks);
    expect(facts.checks.every((row) => row.result.ok)).toBe(true);
    expect(facts.field.kind).toBe("available");
    expect(facts.guides.map((row) => row.guideId)).toEqual(bothGuides);
    for (const row of facts.guides) {
      if (row.kind !== "resolved") throw new Error("Expected guide");
      expect(row.forms.contour.kind).toBe("available");
      expect(row.forms.reference.kind).toBe("available");
      expect(row.forms.lightnessIntervals.kind).toBe("available");
      expect(row.forms.chromaIntervals.kind).toBe("available");
      expect(row.forms.hueIntervals?.kind ?? null).toBe(
        editorId === "oklab-ab" ? null : "available",
      );
    }
    expect(JSON.stringify(state)).toBe(before);
    expect(snapshotColor(ordinary)).toEqual(authored);
  });

  it.each(["srgb", "display-p3", "oklch", "oklab"] as const)(
    "C — %s observation-only preserves both exact results without an editor",
    (representationId) => {
      const facts = resolve(
        ordinary,
        accepted({ representationId, editorId: null }, bothChecks, []),
      );
      expect(facts.observation).toMatchObject({ ok: true, value: { space: representationId } });
      expect(facts.checks.every((row) => row.result.ok)).toBe(true);
      expect(facts.editor).toEqual({ kind: "no-editor-requested" });
      expect(facts.field).toEqual({ kind: "no-field-requested" });
      expect(facts.guides).toEqual([]);
    },
  );

  it("D — retains a P3 guide request in sRGB observation-only state", () => {
    const state = accepted({ representationId: "srgb", editorId: null }, bothChecks, [
      "display-p3-boundary",
    ]);
    const facts = resolve(ordinary, state);
    expect(facts.observation.ok).toBe(true);
    expect(facts.checks).toHaveLength(2);
    expect(facts.guides).toEqual([{ guideId: "display-p3-boundary", kind: "no-editor" }]);
    expect(state.selection).toEqual({ representationId: "srgb", editorId: null });
    expect(state.visibleGuides).toEqual(["display-p3-boundary"]);
    const switched = accepted(
      { representationId: "oklab", editorId: "oklab-ab" },
      state.checkedGamuts,
      state.visibleGuides,
    );
    expect(resolve(ordinary, switched).guides[0]?.kind).toBe("resolved");
    expect(state.selection.editorId).toBeNull();
  });

  it("E — a visible guide without checks has sampled forms but no exact-dependent marker", () => {
    const state = accepted(
      { representationId: "oklch", editorId: "oklch-lc" },
      [],
      ["display-p3-boundary"],
    );
    const facts = resolve(ordinary, state);
    expect(facts.checks).toEqual([]);
    expect(facts.guides).toMatchObject([
      {
        guideId: "display-p3-boundary",
        kind: "resolved",
        forms: {
          reference: { kind: "available" },
          contour: { kind: "available" },
          targetMarker: { kind: "check-not-requested" },
        },
      },
    ]);
  });

  it("F — a check without guides returns only that exact row", () => {
    const state = accepted({ representationId: "oklch", editorId: "oklch-lc" }, ["srgb-gamut"], []);
    const facts = resolve(ordinary, state);
    expect(facts.checks).toMatchObject([{ gamutId: "srgb-gamut", result: { ok: true } }]);
    expect(facts.guides).toEqual([]);
  });

  it("G — numerical observation failure preserves a successful exact reference and the failed row", () => {
    const state = accepted({ representationId: "display-p3", editorId: null });
    const value = color({ space: "srgb", channels: [2.5e128, 2.5e128, 0], alpha: 0.37 });
    const before = snapshotColor(value);
    const facts = resolve(value, state);
    expect(facts.observation).toMatchObject({
      ok: false,
      error: { code: "numerical-range", from: "srgb", to: "display-p3" },
    });
    expect(facts.checks).toMatchObject([
      { gamutId: "display-p3-gamut", result: { ok: false } },
      { gamutId: "srgb-gamut", result: { ok: true, value: { status: "outside" } } },
    ]);
    expect(facts.guides.map((row) => row.kind)).toEqual(["no-editor", "no-editor"]);
    expect(snapshotColor(value)).toEqual(before);
  });

  it("H — identical state resolves fresh value facts and stable structural identities deterministically", () => {
    const state = accepted({ representationId: "oklch", editorId: "oklch-lc" });
    const first = resolve(ordinary, state);
    const extended = color({ space: "oklch", channels: [1.2, 0.8, 40], alpha: 0.37 });
    const second = resolve(extended, state);
    expect(resolve(extended, state)).toEqual(second);
    if (first.editor.kind !== "editor" || second.editor.kind !== "editor")
      throw new Error("Expected editor");
    expect(second.editor.editor).toBe(first.editor.editor);
    expect(second.editor.geometry).toBe(first.editor.geometry);
    expect(second.editor.field).toBe(first.editor.field);
    expect(first.observation).not.toEqual(second.observation);
    expect(second.observation).toMatchObject({ ok: true, value: { channels: [1.2, 0.8, 40] } });
    expect(second.field).toMatchObject({ kind: "available", markerInDomain: false });
    for (const [index, row] of second.guides.entries()) {
      const prior = first.guides[index];
      if (row.kind !== "resolved" || prior?.kind !== "resolved") throw new Error("Expected guide");
      expect(row.support).toBe(prior.support);
      expect(row.forms.reference.kind).toBe("value-unavailable");
      expect(row.forms.contour.kind).toBe("available");
      expect(row.forms.lightnessIntervals.kind).toBe("available");
    }
    expect(Object.keys(state)).toEqual(["selection", "checkedGamuts", "visibleGuides"]);
  });
});
