import { describe, expect, it, vi } from "vitest";
import { createColorValue } from "@gamut-plane/core";
import * as internal from "@gamut-plane/core/internal/capabilities";
import * as tracing from "../src/perceptualGuides.js";
import {
  resolveEditorVisualSupport,
  resolveField,
  resolveRequestedGuides,
} from "../src/capabilities/index.js";
import { currentField } from "../src/current/field.js";
import { referenceDisplay } from "../src/current/referenceDisplay.js";

vi.mock("../src/perceptualGuides.js", async (original) => {
  const actual = await original<typeof import("../src/perceptualGuides.js")>();
  return { ...actual, traceOklabGuide: vi.fn(actual.traceOklabGuide) };
});

vi.mock("@gamut-plane/core/internal/capabilities", async (original) => {
  const actual = await original<typeof import("@gamut-plane/core/internal/capabilities")>();
  return { ...actual, gamutRayCrossings: vi.fn(actual.gamutRayCrossings) };
});

function distanceToPolyline(point: Readonly<{ x: number; y: number }>, points: ArrayLike<number>) {
  let best = Infinity;
  for (let index = 0; index + 3 < points.length; index += 2) {
    const ax = points[index]!;
    const ay = points[index + 1]!;
    const dx = points[index + 2]! - ax;
    const dy = points[index + 3]! - ay;
    const length = dx * dx + dy * dy;
    const t =
      length === 0
        ? 0
        : Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.y - ay) * dy) / length));
    best = Math.min(best, Math.hypot(point.x - (ax + t * dx), point.y - (ay + t * dy)));
  }
  return best;
}

// Inside the sRGB blue notch: the chroma ray leaves the gamut, re-enters and leaves again.
const notch = createColorValue({ space: "oklch", channels: [0.44, 0.28, 264.1], alpha: 0.37 });
if (!notch.ok) throw new Error("Invalid fixture");
const value = notch.value;
const checks = internal.analyzeRequestedGamuts(value, ["srgb-gamut"]);

describe("traced perceptual guides in resolution", () => {
  it("rejects discovered disconnected traversals instead of returning one partial component", async () => {
    const actual = await vi.importActual<typeof import("@gamut-plane/core/internal/capabilities")>(
      "@gamut-plane/core/internal/capabilities",
    );
    // Three persistent branches form separate loops/chains. The production assemblers must
    // reject the unvisited loop (a/b) or multiple main chains (L/C), regardless of small chords.
    vi.mocked(internal.gamutRayCrossings).mockReturnValue([
      { chroma: 0.05, exit: true, binding: 0 },
      { chroma: 0.1, exit: false, binding: 2 },
      { chroma: 0.2, exit: true, binding: 4 },
    ]);
    try {
      expect(tracing.traceOklabGuide("srgb", 0.619)).toBe("numerical-failure");
      expect(tracing.traceLightnessChromaGuide("srgb", 219)).toBe("numerical-failure");
    } finally {
      vi.mocked(internal.gamutRayCrossings).mockImplementation(actual.gamutRayCrossings);
    }
  });
  it.each(["oklch-lc", "oklab-ab"] as const)(
    "puts the %s Reference marker on the drawn boundary",
    (editorId) => {
      expect(checks[0]?.result).toMatchObject({ ok: true, value: { status: "outside" } });
      const editor = resolveEditorVisualSupport(editorId);
      const field = currentField(editor, resolveField(value, editor));
      const guides = resolveRequestedGuides(value, editor, ["srgb-boundary"]);
      const row = guides[0]!;
      if (row.kind !== "resolved" || row.forms.contour.kind !== "available")
        throw new Error("Missing contour");
      const reference = referenceDisplay("srgb-gamut", guides, field, checks);
      if (reference?.spatial.kind !== "available") throw new Error("Missing Reference");
      expect(
        distanceToPolyline(reference.spatial.point, row.forms.contour.value.points),
      ).toBeLessThanOrEqual(tracing.GUIDE_FIDELITY_BOUND);
    },
  );

  it("reports both in-gamut Chroma intervals along a ray with a notch", () => {
    const editor = resolveEditorVisualSupport("oklch-lc");
    const row = resolveRequestedGuides(value, editor, ["srgb-boundary"])[0]!;
    if (row.kind !== "resolved" || row.forms.kind !== "perceptual")
      throw new Error("Expected perceptual guide");
    expect(row.forms.chromaIntervals).toMatchObject({ kind: "available" });
    if (row.forms.chromaIntervals.kind !== "available") return;
    const intervals = row.forms.chromaIntervals.value;
    expect(intervals).toHaveLength(2);
    expect(intervals[0]!.start).toBe(0);
    expect(intervals[0]!.end).toBeLessThan(intervals[1]!.start);
  });

  it.each(["approximation-budget", "numerical-failure"] as const)(
    "suppresses the contour and spatial Reference after %s, then recovers",
    (reason) => {
      const editor = resolveEditorVisualSupport("oklab-ab");
      const before = resolveRequestedGuides(value, editor, ["srgb-boundary"])[0]!;
      if (before.kind !== "resolved") throw new Error("Expected resolved guide");
      expect(before.forms.contour.kind).toBe("available");
      vi.mocked(tracing.traceOklabGuide).mockReturnValueOnce(reason);
      const row = resolveRequestedGuides(value, resolveEditorVisualSupport("oklab-ab"), [
        "srgb-boundary",
      ])[0]!;
      if (row.kind !== "resolved") throw new Error("Expected resolved guide");
      expect(row.forms.contour).toEqual({
        kind: "value-unavailable",
        reason,
      });
      const field = currentField(editor, resolveField(value, editor));
      const reference = referenceDisplay("srgb-gamut", [row], field, checks);
      expect(reference?.showExcursion).toBe(true);
      expect(reference?.spatial.kind).toBe("unavailable");
      expect(checks[0]?.result).toMatchObject({ ok: true, value: { status: "outside" } });
      const recovered = resolveRequestedGuides(value, editor, ["srgb-boundary"])[0]!;
      if (recovered.kind !== "resolved") throw new Error("Expected resolved guide");
      expect(recovered.forms.contour.kind).toBe("available");
    },
  );
});
