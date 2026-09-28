import { describe, expect, it, vi } from "vitest";
import * as core from "@gamut-plane/core";
import * as coreCapabilities from "@gamut-plane/core/internal/capabilities";
import * as renderCapabilities from "@gamut-plane/render/internal/capabilities";
import { validateInstrumentViewState, type InstrumentSelection } from "@gamut-plane/ui";
import type { resolveAcceptedRevision as resolveReactRevision } from "../src/model/acceptedResolution.js";
import type { presentAcceptedRevision as presentReactRevision } from "../src/model/acceptedPresentation.js";

type Revision = ReturnType<typeof resolveReactRevision>;
type Resolve = typeof resolveReactRevision;
type Present = typeof presentReactRevision;
const guides = ["display-p3-boundary", "srgb-boundary"] as const;
const checks = ["display-p3-gamut", "srgb-gamut"] as const;

function color(definition: core.ColorRepresentation): core.ColorValue {
  const result = core.createColorValue(definition);
  if (!result.ok) throw new Error("Invalid fixture");
  return result.value;
}

function state(selection: InstrumentSelection, checkedGamuts = checks, visibleGuides = guides) {
  const result = validateInstrumentViewState({ selection, checkedGamuts, visibleGuides }, guides);
  if (!result.ok) throw new Error(`Invalid fixture: ${result.issue.code}`);
  return result.value;
}

const ordinary = color({ space: "oklch", channels: [0.62, 0.24, 270], alpha: 0.37 });

/** The same owner-native revision and projection contract runs in each adapter package. */
export function acceptedPresentationContract(
  name: string,
  resolve: Resolve,
  present: Present,
): void {
  describe(`${name} private accepted presentation`, () => {
    function project(
      source: core.ColorValue = ordinary,
      selection: InstrumentSelection = { representationId: "oklch", editorId: "oklch-lc" },
    ) {
      const revision = resolve(source, state(selection));
      return { revision, view: present(revision) };
    }

    it("borrows all six families, nested guide forms and contour buffers without mutation", () => {
      const revision = resolve(
        ordinary,
        state({ representationId: "oklch", editorId: "oklch-lc" }),
      );
      const before = {
        definition: core.snapshotColor(revision.source),
        selection: structuredClone(revision.state.selection),
        observation: structuredClone(revision.observation),
        checks: structuredClone(revision.checks),
        forms: revision.guides.map((row) =>
          row.kind === "resolved" ? JSON.stringify(row.forms) : null,
        ),
        frozen: [
          revision.state.selection,
          revision.observation,
          revision.checks,
          revision.editor,
          revision.field,
          revision.guides,
        ].map(Object.isFrozen),
        contours: revision.guides.map((row) =>
          row.kind === "resolved" && row.forms.contour.kind === "available"
            ? Array.from(row.forms.contour.value.points)
            : null,
        ),
      };
      const view = present(revision);
      expect(Object.keys(view).sort()).toEqual([
        "authored",
        "editor",
        "exactChecks",
        "field",
        "guides",
        "observation",
        "selection",
      ]);
      expect(view.selection).toBe(revision.state.selection);
      expect(view.observation).toBe(revision.observation);
      expect(view.exactChecks).toBe(revision.checks);
      expect(view.editor).toBe(revision.editor);
      expect(view.field).toBe(revision.field);
      expect(view.guides).toBe(revision.guides);
      expect(Object.isFrozen(view)).toBe(true);
      expect(Object.isFrozen(view.authored)).toBe(true);
      expect(view.authored).toEqual({ representationId: "oklch", alpha: 0.37 });
      expect(view.authored).not.toBe(revision.source);
      expect(Object.keys(view.authored).sort()).toEqual(["alpha", "representationId"]);
      expect(view).not.toHaveProperty("source");
      for (const key of [
        "state",
        "ready",
        "error",
        "supported",
        "mode",
        "hasPlane",
        "boundaryTarget",
        "canvasColorSpaceStatus",
        "renderQuality",
        "dpr",
        "resourceState",
        "callbacks",
      ])
        expect(view).not.toHaveProperty(key);
      for (const [index, row] of revision.guides.entries()) {
        if (row.kind !== "resolved" || row.forms.contour.kind !== "available") continue;
        const presented = view.guides[index];
        if (presented?.kind !== "resolved" || presented.forms.contour.kind !== "available")
          throw new Error("Expected borrowed contour");
        expect(presented.forms).toBe(row.forms);
        expect(presented.forms.contour.value.points).toBe(row.forms.contour.value.points);
        expect(Array.from(row.forms.contour.value.points)).toEqual(before.contours[index]);
      }
      expect(core.snapshotColor(revision.source)).toEqual(before.definition);
      expect(revision.state.selection).toEqual(before.selection);
      expect(revision.observation).toEqual(before.observation);
      expect(revision.checks).toEqual(before.checks);
      expect(
        revision.guides.map((row) => (row.kind === "resolved" ? JSON.stringify(row.forms) : null)),
      ).toEqual(before.forms);
      expect(
        [
          revision.state.selection,
          revision.observation,
          revision.checks,
          revision.editor,
          revision.field,
          revision.guides,
        ].map(Object.isFrozen),
      ).toEqual(before.frozen);
      expect(Object.isFrozen(revision.guides)).toBe(false);
      const resolved = revision.guides[0];
      if (resolved?.kind !== "resolved") throw new Error("Expected guide");
      expect(Object.isFrozen(resolved.forms)).toBe(false);
      expect(Object.isFrozen(resolved.forms.contour)).toBe(false);
    });

    it("does no science or capability resolution after revision construction", () => {
      const revision = resolve(
        ordinary,
        state({ representationId: "oklch", editorId: "oklch-lc" }),
      );
      const watched = [
        core.represent,
        core.analyzeGamut,
        coreCapabilities.analyzeRequestedGamuts,
        renderCapabilities.resolveEditorVisualSupport,
        renderCapabilities.resolveField,
        renderCapabilities.resolveRequestedGuides,
      ];
      for (const operation of watched) vi.mocked(operation).mockClear();
      present(revision);
      for (const operation of watched) expect(operation).not.toHaveBeenCalled();
    });

    it.each([
      { space: "oklch", channels: [0.6, -0, null], alpha: -0 },
      { space: "oklch", channels: [0.5, 0.9, 720], alpha: 0.37 },
      { space: "oklab", channels: [0.5, 0.4, 0.4], alpha: 1 },
      { space: "srgb", channels: [-0.2, 1.4, 0.5], alpha: 1 },
    ] as const)("retains raw authored values for $space $channels", (definition) => {
      const source = color(definition);
      const before = core.definitionOf(source);
      const { revision, view } = project(source);
      expect(view.authored.representationId).toBe(definition.space);
      expect(Object.is(view.authored.alpha, definition.alpha)).toBe(true);
      expect(core.definitionOf(revision.source)).toBe(before);
      for (const [index, channel] of definition.channels.entries())
        expect(Object.is(before.channels[index], channel)).toBe(true);
      expect(view.observation).toBe(revision.observation);
      expect(view.field).toBe(revision.field);
    });

    it.each(["oklch", "oklab", "srgb", "display-p3"] as const)(
      "retains %s observation-only facts and requested guide outcomes",
      (representationId) => {
        const { revision, view } = project(ordinary, { representationId, editorId: null });
        expect(view.observation).toBe(revision.observation);
        expect(view.observation).toMatchObject({ ok: true, value: { space: representationId } });
        expect(view.editor).toBe(revision.editor);
        expect(view.editor.kind).toBe("no-editor-requested");
        expect(view.field).toBe(revision.field);
        expect(view.field.kind).toBe("no-field-requested");
        expect(view.guides).toBe(revision.guides);
        expect(view.guides.map((row) => row.kind)).toEqual(["no-editor", "no-editor"]);
      },
    );

    it.each([
      ["inside", [0.5, 0.5, 0.5]],
      ["within-tolerance", [-1e-10, 0.5, 0.5]],
      ["outside", [-0.1, 0.5, 0.5]],
    ] as const)("keeps the %s exact result object", (status, channels) => {
      const source = color({ space: "srgb", channels, alpha: 1 });
      const revision = resolve(source, state({ representationId: "srgb", editorId: null }));
      const view = present(revision);
      expect(view.exactChecks).toBe(revision.checks);
      const row = view.exactChecks.find((check) => check.gamutId === "srgb-gamut");
      expect(row?.result).toBe(
        revision.checks.find((check) => check.gamutId === "srgb-gamut")?.result,
      );
      expect(row?.result).toMatchObject({ ok: true, value: { status } });
    });

    it("retains selected observation failure and independent exact success/failure", () => {
      const source = color({ space: "srgb", channels: [2.5e128, 2.5e128, 0], alpha: 0.37 });
      const { revision, view } = project(source, {
        representationId: "display-p3",
        editorId: null,
      });
      expect(view.observation).toBe(revision.observation);
      expect(view.observation.ok).toBe(false);
      expect(view.exactChecks).toBe(revision.checks);
      expect(view.exactChecks.map((row) => row.result.ok)).toEqual([false, true]);
      expect(view.exactChecks[0]?.result).toBe(revision.checks[0]?.result);
      expect(view.editor.kind).toBe("no-editor-requested");
      expect(view.field.kind).toBe("no-field-requested");
    });

    it("retains failed exact analysis without converting it to outside", () => {
      const source = color({ space: "srgb", channels: [1e308, 0, 0], alpha: 1 });
      const { revision, view } = project(source, { representationId: "srgb", editorId: null });
      expect(view.observation.ok).toBe(true);
      expect(view.exactChecks).toBe(revision.checks);
      expect(view.exactChecks[0]?.result).toBe(revision.checks[0]?.result);
      expect(view.exactChecks[0]?.result.ok).toBe(false);
    });

    it("retains field projection failure and successful empty guide intervals", () => {
      const source = color({ space: "oklch", channels: [0.5, 1e308, 40], alpha: 1 });
      const { revision, view } = project(source);
      expect(view.field).toBe(revision.field);
      expect(view.field).toMatchObject({ kind: "value-unavailable", reason: "projection-failed" });
      const guide = view.guides[0];
      if (guide?.kind !== "resolved") throw new Error("Expected guide");
      expect(guide.forms.lightnessIntervals).toEqual({ kind: "available", value: [] });
      expect(guide.forms.lightnessIntervals).toBe(
        revision.guides[0]?.kind === "resolved"
          ? revision.guides[0].forms.lightnessIntervals
          : null,
      );
      expect(guide.forms.hueIntervals).not.toBeNull();
    });

    it("retains structural null, bounded Lightness failure and guide observation failure", () => {
      const extended = project(color({ space: "oklch", channels: [1.2, 0.1, 40], alpha: 1 }));
      const extendedGuide = extended.view.guides[0];
      if (extendedGuide?.kind !== "resolved") throw new Error("Expected guide");
      expect(extendedGuide.forms.reference).toMatchObject({
        kind: "value-unavailable",
        reason: "lightness-out-of-range",
      });
      expect(extendedGuide.forms.reference).toBe(
        extended.revision.guides[0]?.kind === "resolved"
          ? extended.revision.guides[0].forms.reference
          : null,
      );
      const lab = project(color({ space: "oklab", channels: [0.5, 1.3e308, 1.3e308], alpha: 1 }), {
        representationId: "oklab",
        editorId: "oklab-ab",
      });
      const labGuide = lab.view.guides[0];
      if (labGuide?.kind !== "resolved") throw new Error("Expected guide");
      expect(labGuide.forms.hueIntervals).toBeNull();
      expect(labGuide.forms.contour.kind).toBe("available");
      expect(labGuide.forms.reference).toMatchObject({
        kind: "value-unavailable",
        reason: "observation-failed",
      });
      expect(labGuide.forms.reference).toBe(
        lab.revision.guides[0]?.kind === "resolved" ? lab.revision.guides[0].forms.reference : null,
      );
    });

    it("keeps field-unsupported and resolved guide independent in a test-only revision", () => {
      const revision = resolve(
        ordinary,
        state({ representationId: "oklab", editorId: "oklab-ab" }),
      );
      const field: Revision["field"] = { kind: "field-unsupported" };
      const fixture = { ...revision, field };
      const view = present(fixture);
      expect(view.field).toBe(field);
      expect(view.guides).toBe(revision.guides);
      expect(view.guides[0]?.kind).toBe("resolved");
    });

    it("distinguishes null and editor selection by borrowed facts, including a test-only alternate editor", () => {
      const selected = state({ representationId: "oklch", editorId: "oklch-lc" });
      const observed = resolve(ordinary, state({ representationId: "oklch", editorId: null }));
      const editing = resolve(ordinary, selected);
      const nullView = present(observed);
      const editorView = present(editing);
      expect(nullView.observation).toMatchObject({ ok: true, value: { space: "oklch" } });
      expect(editorView.observation).toMatchObject({ ok: true, value: { space: "oklch" } });
      expect(nullView.editor.kind).toBe("no-editor-requested");
      expect(nullView.field.kind).toBe("no-field-requested");
      expect(editorView.editor.kind).toBe("editor");
      expect(editorView.field.kind).toBe("available");
      if (editing.editor.kind !== "editor") throw new Error("Expected editor");
      // A second editor is not admitted in production; this fixture only proves pass-through.
      const alternate = {
        ...editing.editor,
        editor: { ...editing.editor.editor, id: "test-oklch-alternate" },
      } as unknown as Revision["editor"];
      const alternateView = present({ ...editing, editor: alternate });
      expect(alternateView.editor).toBe(alternate);
      if (alternateView.editor.kind !== "editor") throw new Error("Expected test-only editor");
      expect(alternateView.editor.editor.id).toBe("test-oklch-alternate");
      expect(alternateView.observation).toBe(editing.observation);
      expect(alternateView.selection).toBe(editing.state.selection);
    });
  });
}
