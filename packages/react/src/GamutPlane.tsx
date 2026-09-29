"use client";

import { presentationStyle } from "./model/presentationStyle.js";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  normalizeHue,
  represent,
  type ColorResult,
  type ColorValue,
  type PlaneEditError,
  type PlaneEditReference,
} from "@gamut-plane/core";
import { editOperationDefinitions } from "@gamut-plane/core/internal/capabilities";
import type { CanvasColorSpaceStatus } from "@gamut-plane/render";
import {
  generalizedEditableDetail,
  generalizedGuideDisplay,
  referenceDisplay,
} from "@gamut-plane/render/internal/current";
import {
  gpPart,
  editorUi,
  directCoordinateHelp,
  directCoordinateContext,
  currentEditorHelp,
  generalizedCopy,
  authorshipContextCopy,
  referenceWarning,
} from "@gamut-plane/ui";
import { useGeneralizedState } from "./hooks/useGeneralizedState.js";
import { ColorPlane } from "./components/ColorPlane.js";
import { ColorChannelControl } from "./components/ColorChannelControl.js";
import {
  GeneralizedComparison,
  GeneralizedInspection,
  GeneralizedSelection,
} from "./components/GeneralizedControls.js";
import { resolveAcceptedRevision } from "./model/acceptedResolution.js";
import { presentAcceptedRevision } from "./model/acceptedPresentation.js";
import type { GamutPlaneState } from "./model/publicState.js";

const [hue, lightness, chroma] = editorUi["oklch-lc"].companions;
const [fixedLightness, a, b] = editorUi["oklab-ab"].companions;
const hueOperation = editOperationDefinitions[hue.operationId];
const lightnessOperation = editOperationDefinitions[lightness.operationId];
const chromaOperation = editOperationDefinitions[chroma.operationId];
const fixedLightnessOperation = editOperationDefinitions[fixedLightness.operationId];
const coordinateOperation = editOperationDefinitions[a.operationId];

type ProtectedRootProp =
  | "children"
  | "dangerouslySetInnerHTML"
  | "defaultValue"
  | "onChange"
  | "role"
  | "aria-label"
  | "aria-labelledby"
  | "aria-hidden"
  | "aria-owns"
  | "contentEditable"
  | "suppressContentEditableWarning"
  | "suppressHydrationWarning"
  | "style";
type GamutPlaneCommonProps = Omit<ComponentPropsWithRef<"section">, ProtectedRootProp> & {
  value: ColorValue;
  onValueChange: (value: ColorValue) => void;
  onValueCommit?: ((value: ColorValue) => void) | undefined;
  onCancel?: (() => void) | undefined;
  onCanvasColorSpaceChange?: ((status: CanvasColorSpaceStatus) => void) | undefined;
  legend?: ReactNode;
  style?: (CSSProperties & { "--gamut-plane-accent"?: string }) | undefined;
};
type InstrumentStateProps = {
  state?: GamutPlaneState;
  defaultState?: GamutPlaneState;
  onStateChange?: ((state: GamutPlaneState) => void) | undefined;
};
export type GamutPlaneProps = GamutPlaneCommonProps & InstrumentStateProps;

const protectedRootProps = new Set<string>([
  "children",
  "dangerouslySetInnerHTML",
  "defaultValue",
  "onChange",
  "onCommit",
  "onCapability",
  "state",
  "defaultState",
  "onStateChange",
  "role",
  "aria-label",
  "aria-labelledby",
  "aria-hidden",
  "aria-owns",
  "contentEditable",
  "suppressContentEditableWarning",
  "suppressHydrationWarning",
]);

export function GamutPlane(props: GamutPlaneProps) {
  const {
    value,
    onValueChange,
    onValueCommit,
    onCancel,
    onCanvasColorSpaceChange,
    legend,
    className,
    style,
    ref,
    ...rootProps
  } = props;
  const {
    accepted: acceptedState,
    request: requestState,
    readOnly,
  } = useGeneralizedState(props, Object.hasOwn(props, "state"));
  const id = useId();
  const revision = resolveAcceptedRevision(value, acceptedState);
  const accepted = presentAcceptedRevision(revision);
  const visual = generalizedEditableDetail(
    revision.source,
    accepted.observation,
    accepted.editor,
    accepted.field,
  );
  const field = visual.kind === "available" ? visual.field : null;
  const oklch = visual.kind === "available" ? visual.oklch : null;
  const detail = visual.kind === "available" ? visual.detail : null;
  const view = field?.projection.representationId ?? null;
  const help =
    field && oklch
      ? currentEditorHelp(
          field.editorId,
          field.geometry.domain.kind,
          oklch.channels[2] === null,
          field.markerInDomain,
        )
      : null;
  const guides = generalizedGuideDisplay(accepted.guides);
  const reference = referenceDisplay(
    acceptedState.referenceGamutId,
    accepted.guides,
    field,
    accepted.exactChecks,
  );
  const warning = referenceWarning(acceptedState.referenceGamutId, accepted.exactChecks);
  const hueReference = useRef<PlaneEditReference | undefined>(undefined);
  const acceptedHue = oklch?.channels[2] ?? null;
  const hueReferenceContext = useRef(revision.contextKey);
  const getHueReference = () =>
    hueReferenceContext.current === revision.contextKey ? hueReference.current : undefined;
  useLayoutEffect(() => {
    hueReferenceContext.current = revision.contextKey;
    const hue = acceptedHue;
    if (hue !== null) hueReference.current = { hue };
    else hueReference.current = undefined;
  }, [value, revision.contextKey, acceptedHue]);
  const [huePreview, setHuePreview] = useState(false);
  // An accepted editor transition interrupts temporary preview ownership.
  useLayoutEffect(() => {
    setHuePreview(false);
  }, [revision.contextKey]);
  function edit(result: ColorResult<ColorValue, PlaneEditError>, complete: boolean) {
    if (!result.ok) return;
    const observed = represent(result.value, "oklch");
    if (observed.ok && observed.value.channels[2] !== null) {
      hueReference.current = { hue: observed.value.channels[2] };
    }
    onValueChange(result.value);
    if (complete) onValueCommit?.(result.value);
  }
  const dom = Object.fromEntries(
    Object.entries(rootProps).filter(
      ([key]) =>
        !protectedRootProps.has(key) &&
        !/^data-(?:plane-|active-plane$|picker-|render-|field-|gamut-|outside-|marker-|boundary-|table-boundary)/.test(
          key,
        ),
    ),
  );
  const safeStyle = Object.fromEntries(
    Object.entries(style ?? {}).filter(([key]) => !/^--(?:picker-|gp-)/.test(key)),
  );
  const shared = { onCancel, warning };
  return (
    <section
      {...dom}
      ref={ref}
      className={["gamut-plane-react", className].filter(Boolean).join(" ")}
      style={presentationStyle({
        ...safeStyle,
        ...(detail && { "--picker-active": detail.activeCss }),
      })}
      data-plane-instrument=""
      data-gp-root=""
      data-gp-view={accepted.selection.representationId}
      data-active-plane={view ?? undefined}
      aria-labelledby={`${id}-instrument-title`}
    >
      <h2 id={`${id}-instrument-title`} className="gpr-sr-only" data-gp-visually-hidden="">
        {generalizedCopy.instrument}
      </h2>
      <GeneralizedSelection
        accepted={accepted}
        state={acceptedState}
        request={requestState}
        readOnly={readOnly}
        id={id}
      />
      <div className="gpr-plane-instrument-workspace" data-gp-part={gpPart.workspace}>
        <div className="gpr-plane-instrument-field" data-gp-part={gpPart.field}>
          {field && detail ? (
            <ColorPlane
              value={revision.source}
              semanticContextKey={revision.contextKey}
              field={field}
              guides={guides}
              reference={reference}
              warning={warning}
              markerCss={detail.markerCss}
              getEditReference={getHueReference}
              plane={field.plane}
              interactionPreview={view === "oklch" && huePreview}
              onValueChange={onValueChange}
              onValueCommit={onValueCommit}
              onCancel={onCancel}
              onCanvasColorSpaceChange={onCanvasColorSpaceChange}
            />
          ) : (
            <>
              {accepted.selection.editorId !== null && (
                <p data-gp-part={gpPart.availabilityMessage}>{generalizedCopy.planeUnavailable}</p>
              )}
              <GeneralizedInspection accepted={accepted} />
            </>
          )}
          {legend}
        </div>
        <div className="gpr-plane-instrument-controls" data-gp-part={gpPart.controls}>
          {field &&
            detail &&
            oklch &&
            help &&
            (detail.view === "oklch" ? (
              <>
                <ColorChannelControl
                  key={`${revision.contextKey}:${hue.channelId}:${hue.operationId}`}
                  {...shared}
                  id={`${id}-hue`}
                  channel={hue.symbol}
                  label={hue.label}
                  value={field.samplingFixed}
                  min={hue.sliderRange.min}
                  max={hue.sliderRange.max}
                  step={hue.step}
                  precision={hue.precision}
                  gradient={detail.hueGradient}
                  intervals={guides.hueIntervals}
                  normalizeValue={normalizeHue}
                  help={help.hueHelp}
                  onInput={(next) =>
                    edit(
                      hueOperation.author(revision.source, {
                        ...hueOperation.request,
                        channels: { h: hueOperation.normalize(next) },
                      }),
                      false,
                    )
                  }
                  onComplete={(next) =>
                    edit(
                      hueOperation.author(revision.source, {
                        ...hueOperation.request,
                        channels: { h: hueOperation.normalize(next) },
                      }),
                      true,
                    )
                  }
                  onInteraction={setHuePreview}
                />
                <ColorChannelControl
                  key={`${revision.contextKey}:${lightness.channelId}:${lightness.operationId}`}
                  {...shared}
                  id={`${id}-lightness`}
                  channel={lightness.symbol}
                  label={lightness.label}
                  value={oklch.channels[0]}
                  min={lightness.sliderRange.min}
                  max={lightness.sliderRange.max}
                  step={lightness.step}
                  precision={lightness.precision}
                  gradient={detail.lightnessGradient}
                  intervals={guides.lightnessIntervals}
                  onInput={(next) =>
                    edit(
                      lightnessOperation.author(revision.source, {
                        ...lightnessOperation.request,
                        channels: { l: next },
                      }),
                      false,
                    )
                  }
                  onComplete={(next) =>
                    edit(
                      lightnessOperation.author(revision.source, {
                        ...lightnessOperation.request,
                        channels: { l: next },
                      }),
                      true,
                    )
                  }
                />
                <ColorChannelControl
                  key={`${revision.contextKey}:${chroma.channelId}:${chroma.operationId}`}
                  {...shared}
                  id={`${id}-chroma`}
                  channel={chroma.symbol}
                  label={chroma.label}
                  value={oklch.channels[1]}
                  min={chroma.sliderRange.min}
                  max={chroma.sliderRange.max}
                  step={chroma.step}
                  precision={chroma.precision}
                  gradient={detail.chromaGradient}
                  intervals={guides.chromaIntervals}
                  overflowMax={!("max" in chroma.numericBounds)}
                  help={help.chromaHelp}
                  onInput={(next) =>
                    edit(
                      chromaOperation.author(revision.source, {
                        ...chromaOperation.request,
                        channels: { c: next },
                        ...(getHueReference() && { reference: getHueReference()! }),
                      }),
                      false,
                    )
                  }
                  onComplete={(next) =>
                    edit(
                      chromaOperation.author(revision.source, {
                        ...chromaOperation.request,
                        channels: { c: next },
                        ...(getHueReference() && { reference: getHueReference()! }),
                      }),
                      true,
                    )
                  }
                />
              </>
            ) : (
              <>
                <ColorChannelControl
                  key={`${revision.contextKey}:${fixedLightness.channelId}:${fixedLightness.operationId}`}
                  {...shared}
                  id={`${id}-oklab-lightness`}
                  channel={fixedLightness.symbol}
                  label={fixedLightness.label}
                  value={field.samplingFixed}
                  min={fixedLightness.sliderRange.min}
                  max={fixedLightness.sliderRange.max}
                  step={fixedLightness.step}
                  precision={fixedLightness.precision}
                  gradient={detail.fixedLightnessGradient}
                  intervals={guides.lightnessIntervals}
                  help={help.domainHelp}
                  onInput={(next) =>
                    edit(
                      fixedLightnessOperation.author(revision.source, {
                        ...fixedLightnessOperation.request,
                        channels: { l: next },
                      }),
                      false,
                    )
                  }
                  onComplete={(next) =>
                    edit(
                      fixedLightnessOperation.author(revision.source, {
                        ...fixedLightnessOperation.request,
                        channels: { l: next },
                      }),
                      true,
                    )
                  }
                />
                {[a, b].map((control) => {
                  const coordinate = detail.coordinates[control.symbol];
                  const channels = field.projection.representation.channels;
                  const scalar = channels[control.symbol === "a" ? 1 : 2]!;
                  return (
                    <ColorChannelControl
                      key={`${revision.contextKey}:${control.channelId}:${control.operationId}`}
                      {...shared}
                      id={`${id}-oklab-${control.symbol}`}
                      channel={control.symbol}
                      label={control.label}
                      accessibleLabel={control.accessibleLabel}
                      value={scalar}
                      min={coordinate.range?.min}
                      max={coordinate.range?.max}
                      step={control.step}
                      precision={control.precision}
                      gradient={coordinate.gradient}
                      intervals={[]}
                      continuous
                      coordinateContext={directCoordinateContext(
                        control.symbol,
                        field.projection.representation,
                      )}
                      help={directCoordinateHelp(control.symbol, coordinate.range)}
                      onInput={(next) =>
                        edit(
                          coordinateOperation.authorCoordinate(
                            revision.source,
                            control.symbol,
                            next,
                          ),
                          false,
                        )
                      }
                      onComplete={(next) =>
                        edit(
                          coordinateOperation.authorCoordinate(
                            revision.source,
                            control.symbol,
                            next,
                          ),
                          true,
                        )
                      }
                    />
                  );
                })}
              </>
            ))}
          {accepted.authored.representationId !== accepted.selection.representationId && (
            <p data-gp-part={gpPart.authorshipContext}>
              {authorshipContextCopy(accepted.authored.representationId)}
            </p>
          )}
          <GeneralizedComparison
            accepted={accepted}
            state={acceptedState}
            request={requestState}
            readOnly={readOnly}
            hasPlane={field !== null && detail !== null}
          />
        </div>
      </div>
    </section>
  );
}
