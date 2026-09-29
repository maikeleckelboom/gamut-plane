import { currentTargetCopy, gpPart, type currentTargetPresentation } from "@gamut-plane/ui";

type TargetPresentation = ReturnType<typeof currentTargetPresentation>;

export function BoundaryTargetResult({ presentation }: { presentation: TargetPresentation }) {
  const model = presentation.targetResult;
  return (
    <section
      className="gpr-plane-instrument-target-result"
      data-gp-part={gpPart.targetResult}
      data-gp-status={model.status}
      data-boundary-target-result=""
      data-boundary-target={model.target}
      data-target-exact-status={model.status}
      aria-label={presentation.accessibleLabel}
    >
      <div className="gpr-plane-instrument-target-heading" data-gp-part={gpPart.targetHeading}>
        <span>
          {currentTargetCopy.heading} · {model.targetLabel}
        </span>
        <span
          className="gpr-plane-instrument-target-swatch"
          data-gp-part={gpPart.targetSwatch}
          data-boundary-guide-swatch=""
          style={{ background: model.swatchCss }}
          aria-label={presentation.swatchLabel}
          role="img"
        />
        <strong data-target-status={presentation.displayTone}>{presentation.displayStatus}</strong>
      </div>
      <dl>
        <div>
          <dt>{currentTargetCopy.guideChroma}</dt>
          <dd>{model.guideChroma}</dd>
        </div>
        {model.showGuideDelta && (
          <div>
            <dt>{currentTargetCopy.guideDelta}</dt>
            <dd>−{model.guideDelta}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
