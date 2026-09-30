import { describe, expect, it } from "vitest";
import { createColorValue, type GamutId } from "@gamut-plane/core";
import {
  analyzeRequestedGamuts,
  type GamutCheckResult,
} from "@gamut-plane/core/internal/capabilities";
import {
  boundaryPausedCopy,
  gamutRows,
  gamutSummary,
  gamutSummaryCopy,
  pausedGuideIds,
  referenceChoices,
  requestGamutAction,
  requestedGamutStatus,
  type ExactStatus,
} from "../src/gamutShell.js";
import { initialInstrumentState } from "../src/generalizedInstrument.js";
import { instrumentViewStatesEqual, type InstrumentViewState } from "../src/instrumentState.js";

const guides = ["display-p3-boundary", "srgb-boundary"] as const;
type Guide = (typeof guides)[number];
const guideFor = {
  "srgb-gamut": "srgb-boundary",
  "display-p3-gamut": "display-p3-boundary",
} as const;
const initial = initialInstrumentState<Guide>(guides);

/** Policy input rows. Some combinations are physically impossible but remain valid policy inputs. */
function check(gamutId: GamutId, status: ExactStatus): GamutCheckResult {
  return status === "unavailable"
    ? { gamutId, result: { ok: false, error: { code: "non-finite-conversion" } } as never }
    : {
        gamutId,
        result: {
          ok: true,
          value: { gamut: gamutId, linearRgb: [0, 0, 0], tolerance: 1e-9, status },
        },
      };
}
function state(
  checkedGamuts: readonly GamutId[],
  referenceGamutId: GamutId | null,
  visibleGuides: readonly Guide[] = guides,
): InstrumentViewState<Guide> {
  return { ...initial, checkedGamuts, referenceGamutId, visibleGuides };
}
function summary(
  checked: readonly GamutId[],
  reference: GamutId | null,
  checks: readonly GamutCheckResult[],
) {
  return gamutSummaryCopy(gamutSummary(state(checked, reference), checks));
}
const both = ["display-p3-gamut", "srgb-gamut"] as const;

describe("closed Gamuts summary", () => {
  it.each([
    ["Inside", "inside", "Inside"],
    ["Outside", "outside", "Outside"],
    ["Within tolerance", "within-tolerance", "Within tolerance"],
    ["Unavailable", "unavailable", "Unavailable"],
  ] as const)("Reference sRGB with exact %s", (_, status, text) => {
    const copy = summary(["srgb-gamut"], "srgb-gamut", [check("srgb-gamut", status)]);
    expect(copy).toEqual({
      reference: "Reference",
      target: "sRGB",
      status,
      statusText: text,
      outside: null,
      description: `Reference sRGB, ${text}`,
    });
  });

  it("Reference sRGB with Status off never shows a retained result", () => {
    // A stale row for an unrequested gamut is ignored rather than trusted.
    const copy = summary(["display-p3-gamut"], "srgb-gamut", [
      check("srgb-gamut", "outside"),
      check("display-p3-gamut", "inside"),
    ]);
    expect(copy).toMatchObject({ target: "sRGB", status: "off", statusText: "Status off" });
    expect(copy.outside).toBeNull();
  });

  it.each([
    ["inside", "Inside"],
    ["outside", "Outside"],
  ] as const)("Reference sRGB %s with Display P3 outside counts one other", (status, text) => {
    const copy = summary(both, "srgb-gamut", [
      check("display-p3-gamut", "outside"),
      check("srgb-gamut", status),
    ]);
    expect(copy).toMatchObject({
      target: "sRGB",
      statusText: text,
      outside: "1 other outside",
      description: `Reference sRGB, ${text}. 1 other outside`,
    });
  });

  it("counts only explicitly requested outside results without a Reference", () => {
    expect(summary(["srgb-gamut"], null, [check("srgb-gamut", "outside")])).toEqual({
      reference: "No Reference",
      target: null,
      status: null,
      statusText: null,
      outside: "1 outside",
      description: "No Reference. 1 outside",
    });
    expect(
      summary(both, null, [check("display-p3-gamut", "outside"), check("srgb-gamut", "outside")])
        .outside,
    ).toBe("2 outside");
    expect(
      summary(both, null, [
        check("display-p3-gamut", "inside"),
        check("srgb-gamut", "unavailable"),
      ]),
    ).toMatchObject({ reference: "No Reference", statusText: null, outside: null });
  });

  it("No Reference without requested checks says Status off and counts nothing", () => {
    const copy = summary([], null, [check("srgb-gamut", "outside")]);
    expect(copy).toEqual({
      reference: "No Reference",
      target: null,
      status: "off",
      statusText: "Status off",
      outside: null,
      description: "No Reference, Status off",
    });
    expect(gamutSummary(state([], null), []).requested).toBe(0);
  });

  it("derives real exact rows only from the accepted request", () => {
    const created = createColorValue({ space: "oklch", channels: [0.68, 0.24, 252], alpha: 1 });
    if (!created.ok) throw new Error("fixture");
    const checks = analyzeRequestedGamuts(created.value, both);
    expect(summary(both, "srgb-gamut", checks)).toMatchObject({
      statusText: "Outside",
      outside: "1 other outside",
    });
    expect(summary(["srgb-gamut"], "srgb-gamut", checks).outside).toBeNull();
  });
});

describe("open Gamuts rows and Reference choices", () => {
  const references = ["srgb-gamut", "display-p3-gamut", null] as const;
  const subsets = [[], ["srgb-gamut"], ["display-p3-gamut"], both] as const;
  const guideSubsets = [[], ["srgb-boundary"], ["display-p3-boundary"], guides] as const;

  it("reflects every Status, Boundary and Reference combination independently", () => {
    const checks = [check("srgb-gamut", "outside"), check("display-p3-gamut", "inside")];
    for (const checked of subsets)
      for (const visible of guideSubsets)
        for (const reference of references) {
          const current = state(checked, reference, visible);
          const rows = gamutRows(current, checks, guideFor);
          expect(rows.map((row) => row.gamutId)).toEqual(["srgb-gamut", "display-p3-gamut"]);
          for (const row of rows) {
            const requested = (checked as readonly GamutId[]).includes(row.gamutId);
            expect(row.checked).toBe(requested);
            expect(row.status).toBe(
              requested ? (row.gamutId === "srgb-gamut" ? "outside" : "inside") : "off",
            );
            expect(row.boundary).toBe((visible as readonly Guide[]).includes(row.guideId));
            expect(row.boundaryPaused).toBe(false);
          }
          const choices = referenceChoices(reference);
          expect(choices.map((choice) => choice.value)).toEqual([
            "srgb-gamut",
            "display-p3-gamut",
            "none",
          ]);
          expect(choices.filter((choice) => choice.selected)).toEqual([
            expect.objectContaining({ gamutId: reference }),
          ]);
        }
  });

  it("keeps paused Boundary requests selected and never fabricates availability", () => {
    const requested = [
      { guideId: "srgb-boundary", kind: "no-editor" },
      {
        guideId: "display-p3-boundary",
        kind: "resolved",
        forms: { contour: { kind: "available" } },
      },
    ] as const;
    expect(pausedGuideIds(requested, false)).toEqual(["srgb-boundary", "display-p3-boundary"]);
    expect(pausedGuideIds(requested, true)).toEqual(["srgb-boundary"]);
    expect(
      pausedGuideIds(
        [
          {
            guideId: "srgb-boundary",
            kind: "resolved",
            forms: { contour: { kind: "value-unavailable" } },
          },
        ],
        true,
      ),
    ).toEqual(["srgb-boundary"]);
    expect(boundaryPausedCopy({ editorId: null })).toBe(
      "Paused: Requested boundary appears when editing a color space.",
    );
    expect(boundaryPausedCopy({ editorId: "oklab-ab" })).toBe(
      "Paused: Requested boundary cannot be drawn here.",
    );
    const rows = gamutRows(state([], null, ["srgb-boundary"]), [], guideFor, ["srgb-boundary"]);
    expect(rows[0]).toMatchObject({ boundary: true, boundaryPaused: true });
    expect(rows[1]).toMatchObject({ boundary: false, boundaryPaused: false });
  });

  it("treats a requested check without an accepted row as unavailable, never inside", () => {
    expect(requestedGamutStatus(["srgb-gamut"], [], "srgb-gamut")).toBe("unavailable");
    expect(requestedGamutStatus([], [check("srgb-gamut", "inside")], "srgb-gamut")).toBe("off");
  });
});

describe("shared Gamuts actions", () => {
  it("changes exactly one independent dimension without selection or color coupling", () => {
    const off = requestGamutAction(
      initial,
      { kind: "status", gamutId: "srgb-gamut", requested: false },
      guides,
    );
    expect(off.checkedGamuts).toEqual(["display-p3-gamut"]);
    expect(off.visibleGuides).toBe(initial.visibleGuides);
    expect(off.referenceGamutId).toBe("srgb-gamut");
    expect(off.selection).toBe(initial.selection);

    const hidden = requestGamutAction(
      initial,
      { kind: "boundary", guideId: "srgb-boundary", requested: false },
      guides,
    );
    expect(hidden.visibleGuides).toEqual(["display-p3-boundary"]);
    expect(hidden.checkedGamuts).toBe(initial.checkedGamuts);
    expect(hidden.referenceGamutId).toBe("srgb-gamut");

    for (const gamutId of ["display-p3-gamut", null] as const) {
      const reference = requestGamutAction(initial, { kind: "reference", gamutId }, guides);
      expect(reference.referenceGamutId).toBe(gamutId);
      expect(reference.checkedGamuts).toBe(initial.checkedGamuts);
      expect(reference.visibleGuides).toBe(initial.visibleGuides);
      expect(reference.selection).toBe(initial.selection);
    }

    const restored = requestGamutAction(
      off,
      { kind: "status", gamutId: "srgb-gamut", requested: true },
      guides,
    );
    expect(instrumentViewStatesEqual(restored, initial)).toBe(true);
    expect(Object.isFrozen(restored.checkedGamuts)).toBe(true);
  });

  it("builds from the supplied accepted state and rejects unknown identities", () => {
    const cleared = state([], null, []);
    const next = requestGamutAction(
      cleared,
      { kind: "boundary", guideId: "srgb-boundary", requested: true },
      guides,
    );
    expect(next).toMatchObject({ checkedGamuts: [], visibleGuides: ["srgb-boundary"] });
    expect(next.referenceGamutId).toBeNull();
    expect(() =>
      requestGamutAction(cleared, { kind: "reference", gamutId: "rec2020" as GamutId }, guides),
    ).toThrow("reference-not-admitted");
  });
});
