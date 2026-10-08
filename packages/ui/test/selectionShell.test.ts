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
  it("declares associated gamuts independently of RGB editing admission", () => {
    expect(
      Object.values(representationDefinitions).map((definition) => definition.associatedGamutId),
    ).toEqual([null, null, "srgb-gamut", "display-p3-gamut"]);
    for (const representationId of ["srgb", "display-p3"] as const) {
      expect(selectionContext({ representationId, editorId: null })).toEqual({
        canEdit: true,
        editing: false,
        areas: [],
      });
    }
  });
  it.each(["srgb", "display-p3"] as const)(
    "uses preferred %s re-entry and preserves explicit Areas",
    (representationId) => {
      const preferred = requestShellSelection(
        { representationId: "oklch", editorId: null },
        { kind: "representation", value: representationId },
      );
      expect(preferred).toEqual({ representationId, editorId: `${representationId}-rg` });
      const context = selectionContext(preferred);
      expect(context.areas.map((area) => [area.label, area.optionLabel, area.description])).toEqual(
        [
          ["R / G", "R / G · fixed B", "Horizontal Red and vertical Green with fixed Blue."],
          ["R / B", "R / B · fixed G", "Horizontal Red and vertical Blue with fixed Green."],
          ["G / B", "G / B · fixed R", "Horizontal Green and vertical Blue with fixed Red."],
        ],
      );
      const selected = requestShellSelection(preferred, {
        kind: "area",
        value: `${representationId}-gb`,
      });
      expect(selected.editorId).toBe(`${representationId}-gb`);
      expect(requestShellSelection(selected, { kind: "mode", value: "edit" })).toBe(selected);
      const inspect = requestShellSelection(selected, { kind: "mode", value: "inspect" });
      expect(inspect.editorId).toBeNull();
      expect(selectionContext(inspect).areas).toEqual([]);
      expect(requestShellSelection(inspect, { kind: "mode", value: "edit" })).toEqual(preferred);
    },
  );
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
  it("Coordinates requests editing from explicit observation without changing legacy observation helpers", () => {
    const state = requestInspection(initialInstrumentState(), true);
    expect(requestRepresentation(state, "oklch")).toBe(state);
    expect(requestInspection(state, true)).toBe(state);
    expect(
      requestShellSelection(state.selection, { kind: "representation", value: "oklch" }),
    ).toEqual({ representationId: "oklch", editorId: "oklch-lc" });
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
