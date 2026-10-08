import { useLayoutEffect, useRef } from "react";
import type { GamutCheckResult } from "@gamut-plane/core/internal/capabilities";
import type { GuideId } from "@gamut-plane/render";
import { referenceGuidePolicy } from "@gamut-plane/render/internal/capabilities";
import {
  boundaryPausedCopy,
  gamutCloseGlyphPath,
  gamutRows,
  gamutStatusCopy,
  gamutDisclosureCopy,
  generalizedCopy,
  gpPart,
  mountGamutPopup,
  referenceChoices,
  type GamutAction,
} from "@gamut-plane/ui";
import type { GamutPlaneState } from "../model/publicState.js";

/** Controlled native inputs always render accepted state; React restores rejected mutations. */
export function GamutComparison({
  id,
  state,
  checks,
  paused,
  readOnly,
  request,
}: {
  id: string;
  state: GamutPlaneState;
  checks: readonly GamutCheckResult[];
  paused: readonly GuideId[];
  readOnly: boolean;
  request(action: GamutAction<GuideId>): void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const binding = useRef<ReturnType<typeof mountGamutPopup> | null>(null);
  useLayoutEffect(() => {
    const mounted = mountGamutPopup(trigger.current!, popup.current!);
    binding.current = mounted;
    return () => {
      mounted.dispose();
      binding.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    binding.current?.reconcile();
  });
  const rows = gamutRows(state, checks, referenceGuidePolicy, paused);
  const summary = gamutDisclosureCopy(state, checks, paused);
  return (
    <div className="gp-gamuts" data-gp-part={gpPart.gamuts}>
      <button
        ref={trigger}
        id={`${id}-gamuts`}
        type="button"
        className="gp-gamuts-trigger"
        data-gp-part={gpPart.gamutTrigger}
        aria-haspopup="dialog"
        aria-expanded="false"
        aria-controls={`${id}-gamuts-popup`}
        aria-labelledby={`${id}-gamuts-label`}
        aria-describedby={`${id}-gamuts-description`}
      >
        <span id={`${id}-gamuts-label`} className="gp-gamuts-label">
          <svg
            className="gp-gamuts-layers"
            viewBox="0 0 16 16"
            aria-hidden="true"
            focusable="false"
          >
            <path d="m8 2 6 3-6 3-6-3Zm-6 6 6 3 6-3M2 11l6 3 6-3" />
          </svg>
          <span>{generalizedCopy.comparison}</span>
        </span>
        {summary.cue && (
          <span
            className="gp-gamuts-summary"
            data-gp-part={gpPart.gamutSummary}
            data-gp-status={summary.status}
          >
            {summary.cue}
          </span>
        )}
        <span className="gp-gamuts-chevron" aria-hidden="true">
          ›
        </span>
        <span id={`${id}-gamuts-description`} data-gp-visually-hidden="">
          {summary.description}
        </span>
      </button>
      <div
        ref={popup}
        id={`${id}-gamuts-popup`}
        className="gp-gamuts-popup"
        data-gp-part={gpPart.gamutPopup}
        role="dialog"
        aria-labelledby={`${id}-gamuts-heading`}
        aria-describedby={readOnly ? `${id}-gamuts-read-only` : undefined}
        popover="auto"
        tabIndex={-1}
        hidden
      >
        <div className="gp-gamuts-head">
          <span id={`${id}-gamuts-heading`} className="gp-gamuts-heading">
            {generalizedCopy.comparison}
          </span>
          {readOnly && (
            <span id={`${id}-gamuts-read-only`} className="gp-gamuts-read-only">
              {generalizedCopy.readOnly}
            </span>
          )}
          <button
            type="button"
            className="gp-gamuts-close"
            data-gp-close=""
            aria-label={generalizedCopy.close}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
              <path d={gamutCloseGlyphPath} />
            </svg>
          </button>
        </div>
        {rows.map((row) => (
          <div
            key={row.gamutId}
            role="group"
            className="gp-gamut-row"
            data-gp-part={gpPart.gamutRow}
            data-gp-gamut={row.gamutId}
            aria-labelledby={`${id}-${row.gamutId}-name`}
            aria-describedby={`${id}-${row.gamutId}-status`}
          >
            <span id={`${id}-${row.gamutId}-name`} className="gp-gamut-name">
              {row.label}
            </span>
            {row.checked ? (
              <span
                id={`${id}-${row.gamutId}-status`}
                className="gp-gamut-status"
                data-gp-part={gpPart.exactResult}
                data-gp-gamut={row.gamutId}
                data-gp-status={row.status}
              >
                {gamutStatusCopy(row.status)}
              </span>
            ) : (
              <span id={`${id}-${row.gamutId}-status`} className="gp-gamut-status">
                {generalizedCopy.statusOff}
              </span>
            )}
            <div className="gp-gamut-toggles">
              <label className="gp-gamut-toggle">
                <input
                  type="checkbox"
                  aria-label={`${row.label} ${generalizedCopy.exactChecks}`}
                  checked={row.checked}
                  disabled={readOnly}
                  onChange={(event) =>
                    request({
                      kind: "status",
                      gamutId: row.gamutId,
                      requested: event.currentTarget.checked,
                    })
                  }
                />
                <span>{generalizedCopy.exactChecks}</span>
              </label>
              <label className="gp-gamut-toggle" data-gp-part={gpPart.guidePreference}>
                <input
                  type="checkbox"
                  aria-label={`${row.label} ${generalizedCopy.visibleGuides}`}
                  aria-describedby={row.boundaryPaused ? `${id}-${row.gamutId}-paused` : undefined}
                  checked={row.boundary}
                  disabled={readOnly}
                  onChange={(event) =>
                    request({
                      kind: "boundary",
                      guideId: row.guideId,
                      requested: event.currentTarget.checked,
                    })
                  }
                />
                <span>{generalizedCopy.visibleGuides}</span>
                <svg
                  className="gp-boundary-sample"
                  viewBox="0 0 16 4"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path d="M1 2H15" />
                </svg>
                {row.boundaryPaused && (
                  <>
                    <span className="gp-boundary-paused" aria-hidden="true">
                      {generalizedCopy.boundaryPaused}
                    </span>
                    <span id={`${id}-${row.gamutId}-paused`} data-gp-visually-hidden="">
                      {boundaryPausedCopy(state.selection)}
                    </span>
                  </>
                )}
              </label>
            </div>
          </div>
        ))}
        <div
          role="radiogroup"
          className="gp-reference"
          data-gp-part={gpPart.referenceChoice}
          aria-labelledby={`${id}-reference-label`}
        >
          <span id={`${id}-reference-label`} className="gp-reference-label">
            {generalizedCopy.reference}
          </span>
          <div className="gp-reference-options">
            {referenceChoices(state.referenceGamutId).map((choice) => (
              <label key={choice.value}>
                <input
                  type="radio"
                  name={`${id}-reference`}
                  value={choice.value}
                  checked={choice.selected}
                  disabled={readOnly}
                  onChange={() => request({ kind: "reference", gamutId: choice.gamutId })}
                />
                <span>{choice.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
