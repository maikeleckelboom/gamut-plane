import {
  convertOklchToOklab,
  serializeOklchSample,
  type GamutId,
  type PickerGuide,
  type PlanePoint,
} from "@gamut-plane/core";
import type { GamutCheckResult } from "@gamut-plane/core/internal/capabilities";
import { referenceGuidePolicy, type GuideId } from "../capabilities/guideSupport.js";
import type { GuideResolution } from "../capabilities/guideResolution.js";
import type { CurrentField } from "./field.js";

export type ReferenceDisplay = Readonly<{
  gamutId: GamutId;
  guideId: GuideId;
  /** Borrowed sampled fact, retained even when it cannot be drawn. Never exact status. */
  sampled: PickerGuide;
  /** Only an explicitly requested, accepted exact Outside result warrants an excursion annotation. */
  showExcursion: boolean;
  spatial:
    | Readonly<{ kind: "unavailable" }>
    | Readonly<{ kind: "available"; point: PlanePoint; markerCss: string }>;
}>;

/** Current supported geometries only; no clamp, authoring, new sampling, or exact analysis. */
export function referenceDisplay(
  referenceGamutId: GamutId | null,
  guides: readonly GuideResolution[],
  field: CurrentField | null,
  exactChecks: readonly GamutCheckResult[],
): ReferenceDisplay | null {
  if (referenceGamutId === null) return null;
  const policy: Readonly<Partial<Record<GamutId, GuideId>>> = referenceGuidePolicy;
  const guideId = policy[referenceGamutId];
  if (guideId === undefined) return null;
  const guide = guides.find((row) => row.guideId === guideId);
  if (guide?.kind !== "resolved" || guide.forms.reference.kind !== "available") return null;
  const sampled = guide.forms.reference.value;
  const exact = exactChecks.find((row) => row.gamutId === referenceGamutId)?.result;
  const showExcursion = exact?.ok === true && exact.value.status === "outside";
  const fact = { gamutId: referenceGamutId, guideId, sampled, showExcursion };
  if (field === null) return { ...fact, spatial: { kind: "unavailable" } };
  let point: PlanePoint;
  switch (field.geometry.id) {
    case "oklch-lc-rectangle":
      point = field.geometry.toPoint(sampled.color.l, sampled.color.c);
      break;
    case "oklab-ab-disc": {
      const [, a, b] = convertOklchToOklab(sampled.color);
      point = field.geometry.toPoint(a!, b!);
      break;
    }
    default:
      return { ...fact, spatial: { kind: "unavailable" } };
  }
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !field.geometry.contains(point))
    return { ...fact, spatial: { kind: "unavailable" } };
  return {
    ...fact,
    spatial: {
      kind: "available",
      point,
      // Opaque annotation occludes guides even for a translucent authored color.
      markerCss: serializeOklchSample({ ...sampled.color, alpha: 1 }),
    },
  };
}
