import type { DisplayGamut } from "@gamut-plane/core";

export interface BoundaryTargetResultModel {
  target: DisplayGamut;
  targetLabel: string;
  inGamut: boolean;
  guideChroma: string;
  guideDelta: string;
  showGuideDelta: boolean;
  swatchCss: string;
}

export function BoundaryTargetResult({ model }: { model: BoundaryTargetResultModel }) {
  return (
    <section
      className="gpr-plane-instrument-target-result"
      data-boundary-target-result=""
      data-boundary-target={model.target}
      aria-label={`${model.targetLabel} target boundary result`}
    >
      <div className="gpr-plane-instrument-target-heading">
        <span>Target · {model.targetLabel}</span>
        <strong data-target-status={model.inGamut ? "inside" : "outside"}>
          {model.inGamut ? "Inside" : "Outside"}
        </strong>
      </div>
      <dl>
        <div>
          <dt>Guide C</dt>
          <dd>{model.guideChroma}</dd>
        </div>
        {model.showGuideDelta && (
          <div>
            <dt>ΔC</dt>
            <dd>−{model.guideDelta}</dd>
          </div>
        )}
      </dl>
      <span
        className="gpr-plane-instrument-target-swatch"
        data-boundary-guide-swatch=""
        style={{ background: model.swatchCss }}
        aria-label={`${model.targetLabel} sampled boundary-guide color ${model.swatchCss}`}
        role="img"
      />
    </section>
  );
}
