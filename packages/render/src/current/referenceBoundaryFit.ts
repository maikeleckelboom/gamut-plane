import type { GamutId } from "@gamut-plane/core";
import type { GuideResolution } from "../capabilities/guideResolution.js";
import { referenceGuidePolicy } from "../capabilities/guideSupport.js";
import { fitBoundaryContour, type BoundaryFit } from "../viewport/boundaryFit.js";
import type { CurrentField } from "./field.js";
import { nativeSelfBoundary } from "./nativeBoundary.js";

export type ReferenceBoundaryFit =
  | BoundaryFit
  | Readonly<{
      kind: "unavailable";
      reason: "no-reference" | "boundary-not-requested" | "no-field" | "native-self-boundary";
    }>;

/** Camera-independent presentation fact derived solely from accepted requested geometry. */
export function referenceBoundaryFit(
  reference: GamutId | null,
  guides: readonly GuideResolution[],
  field: CurrentField | null,
): ReferenceBoundaryFit {
  if (reference === null) return { kind: "unavailable", reason: "no-reference" };
  const policy: Readonly<Partial<Record<GamutId, string>>> = referenceGuidePolicy;
  const id = policy[reference];
  const guide = guides.find((candidate) => candidate.guideId === id);
  if (!guide) return { kind: "unavailable", reason: "boundary-not-requested" };
  if (!field) return { kind: "unavailable", reason: "no-field" };
  if (id === nativeSelfBoundary(field))
    return { kind: "unavailable", reason: "native-self-boundary" };
  if (guide.kind !== "resolved" || guide.forms.contour.kind !== "available")
    return { kind: "unavailable", reason: "unavailable" };
  return fitBoundaryContour(guide.forms.contour.value, field.geometry.domain.kind);
}
