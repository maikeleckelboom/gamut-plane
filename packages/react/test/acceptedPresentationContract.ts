import { describe, expect, it, vi } from "vitest";
import * as core from "@gamut-plane/core";
import * as coreCapabilities from "@gamut-plane/core/internal/capabilities";
import * as renderCapabilities from "@gamut-plane/render/internal/capabilities";
import {
  validateInstrumentViewState,
  type InstrumentSelection,
  type InstrumentViewState,
} from "@gamut-plane/ui";
import type { GuideId } from "@gamut-plane/render/internal/capabilities";
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

function state(
  selection: InstrumentSelection,
  checkedGamuts: InstrumentViewState<GuideId>["checkedGamuts"] = checks,
  visibleGuides: readonly GuideId[] = guides,
) {
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

    it.each([
      {
        name: "ordinary editable success",
        source: ordinary,
        selection: { representationId: "oklch", editorId: "oklch-lc" },
      },
      {
        name: "observation-only",
        source: ordinary,
        selection: { representationId: "display-p3", editorId: null },
      },
      {
        name: "selected observation failure",
        source: color({ space: "srgb", channels: [2.5e128, 2.5e128, 0], alpha: 1 }),
        selection: { representationId: "display-p3", editorId: null },
      },
      {
        name: "field and guide partial failure",
        source: color({ space: "oklch", channels: [0.5, 1e308, 40], alpha: 1 }),
        selection: { representationId: "oklch", editorId: "oklch-lc" },
      },
    ] as const)(
      "does no science or resolution after $name revision construction",
      ({ source, selection }) => {
        const revision = resolve(source, state(selection));
        const watched = [
          core.represent,
          core.analyzeGamut,
          coreCapabilities.analyzeRequestedGamuts,
          renderCapabilities.resolveEditorVisualSupport,
          renderCapabilities.resolveField,
          renderCapabilities.resolveRequestedGuides,
          core.projectColorToPlane,
          core.getPickerGuide,
          core.OKLCH_LIGHTNESS_CHROMA_PLANE.buildGamutContour,
          core.OKLAB_AB_PLANE.buildGamutContour,
        ];
        for (const operation of watched) vi.mocked(operation).mockClear();
        present(revision);
        for (const operation of watched) expect(operation).not.toHaveBeenCalled();
      },
    );

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
      expect(view.exactChecks[0]?.result).toMatchObject({
        ok: false,
        error: { code: "numerical-range" },
      });
      expect(view.exactChecks[1]?.result).toMatchObject({ ok: true, value: { status: "outside" } });
      expect(view.editor.kind).toBe("no-editor-requested");
      expect(view.field.kind).toBe("no-field-requested");
      expect(view.guides.map((row) => row.kind)).toEqual(["no-editor", "no-editor"]);
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
      if (revision.editor.kind !== "editor") throw new Error("Expected technical editor");
      // Mirror the established render test's missing field-support relation without changing production rows.
      const editor = { ...revision.editor, field: null };
      const field = renderCapabilities.resolveField(ordinary, editor);
      const guides = renderCapabilities.resolveRequestedGuides(
        ordinary,
        editor,
        revision.state.visibleGuides,
        revision.checks,
      );
      const fixture = { ...revision, editor, field, guides };
      const view = present(fixture);
      expect(view.editor).toBe(editor);
      expect(view.field).toBe(field);
      expect(view.field.kind).toBe("field-unsupported");
      expect(view.guides).toBe(guides);
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

    it.each([
      { row: "A", selection: { representationId: "oklch", editorId: "oklch-lc" } },
      { row: "B", selection: { representationId: "oklab", editorId: "oklab-ab" } },
    ] as const)("$row — presents ordinary editable families", ({ selection }) => {
      const { representationId, editorId } = selection;
      const { revision, view } = project(ordinary, selection);
      expect(view.observation).toMatchObject({ ok: true, value: { space: representationId } });
      expect(view.exactChecks.map((row) => row.gamutId)).toEqual(checks);
      expect(view.exactChecks.every((row) => row.result.ok)).toBe(true);
      expect(view.editor).toMatchObject({ kind: "editor", editor: { id: editorId } });
      expect(view.field.kind).toBe("available");
      expect(view.guides.map((row) => row.guideId)).toEqual(guides);
      for (const [index, row] of view.guides.entries()) {
        if (row.kind !== "resolved") throw new Error("Expected resolved guide");
        expect(row).toBe(revision.guides[index]);
        expect(row.forms.contour.kind).toBe("available");
        expect(row.forms.reference.kind).toBe("available");
        expect(row.forms.lightnessIntervals.kind).toBe("available");
        expect(row.forms.chromaIntervals.kind).toBe("available");
        expect(row.forms.hueIntervals?.kind ?? null).toBe(
          representationId === "oklab" ? null : "available",
        );
        if (representationId === "oklab") expect(row.forms.hueIntervals).toBeNull();
      }
    });

    it("G/H and empty sets — keeps independent check and guide requests", () => {
      const selection = { representationId: "oklch", editorId: "oklch-lc" } as const;
      const guideOnly = resolve(ordinary, state(selection, [], ["display-p3-boundary"]));
      const guideView = present(guideOnly);
      expect(guideView.exactChecks).toBe(guideOnly.checks);
      expect(guideView.exactChecks).toEqual([]);
      expect(guideView.guides).toBe(guideOnly.guides);
      expect(guideView.guides).toHaveLength(1);
      const guide = guideView.guides[0];
      if (guide?.kind !== "resolved") throw new Error("Expected requested guide");
      expect(guide.forms.contour.kind).toBe("available");
      expect(guide.forms.reference.kind).toBe("available");
      expect(guide.forms.targetMarker).toEqual({ kind: "check-not-requested" });

      const checkOnly = resolve(ordinary, state(selection, ["srgb-gamut"], []));
      const checkView = present(checkOnly);
      expect(checkView.exactChecks).toBe(checkOnly.checks);
      expect(checkView.exactChecks).toMatchObject([
        { gamutId: "srgb-gamut", result: { ok: true } },
      ]);
      expect(checkView.guides).toBe(checkOnly.guides);
      expect(checkView.guides).toEqual([]);

      const neither = resolve(ordinary, state(selection, [], []));
      const emptyView = present(neither);
      expect(emptyView.exactChecks).toBe(neither.checks);
      expect(emptyView.guides).toBe(neither.guides);
      expect(emptyView.exactChecks).toEqual([]);
      expect(emptyView.guides).toEqual([]);
    });

    it.each([1.2, -0.2])(
      "J — retains extended Lightness %s and scoped form failures",
      (lightness) => {
        const source = color({ space: "oklch", channels: [lightness, 0.1, 40], alpha: 1 });
        const { revision, view } = project(source);
        expect(view.observation).toMatchObject({
          ok: true,
          value: { channels: [lightness, 0.1, 40] },
        });
        expect(view.field).toBe(revision.field);
        expect(view.field).toMatchObject({ kind: "available", markerInDomain: false });
        const row = view.guides[0];
        if (row?.kind !== "resolved") throw new Error("Expected resolved guide");
        expect(row.forms.contour.kind).toBe("available");
        expect(row.forms.lightnessIntervals.kind).toBe("available");
        for (const form of [row.forms.hueIntervals, row.forms.reference, row.forms.chromaIntervals])
          expect(form).toMatchObject({
            kind: "value-unavailable",
            reason: "lightness-out-of-range",
            lightness,
          });
        const lab = project(source, { representationId: "oklab", editorId: "oklab-ab" });
        expect(lab.view.field).toMatchObject({
          kind: "value-unavailable",
          reason: "fixed-lightness-out-of-range",
        });
        const labRow = lab.view.guides[0];
        if (labRow?.kind !== "resolved") throw new Error("Expected OKLab guide");
        expect(labRow.forms.contour).toMatchObject({
          kind: "value-unavailable",
          reason: "lightness-out-of-range",
        });
        expect(labRow.forms.lightnessIntervals.kind).toBe("available");
        expect(labRow.forms.hueIntervals).toBeNull();
      },
    );

    it("K/L — separates raw overflow, editor domain and independent guide facts", () => {
      const chroma = project(color({ space: "oklch", channels: [0.5, 0.9, 40], alpha: 1 }));
      expect(chroma.view.observation).toMatchObject({
        ok: true,
        value: { channels: [0.5, 0.9, 40] },
      });
      expect(chroma.view.field).toMatchObject({ kind: "available", markerInDomain: false });
      const hugeChroma = project(color({ space: "oklch", channels: [0.5, 1e308, 40], alpha: 1 }));
      expect(hugeChroma.view.observation).toMatchObject({
        ok: true,
        value: { channels: [0.5, 1e308, 40] },
      });
      expect(hugeChroma.view.field).toMatchObject({
        kind: "value-unavailable",
        reason: "projection-failed",
      });
      const chromaGuide = hugeChroma.view.guides[0];
      if (chromaGuide?.kind !== "resolved") throw new Error("Expected Chroma guide");
      expect(chromaGuide.forms.contour.kind).toBe("available");
      expect(chromaGuide.forms.reference.kind).toBe("available");
      expect(chromaGuide.forms.lightnessIntervals).toEqual({ kind: "available", value: [] });

      const lab = project(color({ space: "oklab", channels: [0.5, 0.4, 0.4], alpha: 1 }), {
        representationId: "oklab",
        editorId: "oklab-ab",
      });
      expect(lab.view.observation).toMatchObject({
        ok: true,
        value: { channels: [0.5, 0.4, 0.4] },
      });
      expect(lab.view.field).toMatchObject({ kind: "available", markerInDomain: false });
      const hugeLab = project(
        color({ space: "oklab", channels: [0.5, 1.3e308, 1.3e308], alpha: 1 }),
        {
          representationId: "oklab",
          editorId: "oklab-ab",
        },
      );
      const labGuide = hugeLab.view.guides[0];
      if (labGuide?.kind !== "resolved") throw new Error("Expected huge OKLab guide");
      expect(labGuide.forms.contour.kind).toBe("available");
      expect(labGuide.forms.reference).toMatchObject({
        kind: "value-unavailable",
        reason: "observation-failed",
      });
      expect(labGuide.forms.hueIntervals).toBeNull();
    });

    it("N/O — keeps an active editor beside failed observation and exact analysis", () => {
      const source = color({ space: "srgb", channels: [1e308, 0, 0], alpha: 1 });
      const editing = project(source);
      expect(editing.view.observation.ok).toBe(false);
      expect(editing.view.editor).toMatchObject({ kind: "editor", editor: { id: "oklch-lc" } });
      expect(editing.view.field).toMatchObject({
        kind: "value-unavailable",
        reason: "projection-failed",
      });
      expect(editing.view.guides).toBe(editing.revision.guides);
      expect(editing.view.guides.map((row) => row.kind)).toEqual(["resolved", "resolved"]);
      for (const row of editing.view.guides) {
        if (row.kind !== "resolved")
          throw new Error("Expected independently resolved form outcomes");
        expect(row.forms.reference).toMatchObject({
          kind: "value-unavailable",
          reason: "observation-failed",
        });
        expect(row.forms.targetMarker.kind).toBe("exact-unavailable");
      }
      const sameSpace = project(source, { representationId: "srgb", editorId: null });
      expect(sameSpace.view.observation).toMatchObject({
        ok: true,
        value: { channels: [1e308, 0, 0] },
      });
      for (const row of sameSpace.view.exactChecks) {
        expect(row.result.ok).toBe(false);
        expect(row.result).toBe(
          sameSpace.revision.checks.find((check) => check.gamutId === row.gamutId)?.result,
        );
      }
    });

    it("P — same state projects fresh value facts and exact-dependent marker outcomes", () => {
      const accepted = state(
        { representationId: "oklch", editorId: "oklch-lc" },
        ["srgb-gamut"],
        ["srgb-boundary"],
      );
      const outside = color({ space: "srgb", channels: [-0.1, 0.5, 0.5], alpha: 1 });
      const inside = color({ space: "srgb", channels: [0.5, 0.5, 0.5], alpha: 1 });
      const first = resolve(outside, accepted);
      const second = resolve(inside, accepted);
      const firstView = present(first);
      const secondView = present(second);
      expect(firstView.selection).toBe(secondView.selection);
      for (const family of ["observation", "exactChecks", "field", "guides"] as const)
        expect(secondView[family]).not.toBe(firstView[family]);
      expect(secondView.observation).toBe(second.observation);
      expect(secondView.exactChecks).toBe(second.checks);
      expect(secondView.field).toBe(second.field);
      expect(secondView.guides).toBe(second.guides);
      expect(firstView.exactChecks[0]?.result).toMatchObject({
        ok: true,
        value: { status: "outside" },
      });
      expect(secondView.exactChecks[0]?.result).toMatchObject({
        ok: true,
        value: { status: "inside" },
      });
      expect(firstView.guides[0]).toMatchObject({
        kind: "resolved",
        forms: { targetMarker: { kind: "available" } },
      });
      expect(secondView.guides[0]).toMatchObject({
        kind: "resolved",
        forms: { targetMarker: { kind: "exact-not-outside", status: "inside" } },
      });
      if (firstView.editor.kind !== "editor" || secondView.editor.kind !== "editor")
        throw new Error("Expected stable editor definitions");
      expect(secondView.editor.editor).toBe(firstView.editor.editor);
      expect(secondView.editor.geometry).toBe(firstView.editor.geometry);
    });

    it.each([
      { space: "oklch", channels: [0.5, -0, null], alpha: -0 },
      { space: "oklch", channels: [0.5, 0.1, -720], alpha: 1 },
    ] as const)("Q — defining-equal reconstruction projects current $space facts", (definition) => {
      const original = color(definition);
      const rebuilt = color(definition);
      expect(rebuilt).not.toBe(original);
      expect(core.definingEquals(rebuilt, original)).toBe(true);
      const accepted = state({ representationId: "oklch", editorId: "oklch-lc" });
      const old = resolve(original, accepted);
      const current = resolve(rebuilt, accepted);
      const view = present(current);
      expect(view.observation).toBe(current.observation);
      expect(view.observation).not.toBe(old.observation);
      expect(view.exactChecks).toBe(current.checks);
      expect(view.exactChecks).not.toBe(old.checks);
      expect(view.field).toBe(current.field);
      expect(view.guides).toBe(current.guides);
      expect(view.authored.representationId).toBe("oklch");
      expect(Object.is(view.authored.alpha, definition.alpha)).toBe(true);
      if (!view.observation.ok) throw new Error("Expected defining-space observation");
      for (const [index, channel] of definition.channels.entries())
        expect(Object.is(view.observation.value.channels[index], channel)).toBe(true);
    });

    it("R — changing legacy boundaryTarget input leaves the ordinary view unchanged", () => {
      const revision = resolve(
        ordinary,
        state({ representationId: "oklch", editorId: "oklch-lc" }),
      );
      const forTarget = (boundaryTarget: "srgb" | "display-p3") => {
        const withLegacyInput = { ...revision, boundaryTarget };
        return present(withLegacyInput);
      };
      const srgb = forTarget("srgb");
      const p3 = forTarget("display-p3");
      expect(Object.keys(srgb).sort()).toEqual([
        "authored",
        "editor",
        "exactChecks",
        "field",
        "guides",
        "observation",
        "selection",
      ]);
      expect(srgb).toEqual(p3);
      expect(srgb.selection).toBe(revision.state.selection);
      expect(srgb.exactChecks).toBe(revision.checks);
      for (const family of ["observation", "editor", "field", "guides"] as const)
        expect(srgb[family]).toBe(revision[family]);
      for (const family of [
        "selection",
        "observation",
        "exactChecks",
        "editor",
        "field",
        "guides",
      ] as const)
        expect(p3[family]).toBe(srgb[family]);
      expect(srgb).not.toHaveProperty("boundaryTarget");
    });

    it.each([
      ["inside", [0.5, 0.5, 0.5], "exact-not-outside"],
      ["within-tolerance", [-1e-10, 0.5, 0.5], "exact-not-outside"],
      ["outside", [-0.1, 0.5, 0.5], "available"],
    ] as const)(
      "keeps %s exact truth distinct from its guide marker",
      (status, channels, markerKind) => {
        const source = color({ space: "srgb", channels, alpha: 1 });
        const revision = resolve(
          source,
          state(
            { representationId: "oklch", editorId: "oklch-lc" },
            ["srgb-gamut"],
            ["srgb-boundary"],
          ),
        );
        const view = present(revision);
        expect(view.exactChecks[0]?.result).toMatchObject({ ok: true, value: { status } });
        expect(view.exactChecks[0]?.result).toBe(revision.checks[0]?.result);
        const row = view.guides[0];
        if (row?.kind !== "resolved") throw new Error("Expected guide");
        expect(row.forms.targetMarker.kind).toBe(markerKind);
        if (markerKind === "exact-not-outside")
          expect(row.forms.targetMarker).toMatchObject({ status });
      },
    );

    it("keeps a failed matching exact check distinct from outside and missing check", () => {
      const source = color({ space: "srgb", channels: [1e308, 0, 0], alpha: 1 });
      const revision = resolve(
        source,
        state(
          { representationId: "oklch", editorId: "oklch-lc" },
          ["srgb-gamut"],
          ["srgb-boundary"],
        ),
      );
      const view = present(revision);
      const row = view.guides[0];
      if (row?.kind !== "resolved") throw new Error("Expected guide");
      expect(view.exactChecks[0]?.result.ok).toBe(false);
      expect(row.forms.targetMarker).toMatchObject({ kind: "exact-unavailable" });
      if (
        row.forms.targetMarker.kind !== "exact-unavailable" ||
        view.exactChecks[0]?.result.ok !== false
      )
        throw new Error("Expected failed exact result");
      expect(row.forms.targetMarker.error).toBe(view.exactChecks[0].result.error);
    });

    it.each([
      { space: "oklch", channels: [0.5, 0.1, 720], alpha: 1 },
      { space: "oklch", channels: [0.5, 0.1, -45], alpha: 1 },
      { space: "oklch", channels: [0.5, -0, null], alpha: -0 },
      { space: "oklch", channels: [-0.2, 0.9, 40], alpha: 1 },
      { space: "oklab", channels: [0.5, 0.4, 0.4], alpha: 1 },
      { space: "srgb", channels: [-0.2, 1.4, 0.5], alpha: 1 },
      { space: "display-p3", channels: [1.2, -0.1, 0.5], alpha: 1 },
    ] as const)("retains raw selected coordinates for $space $channels", (definition) => {
      const source = color(definition);
      const selection: InstrumentSelection =
        definition.space === "oklch"
          ? { representationId: "oklch", editorId: "oklch-lc" }
          : definition.space === "oklab"
            ? { representationId: "oklab", editorId: "oklab-ab" }
            : { representationId: definition.space, editorId: null };
      const { revision, view } = project(source, selection);
      expect(view.authored.representationId).toBe(definition.space);
      expect(Object.is(view.authored.alpha, definition.alpha)).toBe(true);
      expect(view.observation).toBe(revision.observation);
      if (!view.observation.ok) throw new Error("Expected same-space observation");
      expect(view.observation.value.space).toBe(definition.space);
      for (const [index, channel] of definition.channels.entries()) {
        expect(Object.is(core.definitionOf(source).channels[index], channel)).toBe(true);
        expect(Object.is(view.observation.value.channels[index], channel)).toBe(true);
      }
    });

    it.each([
      {
        name: "editable success with contour",
        source: ordinary,
        selection: { representationId: "oklch", editorId: "oklch-lc" },
      },
      {
        name: "observation-only",
        source: ordinary,
        selection: { representationId: "srgb", editorId: null },
      },
      {
        name: "selected observation failure",
        source: color({ space: "srgb", channels: [2.5e128, 2.5e128, 0], alpha: 1 }),
        selection: { representationId: "display-p3", editorId: null },
      },
      {
        name: "field and guide partial failure",
        source: color({ space: "oklch", channels: [0.5, 1e308, 40], alpha: 1 }),
        selection: { representationId: "oklch", editorId: "oklch-lc" },
      },
    ] as const)("does not mutate borrowed $name facts", ({ source, selection }) => {
      const revision = resolve(source, state(selection));
      const before = {
        source: core.snapshotColor(source),
        state: structuredClone(revision.state),
        observation: structuredClone(revision.observation),
        checks: structuredClone(revision.checks),
        field: structuredClone(revision.field),
        editor: revision.editor,
        guideRows: [...revision.guides],
        forms: revision.guides.map((row) => (row.kind === "resolved" ? row.forms : null)),
        contours: revision.guides.map((row) =>
          row.kind === "resolved" && row.forms.contour.kind === "available"
            ? Array.from(row.forms.contour.value.points)
            : null,
        ),
      };
      const view = present(revision);
      expect(view.selection).toBe(revision.state.selection);
      expect(view.observation).toBe(revision.observation);
      expect(view.exactChecks).toBe(revision.checks);
      expect(view.editor).toBe(revision.editor);
      expect(view.field).toBe(revision.field);
      expect(view.guides).toBe(revision.guides);
      expect(core.snapshotColor(source)).toEqual(before.source);
      expect(revision.state).toEqual(before.state);
      expect(revision.observation).toEqual(before.observation);
      expect(revision.checks).toEqual(before.checks);
      expect(revision.field).toEqual(before.field);
      expect(revision.editor).toBe(before.editor);
      revision.guides.forEach((row, index) => {
        expect(row).toBe(before.guideRows[index]);
        if (row.kind !== "resolved") return;
        expect(row.forms).toBe(before.forms[index]);
        if (row.forms.contour.kind === "available") {
          const presented = view.guides[index];
          if (presented?.kind !== "resolved" || presented.forms.contour.kind !== "available")
            throw new Error("Expected borrowed contour");
          expect(presented.forms.contour.value.points).toBe(row.forms.contour.value.points);
          expect(Array.from(row.forms.contour.value.points)).toEqual(before.contours[index]);
        }
      });
    });
  });
}
