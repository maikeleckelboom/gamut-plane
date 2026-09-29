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
  authorPlaneEdit,
  normalizeHue,
  oklabCoordinatePlanePoint,
  represent,
  type ColorResult,
  type ColorValue,
  type DisplayGamut,
  type PlaneEditError,
  type PlaneEditReference,
} from "@gamut-plane/core";
import type { CanvasColorSpaceStatus } from "@gamut-plane/render";
import {
  currentField,
  currentExactChecks,
  currentOklchObservation,
  currentEditableDetail,
  currentGuideDisplay,
  legacyTargetCompatibility,
} from "@gamut-plane/render/internal/current";
import { gpPart, editorUi } from "@gamut-plane/ui";
import { useControllableView } from "./hooks/useControllableView.js";
import { CoordinateViewControl } from "./components/CoordinateViewControl.js";
import { ColorPlane } from "./components/ColorPlane.js";
import { ColorChannelControl } from "./components/ColorChannelControl.js";
import { NumericInput } from "./components/NumericInput.js";
import { BoundaryTargetResult } from "./components/BoundaryTargetResult.js";
import { legacyViewState, resolveAcceptedRevision } from "./model/acceptedResolution.js";
import { presentAcceptedRevision } from "./model/acceptedPresentation.js";
import { currentView } from "./model/currentView.js";

const [hue, lightness, chroma] = editorUi["oklch-lc"].companions;
const [fixedLightness, a, b] = editorUi["oklab-ab"].companions;

export type GamutPlaneView = "oklch" | "oklab";
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
export interface GamutPlaneProps extends Omit<ComponentPropsWithRef<"section">, ProtectedRootProp> {
  value: ColorValue;
  onValueChange: (value: ColorValue) => void;
  view?: GamutPlaneView | undefined;
  defaultView?: GamutPlaneView | undefined;
  onViewChange?: ((view: GamutPlaneView) => void) | undefined;
  boundaryTarget?: DisplayGamut | undefined;
  showSrgbBoundary?: boolean | undefined;
  showDisplayP3Boundary?: boolean | undefined;
  onValueCommit?: ((value: ColorValue) => void) | undefined;
  onCancel?: (() => void) | undefined;
  onCanvasColorSpaceChange?: ((status: CanvasColorSpaceStatus) => void) | undefined;
  legend?: ReactNode;
  style?: (CSSProperties & { "--gamut-plane-accent"?: string }) | undefined;
}

const protectedRootProps = new Set<string>([
  "children",
  "dangerouslySetInnerHTML",
  "defaultValue",
  "onChange",
  "onCommit",
  "onCapability",
  "role",
  "aria-label",
  "aria-labelledby",
  "aria-hidden",
  "aria-owns",
  "contentEditable",
  "suppressContentEditableWarning",
  "suppressHydrationWarning",
]);

export function GamutPlane({
  value,
  onValueChange,
  view: controlledView,
  defaultView = "oklch",
  onViewChange,
  boundaryTarget = "srgb",
  showSrgbBoundary = true,
  showDisplayP3Boundary = true,
  onValueCommit,
  onCancel,
  onCanvasColorSpaceChange,
  legend,
  className,
  style,
  ref,
  ...rootProps
}: GamutPlaneProps) {
  const [frameworkView, requestView] = useControllableView(
    controlledView,
    defaultView,
    onViewChange,
  );
  const id = useId();
  const revision = resolveAcceptedRevision(
    value,
    legacyViewState(frameworkView, showSrgbBoundary, showDisplayP3Boundary),
  );
  const accepted = presentAcceptedRevision(revision);
  const view = currentView(accepted.selection);
  const field = currentField(view, accepted.editor, accepted.field);
  const oklch = currentOklchObservation(revision.source, accepted.observation);
  const checks = currentExactChecks(accepted.exactChecks);
  const target = legacyTargetCompatibility(
    field.editorId,
    boundaryTarget,
    checks,
    accepted.guides,
    oklch,
  );
  const detail = currentEditableDetail(field, oklch);
  const guides = currentGuideDisplay(accepted.guides);
  const warningVisible = checks.displayP3.status === "outside";
  const y =
    field.projection.plane === "oklch"
      ? field.projection.representation.channels[0]
      : field.projection.representation.channels[2];
  const hueReference = useRef<PlaneEditReference | undefined>(undefined);
  const acceptedHue = oklch.channels[2];
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
  // A view transition interrupts temporary preview ownership, never authored state.
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
  function requireOklabProjection() {
    if (field.projection.plane !== "oklab")
      throw new Error("OKLab coordinate edit requires the accepted OKLab field");
    return field.projection;
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
  const shared = { warningVisible: warningVisible, onCancel };
  return (
    <section
      {...dom}
      ref={ref}
      className={["gamut-plane-react", className].filter(Boolean).join(" ")}
      style={presentationStyle({ ...safeStyle, "--picker-active": detail.activeCss })}
      data-plane-instrument=""
      data-gp-root=""
      data-gp-view={view}
      data-active-plane={view}
      aria-labelledby={`${id}-instrument-title`}
    >
      <h2 id={`${id}-instrument-title`} className="gpr-sr-only" data-gp-visually-hidden="">
        Color plane instrument
      </h2>
      <CoordinateViewControl view={view} onViewChange={requestView} />
      <div className="gpr-plane-instrument-workspace" data-gp-part={gpPart.workspace}>
        <div className="gpr-plane-instrument-field" data-gp-part={gpPart.field}>
          <ColorPlane
            value={revision.source}
            semanticContextKey={revision.contextKey}
            field={field}
            guides={guides}
            markerCss={detail.markerCss}
            getEditReference={getHueReference}
            plane={field.plane}
            targetGuidePoint={target.targetGuidePoint}
            targetGuideCss={target.targetGuideCss}
            targetGuideLabel={target.targetGuideLabel}
            warningVisible={warningVisible}
            interactionPreview={view === "oklch" && huePreview}
            onValueChange={onValueChange}
            onValueCommit={onValueCommit}
            onCancel={onCancel}
            onCanvasColorSpaceChange={onCanvasColorSpaceChange}
          />
          {legend}
        </div>
        <div className="gpr-plane-instrument-controls" data-gp-part={gpPart.controls}>
          {detail.view === "oklch" ? (
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
                warningPosition={detail.huePosition}
                normalizeValue={normalizeHue}
                help={detail.hueHelp}
                onInput={(next) =>
                  edit(
                    authorPlaneEdit(revision.source, {
                      plane: "oklch",
                      kind: "channels",
                      channels: { h: normalizeHue(next) },
                    }),
                    false,
                  )
                }
                onComplete={(next) =>
                  edit(
                    authorPlaneEdit(revision.source, {
                      plane: "oklch",
                      kind: "channels",
                      channels: { h: normalizeHue(next) },
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
                warningPosition={oklch.channels[0]}
                onInput={(next) =>
                  edit(
                    authorPlaneEdit(revision.source, {
                      plane: "oklch",
                      kind: "channels",
                      channels: { l: next },
                    }),
                    false,
                  )
                }
                onComplete={(next) =>
                  edit(
                    authorPlaneEdit(revision.source, {
                      plane: "oklch",
                      kind: "channels",
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
                markers={target.markers}
                boundaryPreviewColor={target.targetResult.swatchCss}
                boundaryPreviewTone={boundaryTarget}
                overflowMax={!("max" in chroma.numericBounds)}
                help={detail.chromaHelp}
                warningPosition={detail.chromaPosition}
                onInput={(next) =>
                  edit(
                    authorPlaneEdit(revision.source, {
                      plane: "oklch",
                      kind: "channels",
                      channels: { c: next },
                      ...(getHueReference() && { reference: getHueReference()! }),
                    }),
                    false,
                  )
                }
                onComplete={(next) =>
                  edit(
                    authorPlaneEdit(revision.source, {
                      plane: "oklch",
                      kind: "channels",
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
                help={detail.domainHelp}
                warningPosition={field.samplingFixed}
                onInput={(next) =>
                  edit(
                    authorPlaneEdit(revision.source, {
                      plane: "oklab",
                      kind: "channels",
                      channels: { l: next },
                    }),
                    false,
                  )
                }
                onComplete={(next) =>
                  edit(
                    authorPlaneEdit(revision.source, {
                      plane: "oklab",
                      kind: "channels",
                      channels: { l: next },
                    }),
                    true,
                  )
                }
              />
              <div
                className="gpr-plane-instrument-coordinate-readout"
                data-gp-part={gpPart.coordinateReadout}
                aria-label="Editable OKLab coordinates"
              >
                <span>Editable coordinate</span>
                {[a, b].map((control) => (
                  <label key={`${revision.contextKey}:${control.channelId}:${control.operationId}`}>
                    <span>{control.label}</span>
                    <NumericInput
                      value={
                        control.symbol === "a" ? field.projection.representation.channels[1] : y
                      }
                      precision={control.precision}
                      min={control.numericBounds.min}
                      max={control.numericBounds.max}
                      step={control.step}
                      data-oklab-coordinate={control.symbol}
                      aria-label={control.numericLabel}
                      onComplete={(next) =>
                        edit(
                          authorPlaneEdit(revision.source, {
                            plane: "oklab",
                            kind: "point",
                            point: oklabCoordinatePlanePoint(
                              requireOklabProjection(),
                              control.symbol,
                              next,
                            ),
                          }),
                          true,
                        )
                      }
                      onCancel={onCancel}
                    />
                  </label>
                ))}
                <small>Disc-bounded radius ≤ 0.4000 · no RGB gamut clamp</small>
              </div>
            </>
          )}
          <BoundaryTargetResult model={target.targetResult} />
        </div>
      </div>
    </section>
  );
}
