import { useId } from "react";
import { referenceGuidePolicy } from "@gamut-plane/render/internal/capabilities";
import {
  currentRepresentationOptions,
  currentAdmittedEditorsForRepresentation,
  exactGamutUi,
  exactStatusCopy,
  generalizedCopy,
  admittedReferenceGamuts,
  requestReferenceGamut,
  formatInspectionNumber,
  gpPart,
  inspectionUi,
  representationUi,
  requestCheckedGamut,
  requestInspection,
  requestRepresentation,
  requestVisibleGuide,
} from "@gamut-plane/ui";
import type { AcceptedPresentationView } from "../model/acceptedPresentation.js";
import type { GamutPlaneState } from "../model/publicState.js";
import { currentGuideIds } from "../hooks/useGeneralizedState.js";

type Request = (state: GamutPlaneState) => void;

export function GeneralizedSelection({
  state,
  request,
  readOnly,
  id,
}: {
  state: GamutPlaneState;
  request: Request;
  readOnly: boolean;
  id: string;
}) {
  const selected = state.selection;
  const canEdit = currentAdmittedEditorsForRepresentation(selected.representationId).length > 0;
  return (
    <div className="gp-generalized-selection" data-gp-part={gpPart.representationControl}>
      <div className="gp-context-row">
        <div className="gp-context-space">
          <label htmlFor={`${id}-representation`}>{generalizedCopy.representation}</label>
          <select
            id={`${id}-representation`}
            value={selected.representationId}
            disabled={readOnly}
            onChange={(event) =>
              request(
                requestRepresentation(
                  state,
                  event.currentTarget.value as typeof selected.representationId,
                ),
              )
            }
          >
            {currentRepresentationOptions.map((representationId) => (
              <option key={representationId} value={representationId}>
                {representationUi[representationId].label}
              </option>
            ))}
          </select>
        </div>
        {canEdit ? (
          <label className="gp-generalized-edit-toggle">
            <input
              type="checkbox"
              checked={selected.editorId !== null}
              disabled={readOnly}
              onChange={(event) => request(requestInspection(state, !event.currentTarget.checked))}
            />
            {generalizedCopy.editCoordinates}
          </label>
        ) : (
          <span className="gp-context-mode">{generalizedCopy.inspectionOnly}</span>
        )}
      </div>
    </div>
  );
}

export function GeneralizedInspection({ accepted }: { accepted: AcceptedPresentationView }) {
  const selected = accepted.selection.representationId;
  const observation = accepted.observation;
  return (
    <section
      className="gp-inspection"
      data-gp-part={gpPart.inspectionReadout}
      aria-label={`${representationUi[selected].label} coordinates`}
    >
      <h3>{generalizedCopy.coordinates}</h3>
      {observation.ok ? (
        <dl>
          {inspectionUi[selected].channels.map((channel, index) => (
            <div key={channel.id}>
              <dt>
                {channel.label} ({channel.symbol})
              </dt>
              <dd>{formatInspectionNumber(observation.value.channels[index] ?? null)}</dd>
            </div>
          ))}
          <div>
            <dt>{generalizedCopy.alpha}</dt>
            <dd>{formatInspectionNumber(observation.value.alpha)}</dd>
          </div>
        </dl>
      ) : (
        <>
          <p>{generalizedCopy.coordinatesUnavailable}</p>
          <dl>
            <div>
              <dt>{generalizedCopy.alpha}</dt>
              <dd>{formatInspectionNumber(accepted.authored.alpha)}</dd>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}

export function GeneralizedComparison({
  accepted,
  state,
  request,
  readOnly,
  hasPlane,
}: {
  accepted: AcceptedPresentationView;
  state: GamutPlaneState;
  request: Request;
  readOnly: boolean;
  hasPlane: boolean;
}) {
  const referenceName = useId();
  const unavailableGuides = accepted.guides.filter(
    (guide) => !hasPlane || guide.kind !== "resolved" || guide.forms.contour.kind !== "available",
  );
  return (
    <section
      className="gp-generalized-comparison"
      data-gp-part={gpPart.exactResults}
      aria-label={generalizedCopy.comparison}
    >
      <details data-gp-part={gpPart.gamutDisclosure}>
        <summary>
          <span>{generalizedCopy.disclosure}</span>
          {unavailableGuides.length > 0 && <small>{generalizedCopy.boundaryPaused}</small>}
        </summary>
        {admittedReferenceGamuts.map((gamutId) => {
          const label = exactGamutUi[gamutId].label;
          const guideId = referenceGuidePolicy[gamutId];
          const check = accepted.exactChecks.find((row) => row.gamutId === gamutId);
          const status = check
            ? check.result.ok
              ? check.result.value.status
              : "unavailable"
            : null;
          return (
            <fieldset key={gamutId} className="gp-gamut-row">
              <legend>{label}</legend>
              {status !== null && (
                <span
                  data-gp-part={gpPart.exactResult}
                  data-gp-gamut={gamutId}
                  data-gp-status={status}
                >
                  <strong>{exactStatusCopy[status]}</strong>
                </span>
              )}
              <div className="gp-gamut-choices">
                <label>
                  <input
                    type="checkbox"
                    aria-label={`${label} Status`}
                    checked={state.checkedGamuts.includes(gamutId)}
                    disabled={readOnly}
                    onChange={(event) =>
                      request(requestCheckedGamut(state, gamutId, event.currentTarget.checked))
                    }
                  />
                  {generalizedCopy.exactChecks}
                </label>
                <label data-gp-part={gpPart.guidePreference}>
                  <input
                    type="checkbox"
                    aria-label={`${label} Boundary`}
                    checked={state.visibleGuides.includes(guideId)}
                    disabled={readOnly}
                    onChange={(event) =>
                      request(
                        requestVisibleGuide(
                          state,
                          guideId,
                          event.currentTarget.checked,
                          currentGuideIds,
                        ),
                      )
                    }
                  />
                  {generalizedCopy.visibleGuides}
                </label>
                <label>
                  <input
                    type="radio"
                    name={referenceName}
                    aria-label={`Use ${label} as Reference`}
                    checked={state.referenceGamutId === gamutId}
                    disabled={readOnly}
                    onChange={() => request(requestReferenceGamut(state, gamutId))}
                  />
                  {generalizedCopy.reference}
                </label>
              </div>
            </fieldset>
          );
        })}
        <label className="gp-no-reference">
          <input
            type="radio"
            name={referenceName}
            checked={state.referenceGamutId === null}
            disabled={readOnly}
            onChange={() => request(requestReferenceGamut(state, null))}
          />
          {generalizedCopy.noReference}
        </label>
        {unavailableGuides.length > 0 && (
          <p data-gp-part={gpPart.availabilityMessage}>
            {!hasPlane && accepted.selection.editorId === null
              ? generalizedCopy.guidesPending
              : generalizedCopy.guidesUnavailable}
          </p>
        )}
      </details>
    </section>
  );
}
