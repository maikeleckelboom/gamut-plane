import { useRef, type KeyboardEvent } from "react";
import type { GamutPlaneView } from "../GamutPlane.js";
import { gpPart, currentViewOptions, representationUi } from "@gamut-plane/ui";

export function CoordinateViewControl({
  view,
  onViewChange,
}: {
  view: GamutPlaneView;
  onViewChange: (view: GamutPlaneView) => void;
}) {
  const buttons = useRef(new Map<GamutPlaneView, HTMLButtonElement>());
  function navigate(option: GamutPlaneView, event: KeyboardEvent) {
    const direction = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
    if (!direction) return;
    event.preventDefault();
    const next =
      currentViewOptions[
        (currentViewOptions.indexOf(option) + direction + currentViewOptions.length) %
          currentViewOptions.length
      ]!;
    onViewChange(next);
    buttons.current.get(next)?.focus();
  }
  return (
    <div className="gpr-plane-instrument-view-control" data-gp-part={gpPart.viewControl}>
      <div role="radiogroup" aria-label="Coordinate view" aria-orientation="horizontal">
        {currentViewOptions.map((option) => (
          <button
            key={option}
            type="button"
            data-gp-part={gpPart.viewOption}
            role="radio"
            ref={(element) => {
              if (element) buttons.current.set(option, element);
              else buttons.current.delete(option);
            }}
            aria-checked={view === option}
            tabIndex={view === option ? 0 : -1}
            data-plane-option={option}
            onClick={() => onViewChange(option)}
            onKeyDown={(event) => navigate(option, event)}
          >
            {representationUi[option].label}
          </button>
        ))}
      </div>
    </div>
  );
}
