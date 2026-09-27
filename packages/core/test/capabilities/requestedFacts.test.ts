import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createColorValue,
  definitionOf,
  represent,
  snapshotColor,
  type ColorRepresentation,
  type GamutId,
} from "../../src/index.js";
import * as analysis from "../../src/gamut/analyze.js";
import { analyzeRequestedGamuts } from "../../src/capabilities/requestedGamuts.js";

function color(definition: ColorRepresentation) {
  const result = createColorValue(definition);
  if (!result.ok) throw new Error("Invalid fixture");
  return result.value;
}

afterEach(() => vi.restoreAllMocks());

describe("requested exact gamut facts", () => {
  it.each([
    [],
    ["srgb-gamut"],
    ["display-p3-gamut"],
    ["display-p3-gamut", "srgb-gamut"],
  ] satisfies GamutId[][])("retains exactly the requested canonical rows: %j", (...ids) => {
    const value = color({ space: "oklch", channels: [0.68, 0.18, 252], alpha: 0.37 });
    const before = snapshotColor(value);
    const direct = ids.map((id) => analysis.analyzeGamut(value, id));
    const analyze = vi.spyOn(analysis, "analyzeGamut");
    const rows = analyzeRequestedGamuts(value, ids);
    expect(rows.map((row) => row.gamutId)).toEqual(ids);
    expect(rows.map((row) => row.result)).toEqual(direct);
    expect(analyze.mock.calls).toEqual(ids.map((id) => [value, id]));
    for (const [index, row] of rows.entries()) {
      expect(analyze.mock.calls[index]![0]).toBe(value);
      expect(row.result.ok && row.result.value.gamut).toBe(row.gamutId);
      expect(Object.isFrozen(row)).toBe(true);
    }
    expect(Object.isFrozen(rows)).toBe(true);
    expect(snapshotColor(value)).toEqual(before);
  });

  it("does not canonicalize or invent checks at the core operation boundary", () => {
    const value = color({ space: "srgb", channels: [0.2, 0.4, 0.6], alpha: 1 });
    const ids = ["srgb-gamut", "display-p3-gamut"] as const;
    expect(analyzeRequestedGamuts(value, ids).map((row) => row.gamutId)).toEqual(ids);
  });

  it("retains a failed first reference and independently analyzes the original value next", () => {
    const value = color({ space: "srgb", channels: [2.5e128, 2.5e128, 0], alpha: 0.37 });
    const before = definitionOf(value);
    const analyze = vi.spyOn(analysis, "analyzeGamut");
    const rows = analyzeRequestedGamuts(value, ["display-p3-gamut", "srgb-gamut"]);
    expect(rows).toMatchObject([
      {
        gamutId: "display-p3-gamut",
        result: { ok: false, error: { code: "numerical-range", from: "srgb", to: "display-p3" } },
      },
      {
        gamutId: "srgb-gamut",
        result: { ok: true, value: { gamut: "srgb-gamut", status: "outside" } },
      },
    ]);
    expect(analyze.mock.calls.every(([original]) => original === value)).toBe(true);
    expect(definitionOf(value)).toBe(before);
  });

  it("keeps both numerical failures instead of manufacturing outside", () => {
    const value = color({ space: "srgb", channels: [1e308, 0, 0], alpha: 1 });
    const rows = analyzeRequestedGamuts(value, ["display-p3-gamut", "srgb-gamut"]);
    expect(rows).toHaveLength(2);
    for (const row of rows)
      expect(row.result).toMatchObject({ ok: false, error: { code: "numerical-range" } });
  });
});

describe("scoped representation observation uses the existing core operation", () => {
  it.each(["oklch", "oklab", "srgb", "display-p3"] as const)(
    "observes %s without an editor or changing authorship",
    (id) => {
      const value = color({ space: "oklch", channels: [0.5, -0, null], alpha: 0.37 });
      const before = snapshotColor(value);
      expect(represent(value, id)).toMatchObject({ ok: true, value: { space: id, alpha: 0.37 } });
      expect(snapshotColor(value)).toEqual(before);
    },
  );

  it("retains ConversionError independently of successful authored-space observation and exact truth", () => {
    const value = color({ space: "srgb", channels: [2.5e128, 2.5e128, 0], alpha: 1 });
    const before = snapshotColor(value);
    expect(represent(value, "display-p3")).toEqual({
      ok: false,
      error: { code: "numerical-range", from: "srgb", to: "display-p3" },
    });
    expect(represent(value, "srgb")).toMatchObject({
      ok: true,
      value: { channels: [2.5e128, 2.5e128, 0] },
    });
    expect(analysis.analyzeGamut(value, "srgb-gamut")).toMatchObject({
      ok: true,
      value: { status: "outside" },
    });
    expect(snapshotColor(value)).toEqual(before);
  });
});
