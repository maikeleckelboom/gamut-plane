import { useState } from "react";
import type { GamutPlaneView } from "../GamutPlane.js";

export function useControllableView(
  controlled: GamutPlaneView | undefined,
  defaultView: GamutPlaneView,
  onViewChange: ((view: GamutPlaneView) => void) | undefined,
) {
  const [owned, setOwned] = useState(defaultView);
  const view = controlled ?? owned;
  function request(next: GamutPlaneView) {
    if (next === view) return;
    if (controlled === undefined) setOwned(next);
    onViewChange?.(next);
  }
  return [view, request] as const;
}
