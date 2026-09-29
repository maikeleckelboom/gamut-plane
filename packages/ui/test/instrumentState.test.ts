import { describe, expect, it } from "vitest";
import { orderedExactChecks } from "../src/generalizedInstrument.js";
import {
  admittedEditorsForRepresentation,
  canonicalCheckedGamuts,
  canonicalVisibleGuides,
  currentSelectionFacts,
  defaultSelection,
  instrumentViewStatesEqual,
  requestEditor,
  semanticContextKey,
  selectionsEqual,
  validateInstrumentViewState,
  validateSelection,
  type SelectionFacts,
} from "../src/instrumentState.js";

const guides = ["srgb-boundary", "display-p3-boundary"] as const;
const request = {
  selection: { representationId: "oklch", editorId: "oklch-lc" },
  checkedGamuts: ["srgb-gamut", "display-p3-gamut"],
  visibleGuides: ["srgb-boundary", "display-p3-boundary"],
};

describe("generalized selection policy", () => {
  it("accepts all four representations and deliberate observation-only selection", () => {
    for (const [representationId, editorId] of [
      ["oklch", "oklch-lc"],
      ["oklab", "oklab-ab"],
      ["srgb", null],
      ["display-p3", null],
      ["oklch", null],
    ] as const) {
      expect(validateSelection({ representationId, editorId })).toMatchObject({
        ok: true,
        value: { representationId, editorId },
      });
    }
    expect(defaultSelection("oklch")).toEqual({ representationId: "oklch", editorId: "oklch-lc" });
    expect(defaultSelection("oklab")).toEqual({ representationId: "oklab", editorId: "oklab-ab" });
    expect(defaultSelection("srgb")).toEqual({ representationId: "srgb", editorId: null });
    expect(defaultSelection("display-p3")).toEqual({
      representationId: "display-p3",
      editorId: null,
    });
    expect(validateSelection({ representationId: "oklch", editorId: null })).toMatchObject({
      ok: true,
      value: { editorId: null },
    });
  });

  it("rejects invalid meaning with distinct stable issues", () => {
    for (const [input, code] of [
      [{ representationId: "OKLCH", editorId: null }, "unknown-representation"],
      [{ representationId: "oklch", editorId: "oklch-hue-edit" }, "unknown-editor"],
      [{ representationId: "oklch", editorId: "oklab-ab" }, "editor-representation-mismatch"],
      [{ representationId: "oklch", editorId: undefined }, "invalid-selection-shape"],
      [{ representationId: "oklch", editorId: null, color: "red" }, "invalid-selection-shape"],
    ] as const) {
      expect(validateSelection(input)).toEqual({ ok: false, issue: { code } });
    }
  });

  it("separates technical existence, product admission and preferred default", () => {
    const alternate = { id: "test-oklch-hc", representationId: "oklch" } as const;
    type FixtureEditor = (typeof currentSelectionFacts.knownEditors)[number] | typeof alternate;
    const facts = {
      knownEditors: [...currentSelectionFacts.knownEditors, alternate],
      admittedEditors: currentSelectionFacts.admittedEditors,
      preferredEditors: currentSelectionFacts.preferredEditors,
    } satisfies SelectionFacts<FixtureEditor>;
    const none = { ...facts, admittedEditors: [] };
    expect(admittedEditorsForRepresentation("oklch", none)).toEqual([]);
    expect(defaultSelection("oklch", none)).toEqual({ representationId: "oklch", editorId: null });
    expect(requestEditor("oklch", alternate.id, none)).toEqual({
      ok: false,
      issue: { code: "editor-not-admitted" },
    });
    expect(admittedEditorsForRepresentation("oklch", facts).map((editor) => editor.id)).toEqual([
      "oklch-lc",
    ]);
    expect(validateSelection({ representationId: "oklch", editorId: alternate.id }, facts)).toEqual(
      {
        ok: false,
        issue: { code: "editor-not-admitted" },
      },
    );
    const admitted = { ...facts, admittedEditors: [...facts.admittedEditors, alternate] };
    expect(admittedEditorsForRepresentation("oklch", admitted).map((editor) => editor.id)).toEqual([
      "oklch-lc",
      "test-oklch-hc",
    ]);
    const original = validateSelection(
      { representationId: "oklch", editorId: "oklch-lc" },
      admitted,
    );
    const switched = validateSelection(
      { representationId: "oklch", editorId: alternate.id },
      admitted,
    );
    expect(original.ok && switched.ok).toBe(true);
    if (!original.ok || !switched.ok) return;
    expect(selectionsEqual(original.value, switched.value)).toBe(false);
    expect(semanticContextKey(original.value)).not.toBe(semanticContextKey(switched.value));
    expect(defaultSelection("oklch", admitted)).toEqual(original.value);
    expect(requestEditor("oklch", alternate.id, admitted)).toEqual(switched);
    expect(validateSelection({ representationId: "oklch", editorId: alternate.id })).toEqual({
      ok: false,
      issue: { code: "unknown-editor" },
    });
  });
});

describe("canonical state collections", () => {
  it("shows exact results in explicit product order regardless of canonical transport order", () => {
    const canonical = [
      { gamutId: "display-p3-gamut" as const, status: "outside" },
      { gamutId: "srgb-gamut" as const, status: "inside" },
    ];
    expect(orderedExactChecks(canonical)).toEqual([canonical[1], canonical[0]]);
    expect(canonical.map((row) => row.gamutId)).toEqual(["display-p3-gamut", "srgb-gamut"]);
  });

  it("accepts empty, single and duplicated checked gamuts in code-unit order", () => {
    expect(canonicalCheckedGamuts([])).toMatchObject({ ok: true, value: [] });
    expect(canonicalCheckedGamuts(["srgb-gamut"])).toMatchObject({
      ok: true,
      value: ["srgb-gamut"],
    });
    const result = canonicalCheckedGamuts(["srgb-gamut", "display-p3-gamut", "srgb-gamut"]);
    expect(result).toMatchObject({
      ok: true,
      value: ["display-p3-gamut", "srgb-gamut"],
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(canonicalCheckedGamuts(result.value)).toEqual(result);
    expect(canonicalCheckedGamuts(["rec2020-gamut"])).toEqual({
      ok: false,
      issue: { code: "unknown-gamut" },
    });
    expect(canonicalCheckedGamuts([null])).toEqual({
      ok: false,
      issue: { code: "invalid-checked-gamuts" },
    });
  });

  it("accepts empty, single and duplicated guides in code-unit order", () => {
    expect(canonicalVisibleGuides([], guides)).toMatchObject({ ok: true, value: [] });
    expect(canonicalVisibleGuides(["srgb-boundary"], guides)).toMatchObject({
      ok: true,
      value: ["srgb-boundary"],
    });
    const result = canonicalVisibleGuides(
      ["srgb-boundary", "display-p3-boundary", "srgb-boundary"],
      guides,
    );
    expect(result).toMatchObject({
      ok: true,
      value: ["display-p3-boundary", "srgb-boundary"],
    });
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(canonicalVisibleGuides(result.value, guides)).toEqual(result);
    expect(canonicalVisibleGuides(["rec2020-boundary"], guides)).toEqual({
      ok: false,
      issue: { code: "unknown-guide" },
    });
    expect(canonicalVisibleGuides([0], guides)).toEqual({
      ok: false,
      issue: { code: "invalid-visible-guides" },
    });
  });
});

describe("complete product state", () => {
  it("keeps checks, guides and unsupported observation contexts independent", () => {
    for (const [checkedGamuts, visibleGuides] of [
      [[], []],
      [[], ["display-p3-boundary"]],
      [["srgb-gamut"], []],
    ] as const) {
      expect(
        validateInstrumentViewState(
          { selection: { representationId: "srgb", editorId: null }, checkedGamuts, visibleGuides },
          guides,
        ),
      ).toMatchObject({ ok: true, value: { checkedGamuts, visibleGuides } });
    }
  });

  it("returns frozen serializable IDs and arrays and round-trips parsed unknown input", () => {
    const accepted = validateInstrumentViewState(request, guides);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(Object.isFrozen(accepted.value)).toBe(true);
    expect(Object.isFrozen(accepted.value.selection)).toBe(true);
    expect(Object.isFrozen(accepted.value.checkedGamuts)).toBe(true);
    expect(Object.isFrozen(accepted.value.visibleGuides)).toBe(true);
    const serialized = JSON.stringify(accepted.value);
    expect(serialized).toBe(
      '{"selection":{"representationId":"oklch","editorId":"oklch-lc"},"checkedGamuts":["display-p3-gamut","srgb-gamut"],"visibleGuides":["display-p3-boundary","srgb-boundary"]}',
    );
    const restored: unknown = JSON.parse(serialized);
    const roundTrip = validateInstrumentViewState(restored, guides);
    expect(roundTrip).toEqual(accepted);
    if (roundTrip.ok) expect(instrumentViewStatesEqual(accepted.value, roundTrip.value)).toBe(true);
  });

  it("rejects the whole request and leaves caller-owned accepted state unchanged", () => {
    const accepted = validateInstrumentViewState(request, guides);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const pending = validateInstrumentViewState(
      { ...request, selection: { representationId: "oklab", editorId: "oklab-ab" } },
      guides,
    );
    expect(pending.ok).toBe(true);
    expect(accepted.value.selection).toEqual({ representationId: "oklch", editorId: "oklch-lc" });
    expect(
      instrumentViewStatesEqual(accepted.value, pending.ok ? pending.value : accepted.value),
    ).toBe(false);
    const rejected = validateInstrumentViewState(
      { ...request, visibleGuides: ["unrecognized-boundary"] },
      guides,
    );
    expect(rejected).toEqual({ ok: false, issue: { code: "unknown-guide" } });
    expect(validateInstrumentViewState({ ...request, boundaryTarget: "srgb" }, guides)).toEqual({
      ok: false,
      issue: { code: "invalid-state-shape" },
    });
    expect(validateInstrumentViewState({ ...request, checkedGamuts: ["unknown"] }, guides)).toEqual(
      {
        ok: false,
        issue: { code: "unknown-gamut" },
      },
    );
    expect(accepted.value.selection).toEqual({ representationId: "oklch", editorId: "oklch-lc" });
  });
});
