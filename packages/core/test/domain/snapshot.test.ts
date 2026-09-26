import { describe, expect, it } from "vitest";
import {
  createColorValue,
  definingEquals,
  definitionOf,
  restoreColor,
  snapshotColor,
  type ColorRepresentation,
} from "../../src/index.js";

describe("ColorSnapshotV1 transport", () => {
  it.each([
    { space: "oklch", channels: [-0, -0, null], alpha: -0 },
    { space: "oklab", channels: [-0, -0, -0], alpha: -0 },
    { space: "srgb", channels: [-0, -0, -0], alpha: -0 },
    { space: "display-p3", channels: [-0, -0, -0], alpha: -0 },
  ] as ColorRepresentation[])("round trips signed zero in %o across JSON", (definition) => {
    const created = createColorValue(definition);
    if (!created.ok) throw new Error("fixture failed");
    const snapshot = snapshotColor(created.value);
    expect(snapshot.alpha).toBe("-0");
    expect(snapshot.channels[0]).toBe("-0");
    const transported = JSON.parse(JSON.stringify(snapshot)) as unknown;
    const restored = restoreColor(transported);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(definingEquals(created.value, restored.value)).toBe(true);
    expect(restored.value).not.toBe(created.value);
    expect(definitionOf(restored.value)).not.toBe(definitionOf(created.value));
  });

  it("rejects malformed wire data without freezing it", () => {
    const base = {
      type: "gamut-plane/color",
      version: 1,
      space: "srgb",
      channels: [0, 0.5, 1],
      alpha: 1,
    };
    const hole = [0, 0, 1];
    delete hole[1];
    const accessor = Object.defineProperty({ ...base }, "alpha", { get: () => 1 });
    for (const invalid of [
      { ...base, other: 1 },
      { ...base, type: "other" },
      { ...base, channels: [0, 1] },
      { ...base, channels: hole },
      { ...base, channels: [0, 1, "0"] },
      { ...base, channels: [0, 1, null] },
      { ...base, channels: [0, Infinity, 1] },
      { ...base, space: "rec2020" },
      { ...base, alpha: "1" },
      accessor,
    ]) {
      expect(restoreColor(invalid)).toMatchObject({
        ok: false,
        error: { code: "invalid-snapshot" },
      });
      expect(Object.isFrozen(invalid)).toBe(false);
    }
    expect(restoreColor({ ...base, version: 2 })).toMatchObject({
      ok: false,
      error: { code: "unsupported-snapshot-version" },
    });
    expect(restoreColor({ ...base, version: "1" })).toMatchObject({
      ok: false,
      error: { code: "invalid-snapshot" },
    });
    const restored = restoreColor(base);
    expect(restored.ok).toBe(true);
    base.channels[0] = 0.9;
    if (restored.ok) expect(definitionOf(restored.value).channels[0]).toBe(0);
  });
});
