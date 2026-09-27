import { presentationStyle } from "../model/presentationStyle.js";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { projectColorToPlane } from "@gamut-plane/core";
import { gpAttribute, gpAxis, gpGamut, gpMarker, gpPart } from "@gamut-plane/ui";
import {
  geometryToSvgPath,
  pointStyle,
  guideConnectorStyle,
  PICKER_GAMUT_TABLES,
  VIEWBOX_SIZE,
  PICKER_WARNING_GLYPH_SIZE,
  PICKER_ACTIVE_MARKER_RADIUS,
  PICKER_TARGET_GUIDE_MARKER_RADIUS,
  type CanvasColorSpaceStatus,
  type RenderedFieldQuality,
} from "@gamut-plane/render";
import { mountPlane, type PlaneBinding, type PlaneInput } from "../interaction/planeInteraction.js";
import { useCommitted } from "../hooks/useCommitted.js";
import { GamutWarningGlyph } from "./GamutWarningGlyph.js";

interface ColorPlaneProps extends PlaneInput {
  targetGuideLabel: string;
  warningVisible: boolean;
  showSrgbBoundary: boolean;
  showDisplayP3Boundary: boolean;
  onCanvasColorSpaceChange: ((status: CanvasColorSpaceStatus) => void) | undefined;
}

export function ColorPlane(props: ColorPlaneProps) {
  const {
    plane,
    value,
    fieldHue,
    markerCss,
    targetGuidePoint,
    targetGuideCss,
    targetGuideLabel,
    warningVisible,
    showSrgbBoundary,
    showDisplayP3Boundary,
  } = props;
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const warning = useRef<HTMLSpanElement>(null);
  const binding = useRef<PlaneBinding | null>(null);
  const current = useCommitted(props);
  const [capability, setCapability] = useState<CanvasColorSpaceStatus>("pending");
  const notified = useRef<CanvasColorSpaceStatus>("pending");
  const [quality, setQuality] = useState<RenderedFieldQuality>("full");
  const projected = projectColorToPlane(value, plane.id);
  if (!projected.ok) throw new RangeError("Selected color cannot be projected into the plane");
  const projection = projected.value;
  const fixed = projection.plane === "oklch" ? fieldHue : projection.representation.channels[0];
  const x = projection.representation.channels[1];
  const y =
    projection.plane === "oklch"
      ? projection.representation.channels[0]
      : projection.representation.channels[2];
  const activePoint = plane.constrainPoint(projected.value.point);
  const guide = targetGuidePoint;
  // Plane markers must occlude guides even when the authored color has transparency.
  const paths = useMemo(
    () => ({
      srgb: showSrgbBoundary
        ? geometryToSvgPath(
            plane.buildGamutContour(PICKER_GAMUT_TABLES.srgb, fixed),
            plane.gamutContourClosed,
          )
        : "",
      p3: showDisplayP3Boundary
        ? geometryToSvgPath(
            plane.buildGamutContour(PICKER_GAMUT_TABLES.displayP3, fixed),
            plane.gamutContourClosed,
          )
        : "",
    }),
    [plane, fixed, showDisplayP3Boundary, showSrgbBoundary],
  );
  useLayoutEffect(() => {
    const mounted = mountPlane(
      surface.current!,
      canvas.current!,
      marker.current!,
      warning.current!,
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
  const label = `${plane.label} plane. Horizontal ${plane.xAxis.label} ${x.toFixed(3)}. Vertical ${plane.yAxis.label} ${y.toFixed(3)}. Arrow keys adjust the selected point.${projection.plane === "oklch" && projection.representation.channels[2] === null ? " Set Hue before increasing chroma." : ""}${warningVisible ? " Outside Display P3" : ""}`;
  const geometryStyle = {
    "--picker-warning-size": `${PICKER_WARNING_GLYPH_SIZE}px`,
    "--picker-active-marker-size": `${PICKER_ACTIVE_MARKER_RADIUS * 2}px`,
    "--picker-target-guide-marker-size": `${PICKER_TARGET_GUIDE_MARKER_RADIUS * 2}px`,
  };
  return (
    <div
      className="gpr-color-plane"
      data-gp-part={gpPart.plane}
      data-picker-plane=""
      data-plane-id={plane.id}
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
        data-outside-instrument={String(!plane.isPointInInstrumentDomain(projected.value.point))}
      >
        <canvas ref={canvas} data-gp-part={gpPart.canvas} aria-hidden="true" />
        {plane.id === "oklab" && (
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
          {showDisplayP3Boundary && (
            <>
              <path
                d={paths.p3}
                className="gpr-color-plane-boundary gpr-color-plane-boundary--p3"
                data-gp-part={gpPart.gamutBoundary}
                data-gp-gamut={gpGamut.displayP3}
                data-gamut-boundary="display-p3"
                vectorEffect="non-scaling-stroke"
                aria-hidden="true"
              />
              <path
                d={paths.p3}
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
          {showSrgbBoundary && (
            <>
              <path
                d={paths.srgb}
                className="gpr-color-plane-boundary gpr-color-plane-boundary--srgb"
                data-gp-part={gpPart.gamutBoundary}
                data-gp-gamut={gpGamut.srgb}
                data-gamut-boundary="srgb"
                vectorEffect="non-scaling-stroke"
                aria-hidden="true"
              />
              <path
                d={paths.srgb}
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
          {plane.id === "oklab" && (
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
        {guide && (
          <>
            <span
              className="gpr-color-plane-target-guide-connector"
              data-gp-part={gpPart.guideConnector}
              style={guideConnectorStyle(activePoint, guide, plane.id === "oklab")}
              data-table-boundary-guide-connector=""
              aria-hidden="true"
            />
            <span
              className="gpr-color-plane-marker gpr-color-plane-marker--target-guide"
              data-gp-part={gpPart.marker}
              data-gp-marker={gpMarker.targetGuide}
              style={presentationStyle({
                ...pointStyle(guide),
                "--target-guide-marker-color": targetGuideCss,
              })}
              data-table-boundary-guide-marker=""
              data-marker-role="target-guide"
              title={targetGuideLabel}
              aria-label={targetGuideLabel}
              role="img"
            />
          </>
        )}
        <span
          ref={warning}
          className="gpr-color-plane-warning"
          data-gp-part={gpPart.warning}
          data-gp-warning={String(warningVisible)}
          data-gamut-warning="planar"
          data-visible={String(warningVisible)}
          style={{ display: warningVisible ? undefined : "none", visibility: "hidden" }}
          aria-hidden="true"
        >
          <GamutWarningGlyph />
        </span>
        <span
          ref={marker}
          className="gpr-color-plane-marker gpr-color-plane-marker--active"
          data-gp-part={gpPart.marker}
          data-gp-marker={gpMarker.active}
          style={presentationStyle({
            ...pointStyle(activePoint),
            "--marker-color": markerCss,
          })}
          data-outside-display-p3={String(warningVisible)}
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
