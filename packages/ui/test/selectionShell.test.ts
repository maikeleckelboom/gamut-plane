import { describe, expect, it } from "vitest";
import { createColorValue } from "@gamut-plane/core";
import {
  analyzeRequestedGamuts,
  representationDefinitions,
} from "@gamut-plane/core/internal/capabilities";
import {
  coordinatesOptions,
  requestShellSelection,
  selectionContext,
  shellSelectionFacts,
} from "../src/selectionShell.js";
import { semanticContextKey } from "../src/instrumentState.js";
import {
  requestRepresentation,
  requestInspection,
  initialInstrumentState,
} from "../src/generalizedInstrument.js";

describe("accepted Coordinates / mode / Area policy", () => {
  it("declares technical associated gamuts explicitly without admitting editors", () => {
    expect(
      Object.values(representationDefinitions).map((definition) => definition.associatedGamutId),
    ).toEqual([null, null, "srgb-gamut", "display-p3-gamut"]);
    for (const representationId of ["srgb", "display-p3"] as const) {
      expect(selectionContext({ representationId, editorId: null })).toEqual({
        canEdit: false,
        editing: false,
        areas: [],
      });
    }
  });
  it.each([
    ["inside", [0.5, 0.5, 0.5]],
    ["within-tolerance", [-1e-10, 0.5, 0.5]],
    ["outside", [-0.1, 0.5, 0.5]],
    ["unavailable", [1e308, 0, 0]],
  ] as const)(
    "projects only requested accepted %s facts, never cached badges",
    (status, channels) => {
      const color = createColorValue({ space: "srgb", channels, alpha: 1 });
      if (!color.ok) throw Error("fixture");
      const checks = analyzeRequestedGamuts(color.value, ["srgb-gamut"]);
      expect(
        coordinatesOptions(["srgb-gamut"], checks, representationDefinitions).map(
          (option) => option.status,
        ),
      ).toEqual([undefined, undefined, status, undefined]);
      expect(
        coordinatesOptions([], checks, representationDefinitions).every(
          (option) => option.status === undefined,
        ),
      ).toBe(true);
      expect(
        coordinatesOptions(["srgb-gamut"], [], representationDefinitions).every(
          (option) => option.status === undefined,
        ),
      ).toBe(true);
    },
  );
  it("treats accepted representation and mode activations as identity no-ops", () => {
    const state = requestInspection(initialInstrumentState(), true);
    expect(requestRepresentation(state, "oklch")).toBe(state);
    expect(requestInspection(state, true)).toBe(state);
    expect(requestShellSelection(state.selection, { kind: "representation", value: "oklch" })).toBe(
      state.selection,
    );
    expect(requestShellSelection(state.selection, { kind: "mode", value: "inspect" })).toBe(
      state.selection,
    );
  });
  it("composes 0/1/multiple admitted editors and returns to preferred without history", () => {
    const selection = { representationId: "oklch", editorId: "oklch-lc" } as const;
    const alternate = {
      id: "test-oklch-hc",
      representationId: "oklch",
      label: "Hue / Chroma",
    } as const;
    const facts = {
      ...shellSelectionFacts,
      knownEditors: [...shellSelectionFacts.knownEditors, alternate],
      admittedEditors: [...shellSelectionFacts.admittedEditors, alternate],
    };
    expect(selectionContext(selection).areas).toEqual([]);
    expect(selectionContext(selection, facts).areas).toHaveLength(2);
    const next = requestShellSelection(selection, { kind: "area", value: alternate.id }, facts);
    expect(next).toEqual({ representationId: "oklch", editorId: alternate.id });
    expect(semanticContextKey(next)).not.toBe(semanticContextKey(selection));
    expect(requestShellSelection(next, { kind: "mode", value: "edit" }, facts)).toBe(next);
    const inspect = requestShellSelection(next, { kind: "mode", value: "inspect" }, facts);
    expect(selectionContext(inspect, facts).areas).toEqual([]);
    expect(requestShellSelection(inspect, { kind: "mode", value: "edit" }, facts)).toEqual(
      selection,
    );
    expect(requestShellSelection(inspect, { kind: "area", value: alternate.id }, facts)).toBe(
      inspect,
    );
    expect(requestShellSelection(selection, { kind: "area", value: "unadmitted" }, facts)).toBe(
      selection,
    );
  });
});
