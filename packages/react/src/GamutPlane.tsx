"use client";

import { presentationStyle } from "./model/presentationStyle.js";

import {
  useId,
  useLayoutEffect,
  useState,
  type ComponentPropsWithRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  OKLAB_AB_PLANE,
  OKLCH_PICKER_MAX_CHROMA,
  normalizeHue,
  type DisplayGamut,
  type OklchColor,
} from "@gamut-plane/core";
import type { CanvasColorSpaceStatus } from "@gamut-plane/render";
import { useControllableView } from "./hooks/useControllableView.js";
import {
  instrumentModel,
  hueGradient,
  editChannel,
  editCoordinate,
} from "./model/instrumentModel.js";
import { CoordinateViewControl } from "./components/CoordinateViewControl.js";
import { ColorPlane } from "./components/ColorPlane.js";
import { ColorChannelControl } from "./components/ColorChannelControl.js";
import { NumericInput } from "./components/NumericInput.js";
import { BoundaryDetails } from "./components/BoundaryDetails.js";
import { BoundaryTargetResult } from "./components/BoundaryTargetResult.js";

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
  value: OklchColor;
  onValueChange: (value: OklchColor) => void;
  view?: GamutPlaneView | undefined;
  defaultView?: GamutPlaneView | undefined;
  onViewChange?: ((view: GamutPlaneView) => void) | undefined;
  boundaryTarget?: DisplayGamut | undefined;
  showSrgbBoundary?: boolean | undefined;
  showDisplayP3Boundary?: boolean | undefined;
  onValueCommit?: ((value: OklchColor) => void) | undefined;
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
  const model = instrumentModel(value, view, boundaryTarget, {
    srgb: showSrgbBoundary,
    displayP3: showDisplayP3Boundary,
  });
  const [huePreview, setHuePreview] = useState(false);
  // A view transition interrupts temporary preview ownership, never authored state.
  useLayoutEffect(() => {
    setHuePreview(false);
  }, [view]);
  function edit(next: OklchColor, complete: boolean) {
    onValueChange(next);
    if (complete) onValueCommit?.(next);
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
      style={presentationStyle({ ...safeStyle, ...model.style })}
      data-plane-instrument=""
      data-active-plane={view}
      aria-labelledby={`${id}-instrument-title`}
    >
      <h2 id={`${id}-instrument-title`} className="gpr-sr-only">
        Color plane instrument
      </h2>
      <CoordinateViewControl view={view} onViewChange={requestView} />
      <div className="gpr-plane-instrument-workspace">
        <div className="gpr-plane-instrument-field">
          <ColorPlane
            value={value}
            plane={model.plane}
            projectionColor={model.projectionColor}
            projectionLabel={model.projectionLabel}
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
        <div className="gpr-plane-instrument-controls">
          <p className="gpr-plane-instrument-control-help">
            {view === "oklab"
              ? "Lightness fixes this plane. The disc is an instrument limit, not a gamut boundary."
              : "Hue fixes this plane. The guides show sampled gamut limits; your color can cross them."}
          </p>
          {view === "oklch" ? (
            <>
              <ColorChannelControl
                key="hue"
                {...shared}
                id={`${id}-hue`}
                channel="H"
                label="Hue"
                value={value.h}
                min={0}
                max={360}
                step={0.1}
                precision={1}
                gradient={hueGradient}
                intervals={model.hueIntervals}
                warningPosition={model.huePosition}
                normalizeValue={normalizeHue}
                onInput={(next) => edit(editChannel(value, "h", next), false)}
                onComplete={(next) => edit(editChannel(value, "h", next), true)}
                onInteraction={setHuePreview}
              />
              <ColorChannelControl
                key="lightness"
                {...shared}
                id={`${id}-lightness`}
                channel="L"
                label="Lightness"
                value={value.l}
                min={0}
                max={1}
                step={0.001}
                precision={4}
                gradient={model.lightnessGradient}
                intervals={model.lightnessIntervals}
                warningPosition={value.l}
                onInput={(next) => edit(editChannel(value, "l", next), false)}
                onComplete={(next) => edit(editChannel(value, "l", next), true)}
              />
              <ColorChannelControl
                key="chroma"
                {...shared}
                id={`${id}-chroma`}
                channel="C"
                label="Chroma"
                value={value.c}
                min={0}
                max={OKLCH_PICKER_MAX_CHROMA}
                step={0.001}
                precision={4}
                gradient={model.chromaGradient}
                intervals={model.chromaIntervals}
                markers={model.markers}
                overflowMax
                help={model.chromaHelp}
                warningPosition={model.chromaPosition}
                onInput={(next) => edit(editChannel(value, "c", next), false)}
                onComplete={(next) => edit(editChannel(value, "c", next), true)}
              />
            </>
          ) : (
            <>
              <ColorChannelControl
                key="oklab-lightness"
                {...shared}
                id={`${id}-oklab-lightness`}
                channel="L"
                label="OKLab lightness · fixed axis"
                value={model.projection.fixed}
                min={0}
                max={1}
                step={0.001}
                precision={4}
                gradient={model.fixedLightnessGradient}
                intervals={model.lightnessIntervals}
                help={model.domainHelp}
                warningPosition={model.projection.fixed}
                onInput={(next) => edit(OKLAB_AB_PLANE.editFixedAxis(value, next), false)}
                onComplete={(next) => edit(OKLAB_AB_PLANE.editFixedAxis(value, next), true)}
              />
              <div
                className="gpr-plane-instrument-coordinate-readout"
                aria-label="Editable OKLab coordinates"
              >
                <span>Editable coordinate</span>
                {(["a", "b"] as const).map((coordinate) => (
                  <label key={coordinate}>
                    <span>{coordinate}</span>
                    <NumericInput
                      value={coordinate === "a" ? model.projection.x : model.projection.y}
                      precision={4}
                      min={coordinate === "a" ? model.plane.xAxis.min : model.plane.yAxis.min}
                      max={coordinate === "a" ? model.plane.xAxis.max : model.plane.yAxis.max}
                      step={0.001}
                      data-oklab-coordinate={coordinate}
                      aria-label={`OKLab ${coordinate} numeric value`}
                      onComplete={(next) => edit(editCoordinate(value, coordinate, next), true)}
                      onCancel={onCancel}
                    />
                  </label>
                ))}
                <small>Disc-bounded radius ≤ 0.4000 · no RGB gamut clamp</small>
              </div>
            </>
          )}
          <BoundaryTargetResult model={model.targetResult} />
          <BoundaryDetails model={model.details} />
        </div>
      </div>
    </section>
  );
}
