import type { GamutId } from "@gamut-plane/core";
import type { GuideId } from "@gamut-plane/render";
import {
  currentRepresentationOptions,
  exactGamutUi,
  exactStatusCopy,
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
  const canEdit = selected.representationId === "oklch" || selected.representationId === "oklab";
  return (
    <div className="gp-generalized-selection" data-gp-part={gpPart.representationControl}>
      <label htmlFor={`${id}-representation`}>Representation</label>
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
        Edit coordinates
      </label>
      {!canEdit && <small>Inspection only</small>}
      {accepted.authored.representationId !== selected.representationId && (
        <p data-gp-part={gpPart.authorshipContext}>
          Authored as {representationUi[accepted.authored.representationId].label} ·{" "}
          {selected.editorId === null ? "Inspecting" : "Editing"} as{" "}
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
            <dt>Alpha</dt>
            <dd>{formatInspectionNumber(observation.value.alpha)}</dd>
          </div>
        </dl>
      ) : (
        <>
          <p>Coordinates unavailable for this color.</p>
          <dl>
            <div>
              <dt>Alpha</dt>
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
      aria-label="Gamut comparison"
    >
      {accepted.exactChecks.length === 0 ? (
        <p>No gamut checks selected</p>
      ) : (
        <ul>
          {accepted.exactChecks.map((row) => (
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
        <summary>Gamut checks and guides</summary>
        <fieldset>
          <legend>Exact checks</legend>
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
          <legend>Visible guides</legend>
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
              ? "Requested guides will appear when an editable plane is selected."
              : "Some requested guides cannot be shown for this color or editor."}
          </p>
        )}
      </details>
    </section>
  );
}
