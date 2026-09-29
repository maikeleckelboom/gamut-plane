import { useRef, useState } from "react";
import type { GuideId } from "@gamut-plane/render";
import {
  canonicalInstrumentState,
  initialInstrumentState,
  instrumentViewStatesEqual,
} from "@gamut-plane/ui";
import type { GamutPlaneState } from "../model/publicState.js";

export const currentGuideIds = Object.freeze([
  "display-p3-boundary",
  "srgb-boundary",
] as const satisfies readonly GuideId[]);

export interface GeneralizedStateProps {
  state?: GamutPlaneState;
  defaultState?: GamutPlaneState;
  onStateChange?: ((state: GamutPlaneState) => void) | undefined;
}

export function useGeneralizedState(props: GeneralizedStateProps, controlled: boolean) {
  const ownership = useRef(controlled);
  if (ownership.current !== controlled)
    throw new Error("GamutPlane state ownership cannot change during an instance lifetime");
  const [local, setLocal] = useState<GamutPlaneState>(() =>
    canonicalInstrumentState(
      props.defaultState ?? initialInstrumentState<GuideId>(),
      currentGuideIds,
    ),
  );
  const accepted = controlled ? canonicalInstrumentState(props.state, currentGuideIds) : local;
  function request(nextInput: GamutPlaneState) {
    if (controlled && !props.onStateChange) return;
    const next = canonicalInstrumentState(nextInput, currentGuideIds);
    if (instrumentViewStatesEqual(accepted, next)) return;
    if (!controlled) setLocal(next);
    props.onStateChange?.(next);
  }
  return { accepted, request, readOnly: controlled && !props.onStateChange } as const;
}
