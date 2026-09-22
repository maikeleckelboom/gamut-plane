import type { GamutPlaneView } from "../GamutPlane.js";

export interface BoundaryDetailsModel {
  view: GamutPlaneView;
  p3: string;
  srgb: string;
  selected: string;
  targetLabel: string;
  projection: string;
}

export function BoundaryDetails({ model }: { model: BoundaryDetailsModel }) {
  return (
    <details className="gpr-plane-instrument-evidence" data-boundary-details="">
      <summary>
        <span>Boundary details</span>
        <small>Table guides / projection</small>
      </summary>
      <div className="gpr-plane-instrument-evidence-body">
        <p className="gpr-plane-instrument-legend-note">
          {model.view === "oklch"
            ? "The guides follow the fixed hue. Your color can cross either guide without reducing its chroma."
            : "The contours show sampled gamut limits at this lightness. Your color can cross either guide."}
        </p>
        <div className="gpr-plane-instrument-readouts" aria-label="Boundary guide details">
          <div data-boundary-guide="srgb">
            <span>sRGB table guide</span>
            <code>C {model.srgb}</code>
          </div>
          <div data-boundary-guide="display-p3">
            <span>Display P3 table guide</span>
            <code>C {model.p3}</code>
          </div>
          <div className="gpr-plane-instrument-active-readout">
            <span>Selected color</span>
            <code>{model.selected}</code>
          </div>
          <div className="gpr-plane-instrument-projection-readout">
            <span>{model.targetLabel} target projection</span>
            <code>{model.projection}</code>
          </div>
        </div>
        <p className="gpr-plane-instrument-method">
          {model.view === "oklab"
            ? "Contours and the target projection use sampled guides, not exact boundary solutions. The circular editing limit is separate from both display gamuts."
            : "Contours, channel marks and the target projection use sampled guides. Gamut membership and CSS output use direct color conversion."}
        </p>
      </div>
    </details>
  );
}
