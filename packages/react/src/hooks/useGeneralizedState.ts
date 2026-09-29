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

export function useGeneralizedState(
  props: GeneralizedStateProps,
  generalized: boolean,
  controlled: boolean,
) {
  const route = useRef(generalized);
  const ownership = useRef(controlled);
  if (route.current !== generalized)
    throw new Error("GamutPlane state route cannot change during an instance lifetime");
  if (generalized && ownership.current !== controlled)
    throw new Error("GamutPlane state ownership cannot change during an instance lifetime");
  const [local, setLocal] = useState<GamutPlaneState>(() =>
    generalized
      ? canonicalInstrumentState(
          props.defaultState ?? initialInstrumentState<GuideId>(),
          currentGuideIds,
        )
      : initialInstrumentState<GuideId>(),
  );
  const accepted =
    generalized && controlled ? canonicalInstrumentState(props.state, currentGuideIds) : local;
  function request(nextInput: GamutPlaneState) {
    if (!generalized || (controlled && !props.onStateChange)) return;
    const next = canonicalInstrumentState(nextInput, currentGuideIds);
    if (instrumentViewStatesEqual(accepted, next)) return;
    if (!controlled) setLocal(next);
    props.onStateChange?.(next);
  }
  return { accepted, request, readOnly: controlled && !props.onStateChange } as const;
}
