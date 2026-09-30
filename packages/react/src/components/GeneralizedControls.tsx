import { representationDefinitions } from "@gamut-plane/core/internal/capabilities";
import {
  generalizedCopy,
  formatInspectionNumber,
  gpPart,
  inspectionUi,
  representationUi,
} from "@gamut-plane/ui";
import { coordinatesOptions, validateSelection } from "@gamut-plane/ui";
import { SelectionContext } from "./SelectionContext.js";
import type { AcceptedPresentationView } from "../model/acceptedPresentation.js";
import type { GamutPlaneState } from "../model/publicState.js";

type Request = (state: GamutPlaneState) => void;

export function GeneralizedSelection({
  state,
  accepted,
  request,
  readOnly,
  id,
}: {
  state: GamutPlaneState;
  accepted: AcceptedPresentationView;
  request: Request;
  readOnly: boolean;
  id: string;
}) {
  return (
    <SelectionContext
      id={id}
      selection={accepted.selection}
      options={coordinatesOptions(
        state.checkedGamuts,
        accepted.exactChecks,
        representationDefinitions,
      )}
      disabled={readOnly}
      request={(selection) => {
        const result = validateSelection(selection);
        if (result.ok) request({ ...state, selection: result.value });
      }}
    />
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
