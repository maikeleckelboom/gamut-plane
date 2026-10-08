import type { GamutId } from "@gamut-plane/core";
import type { ReferenceBoundaryFit } from "@gamut-plane/render/internal/current";
import type { FieldViewport } from "@gamut-plane/render/internal/viewport";
import {
  exactGamutUi,
  gpPart,
  mountGamutPopup,
  referenceBoundaryFitCopy,
  viewportCopy,
} from "@gamut-plane/ui";
import { useId, useLayoutEffect, useRef } from "react";

export function FieldFraming(props: {
  fit: ReferenceBoundaryFit;
  referenceGamutId: GamutId | null;
  onFit(pose: FieldViewport): void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const binding = useRef<ReturnType<typeof mountGamutPopup> | null>(null);
  const target = props.referenceGamutId ? exactGamutUi[props.referenceGamutId].label : null;
  useLayoutEffect(() => {
    const mounted = mountGamutPopup(trigger.current!, popup.current!, { matchTriggerWidth: false });
    binding.current = mounted;
    return () => {
      binding.current = null;
      mounted.dispose();
    };
  }, []);
  useLayoutEffect(() => {
    binding.current?.reconcile();
  });
  return (
    <div className="gp-field-framing">
      <button
        ref={trigger}
        type="button"
        data-gp-part={gpPart.viewportButton}
        className="gp-framing-trigger"
        aria-label={viewportCopy.framingOptions}
        aria-haspopup="dialog"
        aria-expanded="false"
        aria-controls={`${id}-framing`}
      >
        <span aria-hidden="true">▾</span>
      </button>
      <div
        ref={popup}
        id={`${id}-framing`}
        className="gp-framing-popup"
        role="dialog"
        aria-label={viewportCopy.framing}
        popover="auto"
        hidden
      >
        <span className="gp-framing-reference">
          Reference <span>{target ?? "None"}</span>
        </span>
        <button
          type="button"
          className="gp-framing-action"
          aria-disabled={props.fit.kind !== "available" || undefined}
          aria-describedby={`${id}-reason`}
          onClick={() => {
            if (props.fit.kind !== "available") return;
            props.onFit(props.fit.viewport);
            binding.current?.close(true);
          }}
        >
          {viewportCopy.fitReference}
        </button>
        <p id={`${id}-reason`} className="gp-framing-reason">
          {referenceBoundaryFitCopy(target, props.fit)}
        </p>
      </div>
    </div>
  );
}
