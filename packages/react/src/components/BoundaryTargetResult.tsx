import type { DisplayGamut, GamutStatus } from "@gamut-plane/core";

export interface BoundaryTargetResultModel {
  target: DisplayGamut;
  targetLabel: string;
  status: GamutStatus;
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
      data-target-exact-status={model.status}
      aria-label={`${model.targetLabel} target boundary result`}
    >
      <div className="gpr-plane-instrument-target-heading">
        <span>Target · {model.targetLabel}</span>
        <span
          className="gpr-plane-instrument-target-swatch"
          data-boundary-guide-swatch=""
          style={{ background: model.swatchCss }}
          aria-label={`${model.targetLabel} sampled boundary-guide color ${model.swatchCss}`}
          role="img"
        />
        <strong data-target-status={model.status === "outside" ? "outside" : "inside"}>
          {model.status === "outside" ? "Outside" : "Inside"}
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
    </section>
  );
}
