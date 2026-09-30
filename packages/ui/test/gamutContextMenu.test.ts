import { describe, expect, it } from "vitest";
import type { GamutId } from "@gamut-plane/core";
import type { GamutCheckResult } from "@gamut-plane/core/internal/capabilities";
import { gamutContextMenuGroups } from "../src/gamutContextMenu.js";
import {
  boundaryPausedCopy,
  gamutRows,
  gamutStatusCopy,
  referenceChoices,
  requestGamutAction,
  type ExactStatus,
} from "../src/gamutShell.js";
import { initialInstrumentState } from "../src/generalizedInstrument.js";
import { instrumentViewStatesEqual } from "../src/instrumentState.js";

const guides = ["display-p3-boundary", "srgb-boundary"] as const;
const guideFor = {
  "srgb-gamut": "srgb-boundary",
  "display-p3-gamut": "display-p3-boundary",
} as const;
const initial = initialInstrumentState(guides);
function check(gamutId: GamutId, status: ExactStatus): GamutCheckResult {
  return status === "unavailable"
    ? {
        gamutId,
        result: { ok: false, error: { code: "numerical-range", from: "oklch", to: "srgb" } },
      }
    : {
        gamutId,
        result: {
          ok: true,
          value: { gamut: gamutId, linearRgb: [0, 0, 0], tolerance: 1e-9, status },
        },
      };
}

describe("plane gamut accelerator policy", () => {
  it("projects every independent accepted combination from the inspector facts and choices", () => {
    const subsets = [
      [],
      ["srgb-gamut"],
      ["display-p3-gamut"],
      ["display-p3-gamut", "srgb-gamut"],
    ] as const;
    const guideSubsets = [[], ["srgb-boundary"], ["display-p3-boundary"], guides] as const;
    const checks = [check("srgb-gamut", "outside"), check("display-p3-gamut", "inside")];
    for (const checkedGamuts of subsets)
      for (const visibleGuides of guideSubsets)
        for (const referenceGamutId of ["srgb-gamut", "display-p3-gamut", null] as const) {
          const state = { ...initial, checkedGamuts, visibleGuides, referenceGamutId };
          const before = structuredClone(state);
          const groups = gamutContextMenuGroups(state, checks, guideFor);
          expect(groups.map((group) => [group.id, group.label, group.items.length])).toEqual([
            ["reference", "Reference", 3],
            ["boundary", "Boundary", 2],
            ["status", "Status", 2],
          ]);
          expect(new Set(groups.flatMap((group) => group.items.map((item) => item.id))).size).toBe(
            7,
          );
          expect(
            groups[0]!.items.map((item) => [item.label, item.checked, item.role, item.action]),
          ).toEqual(
            referenceChoices(referenceGamutId).map((choice) => [
              choice.label,
              choice.selected,
              "menuitemradio",
              { kind: "reference", gamutId: choice.gamutId },
            ]),
          );
          const rows = gamutRows(state, checks, guideFor);
          for (const [index, row] of rows.entries()) {
            const boundary = groups[1]!.items[index]!;
            const status = groups[2]!.items[index]!;
            expect(boundary).toMatchObject({
              label: row.label,
              checked: row.boundary,
              role: "menuitemcheckbox",
              fact: null,
              action: { kind: "boundary", guideId: row.guideId, requested: !row.boundary },
            });
            expect(status).toMatchObject({
              label: row.label,
              checked: row.checked,
              role: "menuitemcheckbox",
              fact: gamutStatusCopy(row.status),
              status: row.status,
              action: { kind: "status", gamutId: row.gamutId, requested: !row.checked },
            });
          }
          // Every action passes through the same state route and changes only its own dimension.
          for (const item of groups.flatMap((group) => group.items)) {
            const next = requestGamutAction(state, item.action, guides);
            expect(next.selection).toBe(state.selection);
            if (item.action.kind !== "status") expect(next.checkedGamuts).toBe(state.checkedGamuts);
            if (item.action.kind !== "boundary")
              expect(next.visibleGuides).toBe(state.visibleGuides);
            if (item.action.kind !== "reference")
              expect(next.referenceGamutId).toBe(referenceGamutId);
            if (item.action.kind === "reference" && item.checked)
              expect(instrumentViewStatesEqual(next, state)).toBe(true);
          }
          expect(state).toEqual(before);
        }
  });

  it.each(["inside", "outside", "within-tolerance", "unavailable"] as const)(
    "reuses exact %s copy and ignores unrequested retained results",
    (status) => {
      const checks = [check("srgb-gamut", status), check("display-p3-gamut", "outside")];
      const groups = gamutContextMenuGroups(
        { ...initial, checkedGamuts: ["srgb-gamut"] },
        checks,
        guideFor,
      );
      expect(groups[2]!.items.map((item) => [item.checked, item.status, item.fact])).toEqual([
        [true, status, gamutStatusCopy(status)],
        [false, "off", "Status off"],
      ]);
      const missing = gamutContextMenuGroups(initial, [], guideFor);
      expect(missing[2]!.items.map((item) => item.fact)).toEqual(["Unavailable", "Unavailable"]);
    },
  );

  it("retains requested paused boundaries with the inspector's accessible explanation", () => {
    const state = { ...initial, checkedGamuts: [] };
    const groups = gamutContextMenuGroups(state, [], guideFor, guides);
    expect(groups[1]!.items.map((item) => [item.checked, item.fact, item.description])).toEqual([
      [true, "Paused", boundaryPausedCopy(state.selection)],
      [true, "Paused", boundaryPausedCopy(state.selection)],
    ]);
    expect(groups[2]!.items.every((item) => item.fact === "Status off")).toBe(true);
    const hidden = gamutContextMenuGroups({ ...state, visibleGuides: [] }, [], guideFor, guides);
    expect(hidden[1]!.items.every((item) => item.fact === null && !item.checked)).toBe(true);
  });
});
