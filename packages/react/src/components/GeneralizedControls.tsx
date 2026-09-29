import type { GamutId } from "@gamut-plane/core";
import type { GuideId } from "@gamut-plane/render";
import {
  currentRepresentationOptions,
  currentAdmittedEditorsForRepresentation,
  exactGamutUi,
  exactStatusCopy,
  generalizedCopy,
  orderedExactChecks,
  formatInspectionNumber,
  gpPart,
  guidePreferenceUi,
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
  accepted,
  state,
  request,
  readOnly,
  id,
}: {
  accepted: AcceptedPresentationView;
  state: GamutPlaneState;
  request: Request;
  readOnly: boolean;
  id: string;
}) {
  const selected = state.selection;
  const canEdit = currentAdmittedEditorsForRepresentation(selected.representationId).length > 0;
  return (
    <div className="gp-generalized-selection" data-gp-part={gpPart.representationControl}>
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
      <label className="gp-generalized-edit-toggle">
        <input
          type="checkbox"
          checked={selected.editorId !== null}
          disabled={readOnly || !canEdit}
          onChange={(event) => request(requestInspection(state, !event.currentTarget.checked))}
        />
        {generalizedCopy.editCoordinates}
      </label>
      {!canEdit && <small>{generalizedCopy.inspectionOnly}</small>}
      {accepted.authored.representationId !== selected.representationId && (
        <p data-gp-part={gpPart.authorshipContext}>
          Authored as {representationUi[accepted.authored.representationId].label} ·{" "}
          {selected.editorId === null ? generalizedCopy.inspecting : generalizedCopy.editing} as{" "}
          {representationUi[selected.representationId].label}
        </p>
      )}
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

const gamutIds = ["srgb-gamut", "display-p3-gamut"] as const satisfies readonly GamutId[];
const guideIds = ["srgb-boundary", "display-p3-boundary"] as const satisfies readonly GuideId[];

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
  const unavailableGuides = accepted.guides.filter(
    (guide) => !hasPlane || guide.kind !== "resolved" || guide.forms.contour.kind !== "available",
  );
  return (
    <section
      className="gp-generalized-comparison"
      data-gp-part={gpPart.exactResults}
      aria-label={generalizedCopy.comparison}
    >
      {accepted.exactChecks.length === 0 ? (
        <p>{generalizedCopy.noChecks}</p>
      ) : (
        <ul>
          {orderedExactChecks(accepted.exactChecks).map((row) => (
            <li
              key={row.gamutId}
              data-gp-part={gpPart.exactResult}
              data-gp-status={row.result.ok ? row.result.value.status : "unavailable"}
            >
              <span>{exactGamutUi[row.gamutId].label}</span>
              <strong>
                {exactStatusCopy[row.result.ok ? row.result.value.status : "unavailable"]}
              </strong>
            </li>
          ))}
        </ul>
      )}
      <details data-gp-part={gpPart.gamutDisclosure}>
        <summary>{generalizedCopy.disclosure}</summary>
        <fieldset>
          <legend>{generalizedCopy.exactChecks}</legend>
          {gamutIds.map((gamutId) => (
            <label key={gamutId}>
              <input
                type="checkbox"
                checked={state.checkedGamuts.includes(gamutId)}
                disabled={readOnly}
                onChange={(event) =>
                  request(requestCheckedGamut(state, gamutId, event.currentTarget.checked))
                }
              />
              {exactGamutUi[gamutId].label}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>{generalizedCopy.visibleGuides}</legend>
          {guideIds.map((guideId) => (
            <label key={guideId} data-gp-part={gpPart.guidePreference}>
              <input
                type="checkbox"
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
              {guidePreferenceUi[guideId].label}
            </label>
          ))}
        </fieldset>
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
