import { useRef, type KeyboardEvent } from "react";
import type { GamutPlaneView } from "../GamutPlane.js";

const options = ["oklch", "oklab"] as const;

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
    const next = options[(options.indexOf(option) + direction + options.length) % options.length]!;
    onViewChange(next);
    buttons.current.get(next)?.focus();
  }
  return (
    <div className="gpr-plane-instrument-view-control">
      <div role="radiogroup" aria-label="Coordinate view" aria-orientation="horizontal">
        {options.map((option) => (
          <button
            key={option}
            type="button"
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
            {option === "oklab" ? "OKLab" : "OKLCH"}
          </button>
        ))}
      </div>
    </div>
  );
}
