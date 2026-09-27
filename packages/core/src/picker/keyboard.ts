import type { ColorPlaneProjection } from "./edit.js";
import {
  clampUnit,
  constrainOklabPlanePoint,
  oklabCoordinatesToPlanePoint,
  oklchCoordinatesToPlanePoint,
  OKLAB_PICKER_AXIS_LIMIT,
  OKLCH_PICKER_MAX_CHROMA,
  type PlanePoint,
} from "./geometry.js";
import type { PickerPlaneKeyboardAction } from "./plane.js";

/** Resolves keyboard movement in the observed plane; authorship remains with authorPlaneEdit. */
export function keyboardPlanePoint(
  projection: ColorPlaneProjection,
  action: PickerPlaneKeyboardAction,
  coarse: boolean,
): PlanePoint {
  const step = coarse ? 0.02 : 0.005;
  if (projection.plane === "oklch") {
    let [l, c] = projection.representation.channels;
    if (action === "decrease-x") c -= step;
    else if (action === "increase-x") c += step;
    else if (action === "increase-y") l += step;
    else if (action === "decrease-y") l -= step;
    else if (action === "minimum-x") c = 0;
    else c = OKLCH_PICKER_MAX_CHROMA;
    return oklchCoordinatesToPlanePoint(
      clampUnit(l),
      Math.min(OKLCH_PICKER_MAX_CHROMA, Math.max(0, c)),
    );
  }

  const [, observedA, observedB] = projection.representation.channels;
  let a = observedA;
  let b = observedB;
  if (action === "decrease-x") a -= step;
  else if (action === "increase-x") a += step;
  else if (action === "increase-y") b += step;
  else if (action === "decrease-y") b -= step;
  else {
    b = Math.min(OKLAB_PICKER_AXIS_LIMIT, Math.max(-OKLAB_PICKER_AXIS_LIMIT, b));
    const extent = Math.sqrt(Math.max(0, OKLAB_PICKER_AXIS_LIMIT ** 2 - b ** 2));
    a = action === "minimum-x" ? -extent : extent;
  }
  return constrainOklabPlanePoint(oklabCoordinatesToPlanePoint(a, b));
}

/** Keeps a numeric a/b edit within the existing disc-shaped instrument. */
export function oklabCoordinatePlanePoint(
  projection: ColorPlaneProjection<"oklab">,
  coordinate: "a" | "b",
  value: number,
): PlanePoint {
  if (!Number.isFinite(value)) throw new TypeError("OKLab coordinate must be finite");
  const [, observedA, observedB] = projection.representation.channels;
  const bounded = Math.min(OKLAB_PICKER_AXIS_LIMIT, Math.max(-OKLAB_PICKER_AXIS_LIMIT, value));
  const a = coordinate === "a" ? bounded : observedA;
  const b = coordinate === "b" ? bounded : observedB;
  return constrainOklabPlanePoint(oklabCoordinatesToPlanePoint(a, b));
}
