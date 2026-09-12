"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  OKLCH_LIGHTNESS_CHROMA_PLANE as plane,
  serializeColor,
  type OklchColor,
} from "@gamut-plane/core";
import {
  geometryToSvgPath,
  pointStyle,
  PICKER_GAMUT_TABLES,
  VIEWBOX_SIZE,
  type CanvasColorSpaceStatus,
} from "@gamut-plane/rendering";
import { mountPlane, type PlaneBinding } from "./planeInteraction.js";

export interface GamutPlaneProps {
  value: OklchColor;
  onChange: (value: OklchColor) => void;
  onCommit?: (value: OklchColor) => void;
  onCancel?: () => void;
  onCapability?: (status: CanvasColorSpaceStatus) => void;
}

export function GamutPlane(props: GamutPlaneProps) {
  const { value } = props;
  const id = useId();
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const committed = useRef<GamutPlaneProps | null>(null);
  const binding = useRef<PlaneBinding | null>(null);
  const [capability, setCapability] = useState<CanvasColorSpaceStatus>("pending");
  const projection = plane.project(value);
  const paths = useMemo(
    () => ({
      srgb: geometryToSvgPath(
        plane.buildGamutContour(PICKER_GAMUT_TABLES.srgb, projection.fixed),
        false,
      ),
      p3: geometryToSvgPath(
        plane.buildGamutContour(PICKER_GAMUT_TABLES.displayP3, projection.fixed),
        false,
      ),
    }),
    [projection.fixed],
  );

  // Publish only committed props to event handlers, never an abandoned concurrent render.
  useLayoutEffect(() => {
    committed.current = props;
    binding.current?.reconcile(value);
  });
  useLayoutEffect(() => {
    if (!surface.current || !canvas.current || !marker.current) return;
    const mounted = mountPlane(
      surface.current,
      canvas.current,
      marker.current,
      () => committed.current!,
      (status) => {
        setCapability(status);
        committed.current?.onCapability?.(status);
      },
    );
    binding.current = mounted;
    return () => {
      binding.current = null;
      mounted.dispose();
    };
  }, []);
  useLayoutEffect(() => {
    binding.current?.redraw();
  }, [projection.fixed]);

  return (
    <section className="gamut-plane-react" data-plane-instrument aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>OKLCH plane</h2>
      <p id={`${id}-help`}>
        Arrow keys adjust chroma and lightness. Shift makes larger steps. Escape cancels a drag.
      </p>
      <div
        ref={surface}
        className="gamut-plane-surface"
        role="application"
        tabIndex={0}
        aria-label={`OKLCH plane. Horizontal chroma ${projection.x.toFixed(3)}. Vertical lightness ${projection.y.toFixed(3)}.`}
        aria-describedby={`${id}-help ${id}-value`}
        data-render-color-space={capability}
      >
        <canvas ref={canvas} aria-hidden="true" />
        <svg
          className="gamut-plane-guides"
          viewBox={`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`}
          preserveAspectRatio="none"
          role="group"
          aria-label="Gamut boundary guides"
        >
          <path
            d={paths.p3}
            className="gamut-plane-p3"
            data-gamut-boundary="display-p3"
            vectorEffect="non-scaling-stroke"
            role="img"
            aria-label="Display P3 gamut boundary"
          />
          <path
            d={paths.srgb}
            className="gamut-plane-srgb"
            data-gamut-boundary="srgb"
            vectorEffect="non-scaling-stroke"
            role="img"
            aria-label="sRGB gamut boundary"
          />
        </svg>
        <span
          ref={marker}
          className="gamut-plane-marker"
          data-active-marker
          role="img"
          aria-label="Selected color"
          style={{
            ...pointStyle(plane.positionActivePoint(value)),
            background: serializeColor(value),
          }}
        />
      </div>
      <output id={`${id}-value`} className="gamut-plane-value">
        L {value.l} · C {value.c} · H {value.h}° · α {value.alpha}
      </output>
      <span className="gamut-plane-capability">
        {capability === "pending"
          ? "Canvas pending"
          : capability === "unavailable"
            ? "Canvas unavailable"
            : capability === "display-p3"
              ? "P3 canvas"
              : "sRGB canvas"}
      </span>
    </section>
  );
}
