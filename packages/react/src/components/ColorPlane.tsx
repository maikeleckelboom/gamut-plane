import { presentationStyle } from "../model/presentationStyle.js";

import { useLayoutEffect, useRef, useState } from "react";
import type { GeneralizedGuideDisplay } from "@gamut-plane/render/internal/current";
import { currentEditorCopy, gpAttribute, gpAxis, gpGamut, gpMarker, gpPart } from "@gamut-plane/ui";
import {
  pointStyle,
  VIEWBOX_SIZE,
  PICKER_ACTIVE_MARKER_RADIUS,
  type CanvasColorSpaceStatus,
  type RenderedFieldQuality,
} from "@gamut-plane/render";
import { mountPlane, type PlaneBinding, type PlaneInput } from "../interaction/planeInteraction.js";
import { useCommitted } from "../hooks/useCommitted.js";

interface ColorPlaneProps extends PlaneInput {
  guides: GeneralizedGuideDisplay;
  onCanvasColorSpaceChange: ((status: CanvasColorSpaceStatus) => void) | undefined;
}

export function ColorPlane(props: ColorPlaneProps) {
  const { plane, field, guides, markerCss } = props;
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const binding = useRef<PlaneBinding | null>(null);
  const current = useCommitted(props);
  const [capability, setCapability] = useState<CanvasColorSpaceStatus>("pending");
  const notified = useRef<CanvasColorSpaceStatus>("pending");
  const [quality, setQuality] = useState<RenderedFieldQuality>("full");
  const projection = field.projection;
  const x = projection.coordinates.x;
  const y = projection.coordinates.y;
  const activePoint = field.geometry.constrain(projection.point);
  useLayoutEffect(() => {
    const mounted = mountPlane(
      surface.current!,
      canvas.current!,
      marker.current!,
      () => current.current!,
      (status) => {
        setCapability(status);
        if (notified.current !== status) {
          notified.current = status;
          current.current!.onCanvasColorSpaceChange?.(status);
        }
      },
      setQuality,
    );
    binding.current = mounted;
    return () => {
      binding.current = null;
      mounted.dispose();
    };
  }, [current]);
  useLayoutEffect(() => {
    binding.current?.reconcile();
  });
  const label = `${plane.label} plane. Horizontal ${plane.xAxis.label} ${x?.toFixed(3) ?? "missing"}. Vertical ${plane.yAxis.label} ${y?.toFixed(3) ?? "missing"}. Arrow keys adjust the selected point.${field.geometry.fixed === "oklch.h" && projection.coordinates.fixed === null ? ` ${currentEditorCopy.chromaMissingHue}` : ""}`;
  const geometryStyle = {
    "--picker-active-marker-size": `${PICKER_ACTIVE_MARKER_RADIUS * 2}px`,
  };
  return (
    <div
      className="gpr-color-plane"
      data-gp-part={gpPart.plane}
      data-picker-plane=""
      data-plane-id={plane.id}
      data-geometry-id={field.geometry.id}
      data-field-quality={quality}
      data-field-resolution={
        plane.fieldSampling.kind === "disc-gradient"
          ? `${plane.fieldSampling.rowCount}x${plane.fieldSampling.columnSamples}`
          : undefined
      }
      style={presentationStyle(geometryStyle)}
    >
      <div
        ref={surface}
        className="gpr-color-plane-surface"
        data-gp-part={gpPart.surface}
        role="application"
        tabIndex={0}
        onBlur={(event) => {
          event.currentTarget.removeAttribute("data-pointer-focus");
          event.currentTarget.removeAttribute(gpAttribute.pointerFocus);
        }}
        dir="ltr"
        aria-label={label}
        data-render-color-space={capability}
        data-outside-instrument={String(!field.markerInDomain)}
      >
        <canvas ref={canvas} data-gp-part={gpPart.canvas} aria-hidden="true" />
        {field.geometry.domain.kind === "disc" && (
          <span
            className="gpr-color-plane-domain-boundary"
            data-gp-part={gpPart.domainBoundary}
            data-instrument-domain="disc"
            aria-hidden="true"
          />
        )}
        <svg
          className="gpr-color-plane-gamut"
          data-gp-part={gpPart.gamutGuides}
          viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
          preserveAspectRatio="none"
          role="group"
          aria-label="Gamut and instrument boundary guides"
        >
          {guides.displayP3Path !== null && (
            <>
              <path
                d={guides.displayP3Path}
                className="gpr-color-plane-boundary gpr-color-plane-boundary--p3"
                data-gp-part={gpPart.gamutBoundary}
                data-gp-gamut={gpGamut.displayP3}
                data-gamut-boundary="display-p3"
                vectorEffect="non-scaling-stroke"
                aria-hidden="true"
              />
              <path
                d={guides.displayP3Path}
                className="gpr-color-plane-boundary-hit"
                data-gp-part={gpPart.boundaryHit}
                data-gp-gamut={gpGamut.displayP3}
                data-gamut-boundary-hit="display-p3"
                vectorEffect="non-scaling-stroke"
                aria-label="Display P3 gamut boundary"
                role="img"
              />
            </>
          )}
          {guides.srgbPath !== null && (
            <>
              <path
                d={guides.srgbPath}
                className="gpr-color-plane-boundary gpr-color-plane-boundary--srgb"
                data-gp-part={gpPart.gamutBoundary}
                data-gp-gamut={gpGamut.srgb}
                data-gamut-boundary="srgb"
                vectorEffect="non-scaling-stroke"
                aria-hidden="true"
              />
              <path
                d={guides.srgbPath}
                className="gpr-color-plane-boundary-hit"
                data-gp-part={gpPart.boundaryHit}
                data-gp-gamut={gpGamut.srgb}
                data-gamut-boundary-hit="srgb"
                vectorEffect="non-scaling-stroke"
                aria-label="sRGB gamut boundary"
                role="img"
              />
            </>
          )}
          {field.geometry.domain.kind === "disc" && (
            <circle
              className="gpr-color-plane-boundary-hit"
              data-gp-part={gpPart.boundaryHit}
              data-gamut-boundary-hit="instrument-domain"
              cx="500"
              cy="500"
              r="499"
              vectorEffect="non-scaling-stroke"
              aria-label="OKLab editable domain, not a gamut boundary"
              role="img"
            />
          )}
        </svg>
        <span
          ref={marker}
          className="gpr-color-plane-marker gpr-color-plane-marker--active"
          data-gp-part={gpPart.marker}
          data-gp-marker={gpMarker.active}
          style={presentationStyle({
            ...pointStyle(activePoint),
            "--marker-color": markerCss,
          })}
          data-active-marker=""
          data-marker-role="active-color"
          title="Selected color"
          aria-label="Selected color"
          role="img"
        />
      </div>
      {(capability === "srgb" || capability === "unavailable") && (
        <span className="gpr-color-plane-render-mode" data-gp-part={gpPart.renderStatus}>
          {capability === "srgb" ? "sRGB canvas" : "canvas unavailable"}
        </span>
      )}
      <span
        className="gpr-color-plane-axis gpr-color-plane-axis--lightness"
        data-gp-part={gpPart.axis}
        data-gp-axis={gpAxis.y}
      >
        {plane.yAxis.symbol} · {plane.yAxis.label}
      </span>
      <span
        className="gpr-color-plane-axis gpr-color-plane-axis--chroma"
        data-gp-part={gpPart.axis}
        data-gp-axis={gpAxis.x}
      >
        {plane.xAxis.symbol} · {plane.xAxis.label}
      </span>
    </div>
  );
}
