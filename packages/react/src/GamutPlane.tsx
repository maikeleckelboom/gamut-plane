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
import { createPickerPresentation, type CanvasColorSpaceStatus } from "@gamut-plane/render";
import { gpPart, editorUi } from "@gamut-plane/ui";
import { useControllableView } from "./hooks/useControllableView.js";
import { CoordinateViewControl } from "./components/CoordinateViewControl.js";
import { ColorPlane } from "./components/ColorPlane.js";
import { ColorChannelControl } from "./components/ColorChannelControl.js";
import { NumericInput } from "./components/NumericInput.js";
import { BoundaryTargetResult } from "./components/BoundaryTargetResult.js";

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
  const [view, requestView] = useControllableView(controlledView, defaultView, onViewChange);
  const id = useId();
  const model = createPickerPresentation(value, view, boundaryTarget, {
    srgb: showSrgbBoundary,
    displayP3: showDisplayP3Boundary,
  });
  const hueReference = useRef<PlaneEditReference | undefined>(undefined);
  useLayoutEffect(() => {
    const observed = represent(value, "oklch");
    if (!observed.ok) throw new RangeError("Selected hue cannot be observed");
    const hue = observed.value.channels[2];
    if (hue !== null) hueReference.current = { hue };
    else hueReference.current = undefined;
  }, [value]);
  const [huePreview, setHuePreview] = useState(false);
  // A view transition interrupts temporary preview ownership, never authored state.
  useLayoutEffect(() => {
    setHuePreview(false);
  }, [view]);
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
  const shared = { warningVisible: model.warningVisible, onCancel };
  return (
    <section
      {...dom}
      ref={ref}
      className={["gamut-plane-react", className].filter(Boolean).join(" ")}
      style={presentationStyle({ ...safeStyle, "--picker-active": model.activeCss })}
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
            value={value}
            fieldHue={model.fieldHue}
            markerCss={model.markerCss}
            getEditReference={() => hueReference.current}
            plane={model.plane}
            targetGuidePoint={model.targetGuidePoint}
            targetGuideCss={model.targetGuideCss}
            targetGuideLabel={model.targetGuideLabel}
            warningVisible={model.warningVisible}
            interactionPreview={view === "oklch" && huePreview}
            showSrgbBoundary={showSrgbBoundary}
            showDisplayP3Boundary={showDisplayP3Boundary}
            onValueChange={onValueChange}
            onValueCommit={onValueCommit}
            onCancel={onCancel}
            onCanvasColorSpaceChange={onCanvasColorSpaceChange}
          />
          {legend}
        </div>
        <div className="gpr-plane-instrument-controls" data-gp-part={gpPart.controls}>
          {view === "oklch" ? (
            <>
              <ColorChannelControl
                key={`${hue.channelId}:${hue.operationId}`}
                {...shared}
                id={`${id}-hue`}
                channel={hue.symbol}
                label={hue.label}
                value={model.fieldHue}
                min={hue.sliderRange.min}
                max={hue.sliderRange.max}
                step={hue.step}
                precision={hue.precision}
                gradient={model.hueGradient}
                intervals={model.hueIntervals}
                warningPosition={model.huePosition}
                normalizeValue={normalizeHue}
                help={model.hueHelp}
                onInput={(next) =>
                  edit(
                    authorPlaneEdit(value, {
                      plane: "oklch",
                      kind: "channels",
                      channels: { h: normalizeHue(next) },
                    }),
                    false,
                  )
                }
                onComplete={(next) =>
                  edit(
                    authorPlaneEdit(value, {
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
                key={`${lightness.channelId}:${lightness.operationId}`}
                {...shared}
                id={`${id}-lightness`}
                channel={lightness.symbol}
                label={lightness.label}
                value={model.oklch.channels[0]}
                min={lightness.sliderRange.min}
                max={lightness.sliderRange.max}
                step={lightness.step}
                precision={lightness.precision}
                gradient={model.lightnessGradient}
                intervals={model.lightnessIntervals}
                warningPosition={model.oklch.channels[0]}
                onInput={(next) =>
                  edit(
                    authorPlaneEdit(value, {
                      plane: "oklch",
                      kind: "channels",
                      channels: { l: next },
                    }),
                    false,
                  )
                }
                onComplete={(next) =>
                  edit(
                    authorPlaneEdit(value, {
                      plane: "oklch",
                      kind: "channels",
                      channels: { l: next },
                    }),
                    true,
                  )
                }
              />
              <ColorChannelControl
                key={`${chroma.channelId}:${chroma.operationId}`}
                {...shared}
                id={`${id}-chroma`}
                channel={chroma.symbol}
                label={chroma.label}
                value={model.oklch.channels[1]}
                min={chroma.sliderRange.min}
                max={chroma.sliderRange.max}
                step={chroma.step}
                precision={chroma.precision}
                gradient={model.chromaGradient}
                intervals={model.chromaIntervals}
                markers={model.markers}
                boundaryPreviewColor={model.targetResult.swatchCss}
                boundaryPreviewTone={boundaryTarget}
                overflowMax={!("max" in chroma.numericBounds)}
                help={model.chromaHelp}
                warningPosition={model.chromaPosition}
                onInput={(next) =>
                  edit(
                    authorPlaneEdit(value, {
                      plane: "oklch",
                      kind: "channels",
                      channels: { c: next },
                      ...(hueReference.current && { reference: hueReference.current }),
                    }),
                    false,
                  )
                }
                onComplete={(next) =>
                  edit(
                    authorPlaneEdit(value, {
                      plane: "oklch",
                      kind: "channels",
                      channels: { c: next },
                      ...(hueReference.current && { reference: hueReference.current }),
                    }),
                    true,
                  )
                }
              />
            </>
          ) : (
            <>
              <ColorChannelControl
                key={`${fixedLightness.channelId}:${fixedLightness.operationId}`}
                {...shared}
                id={`${id}-oklab-lightness`}
                channel={fixedLightness.symbol}
                label={fixedLightness.label}
                value={model.projection.fixed}
                min={fixedLightness.sliderRange.min}
                max={fixedLightness.sliderRange.max}
                step={fixedLightness.step}
                precision={fixedLightness.precision}
                gradient={model.fixedLightnessGradient}
                intervals={model.lightnessIntervals}
                help={model.domainHelp}
                warningPosition={model.projection.fixed}
                onInput={(next) =>
                  edit(
                    authorPlaneEdit(value, {
                      plane: "oklab",
                      kind: "channels",
                      channels: { l: next },
                    }),
                    false,
                  )
                }
                onComplete={(next) =>
                  edit(
                    authorPlaneEdit(value, {
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
                  <label key={`${control.channelId}:${control.operationId}`}>
                    <span>{control.label}</span>
                    <NumericInput
                      value={control.symbol === "a" ? model.projection.x : model.projection.y}
                      precision={control.precision}
                      min={control.numericBounds.min}
                      max={control.numericBounds.max}
                      step={control.step}
                      data-oklab-coordinate={control.symbol}
                      aria-label={control.numericLabel}
                      onComplete={(next) =>
                        edit(
                          authorPlaneEdit(value, {
                            plane: "oklab",
                            kind: "point",
                            point: oklabCoordinatePlanePoint(model.oklab, control.symbol, next),
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
          <BoundaryTargetResult model={model.targetResult} />
        </div>
      </div>
    </section>
  );
}
