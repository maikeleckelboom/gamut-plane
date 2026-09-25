import { presentationStyle } from "../model/presentationStyle.js";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { serializeColor } from "@gamut-plane/core";
import {
  geometryToSvgPath,
  pointStyle,
  projectionConnectorStyle,
  PICKER_GAMUT_TABLES,
  VIEWBOX_SIZE,
  PICKER_WARNING_GLYPH_SIZE,
  PICKER_ACTIVE_MARKER_RADIUS,
  PICKER_PROJECTION_MARKER_RADIUS,
  type CanvasColorSpaceStatus,
  type RenderedFieldQuality,
} from "@gamut-plane/render";
import { mountPlane, type PlaneBinding, type PlaneInput } from "../interaction/planeInteraction.js";
import { useCommitted } from "../hooks/useCommitted.js";
import { GamutWarningGlyph } from "./GamutWarningGlyph.js";

interface ColorPlaneProps extends PlaneInput {
  projectionLabel: string;
  warningVisible: boolean;
  showSrgbBoundary: boolean;
  showDisplayP3Boundary: boolean;
  onCanvasColorSpaceChange: ((status: CanvasColorSpaceStatus) => void) | undefined;
}

export function ColorPlane(props: ColorPlaneProps) {
  const {
    plane,
    value,
    projectionColor,
    projectionLabel,
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
  const projection = plane.project(value);
  const activePoint = plane.positionActivePoint(value);
  const guide = projectionColor ? plane.positionActivePoint(projectionColor) : null;
  // Plane markers must occlude guides even when the authored color has transparency.
  const paths = useMemo(
    () => ({
      srgb: showSrgbBoundary
        ? geometryToSvgPath(
            plane.buildGamutContour(PICKER_GAMUT_TABLES.srgb, projection.fixed),
            plane.gamutContourClosed,
          )
        : "",
      p3: showDisplayP3Boundary
        ? geometryToSvgPath(
            plane.buildGamutContour(PICKER_GAMUT_TABLES.displayP3, projection.fixed),
            plane.gamutContourClosed,
          )
        : "",
    }),
    [plane, projection.fixed, showDisplayP3Boundary, showSrgbBoundary],
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
  const label = `${plane.label} plane. Horizontal ${plane.xAxis.label} ${projection.x.toFixed(3)}. Vertical ${plane.yAxis.label} ${projection.y.toFixed(3)}. Arrow keys adjust the selected point.${warningVisible ? " Outside Display P3" : ""}`;
  const geometryStyle = {
    "--picker-warning-size": `${PICKER_WARNING_GLYPH_SIZE}px`,
    "--picker-active-marker-size": `${PICKER_ACTIVE_MARKER_RADIUS * 2}px`,
    "--picker-projection-marker-size": `${PICKER_PROJECTION_MARKER_RADIUS * 2}px`,
  };
  return (
    <div
      className="gpr-color-plane"
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
        role="application"
        tabIndex={0}
        onBlur={(event) => event.currentTarget.removeAttribute("data-pointer-focus")}
        dir="ltr"
        aria-label={label}
        data-render-color-space={capability}
        data-outside-instrument={String(!plane.isPointInInstrumentDomain(projection.point))}
      >
        <canvas ref={canvas} aria-hidden="true" />
        {plane.id === "oklab" && (
          <span
            className="gpr-color-plane-domain-boundary"
            data-instrument-domain="disc"
            aria-hidden="true"
          />
        )}
        <svg
          className="gpr-color-plane-gamut"
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
                data-gamut-boundary="display-p3"
                vectorEffect="non-scaling-stroke"
                aria-hidden="true"
              />
              <path
                d={paths.p3}
                className="gpr-color-plane-boundary-hit"
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
                data-gamut-boundary="srgb"
                vectorEffect="non-scaling-stroke"
                aria-hidden="true"
              />
              <path
                d={paths.srgb}
                className="gpr-color-plane-boundary-hit"
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
              className="gpr-color-plane-projection-connector"
              style={projectionConnectorStyle(activePoint, guide, plane.id === "oklab")}
              data-table-boundary-guide-connector=""
              aria-hidden="true"
            />
            <span
              className="gpr-color-plane-marker gpr-color-plane-marker--projection"
              style={presentationStyle({
                ...pointStyle(guide),
                "--projection-marker-color": serializeColor({ ...projectionColor!, alpha: 1 }),
              })}
              data-table-boundary-guide-marker=""
              data-marker-role="target-boundary-projection"
              title={projectionLabel}
              aria-label={projectionLabel}
              role="img"
            />
          </>
        )}
        <span
          ref={warning}
          className="gpr-color-plane-warning"
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
          style={presentationStyle({
            ...pointStyle(activePoint),
            "--marker-color": serializeColor({ ...value, alpha: 1 }),
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
        <span className="gpr-color-plane-render-mode">
          {capability === "srgb" ? "sRGB canvas" : "canvas unavailable"}
        </span>
      )}
      <span className="gpr-color-plane-axis gpr-color-plane-axis--lightness">
        {plane.yAxis.symbol} · {plane.yAxis.label}
      </span>
      <span className="gpr-color-plane-axis gpr-color-plane-axis--chroma">
        {plane.xAxis.symbol} · {plane.xAxis.label}
      </span>
    </div>
  );
}
