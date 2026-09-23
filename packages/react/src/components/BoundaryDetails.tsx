export interface BoundaryDetailsModel {
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
      </summary>
      <div className="gpr-plane-instrument-evidence-body">
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
      </div>
    </details>
  );
}
