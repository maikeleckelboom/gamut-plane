import type { GuideFormResult, GuideResolution } from "../capabilities/guideResolution.js";
import type { LinearControlInterval } from "../channelGeometry.js";
import { geometryToSvgPath } from "../geometry.js";

/** Current fail-fast compatibility, not a generalized availability policy. */
export function currentGuideValue<T>(form: GuideFormResult<T>): T {
  if (form.kind === "available") return form.value;
  if (form.reason === "observation-failed") {
    throw new RangeError("Selected color cannot be projected into the instrument");
  }
  throw new RangeError("OKLCH lightness must be between 0 and 1");
}

/** Visual order is explicit and independent of canonical request order. Borrow contour buffers. */
export function currentGuideDisplay(guides: readonly GuideResolution[]) {
  const hueIntervals: LinearControlInterval[] = [];
  const lightnessIntervals: LinearControlInterval[] = [];
  const chromaIntervals: LinearControlInterval[] = [];
  let srgbPath: string | null = null;
  let displayP3Path: string | null = null;
  for (const [id, tone] of [
    ["display-p3-boundary", "display-p3"],
    ["srgb-boundary", "srgb"],
  ] as const) {
    const row = guides.find((guide) => guide.guideId === id);
    if (!row) continue;
    if (row.kind !== "resolved")
      throw new Error("Current editable context requires supported guides");
    const contour = currentGuideValue(row.forms.contour);
    const path = geometryToSvgPath(contour.points, contour.closed);
    if (tone === "srgb") srgbPath = path;
    else displayP3Path = path;
    if (row.forms.hueIntervals !== null) {
      hueIntervals.push(
        ...currentGuideValue(row.forms.hueIntervals).map((interval) => ({ ...interval, tone })),
      );
    }
    lightnessIntervals.push(
      ...currentGuideValue(row.forms.lightnessIntervals).map((interval) => ({ ...interval, tone })),
    );
    // OKLab has no Chroma control; keep its owner-native form without producing unused display rows.
    if (row.support.editorId === "oklch-lc") {
      chromaIntervals.push(
        ...currentGuideValue(row.forms.chromaIntervals).map((interval) => ({ ...interval, tone })),
      );
    }
  }
  return { srgbPath, displayP3Path, hueIntervals, lightnessIntervals, chromaIntervals };
}

export type CurrentGuideDisplay = ReturnType<typeof currentGuideDisplay>;
