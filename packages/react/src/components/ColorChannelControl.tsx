import { presentationStyle } from "../model/presentationStyle.js";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  channelSections,
  channelThresholds,
  channelWarning,
  nearestThreshold,
  PICKER_SLIDER_DEFAULT_TRACK_WIDTH,
  PICKER_SLIDER_FIELD_INSET,
  PICKER_SLIDER_TRACK_HEIGHT,
  PICKER_SLIDER_THUMB_TOP,
  PICKER_SLIDER_THUMB_WIDTH,
  PICKER_SLIDER_WARNING_TOP,
  PICKER_WARNING_GLYPH_SIZE,
  type LinearControlInterval,
  type LinearControlMarker,
} from "@gamut-plane/render";
import { useCommitted } from "../hooks/useCommitted.js";
import { mountRange } from "../interaction/rangeInteraction.js";
import { NumericInput } from "./NumericInput.js";
import { GamutWarningGlyph } from "./GamutWarningGlyph.js";

export interface ColorChannelControlProps {
  id: string;
  channel: "H" | "L" | "C";
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  precision: number;
  gradient: string;
  intervals: readonly LinearControlInterval[];
  markers?: readonly LinearControlMarker[];
  overflowMax?: boolean;
  help?: string | undefined;
  warningVisible: boolean;
  warningPosition: number;
  normalizeValue?: (value: number) => number;
  onInput: (value: number) => void;
  onComplete: (value: number) => void;
  onCancel: (() => void) | undefined;
  onInteraction?: ((active: boolean) => void) | undefined;
}

const geometryStyle = {
  "--picker-warning-size": `${PICKER_WARNING_GLYPH_SIZE}px`,
  "--picker-slider-field-inset": `${PICKER_SLIDER_FIELD_INSET}px`,
  "--picker-slider-track-height": `${PICKER_SLIDER_TRACK_HEIGHT}px`,
  "--picker-slider-thumb-top": `${PICKER_SLIDER_THUMB_TOP}px`,
  "--picker-slider-thumb-width": `${PICKER_SLIDER_THUMB_WIDTH}px`,
  "--picker-slider-warning-top": `${PICKER_SLIDER_WARNING_TOP}px`,
};

export function ColorChannelControl(props: ColorChannelControlProps) {
  const {
    id,
    channel,
    label,
    value,
    min,
    max,
    step,
    precision,
    gradient,
    intervals,
    markers = [],
    overflowMax,
    help,
    warningVisible,
    warningPosition,
    onComplete,
    onCancel,
  } = props;
  const current = useCommitted({ ...props, onInteraction: props.onInteraction });
  const range = useRef<HTMLInputElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const binding = useRef<ReturnType<typeof mountRange> | null>(null);
  const [width, setWidth] = useState(PICKER_SLIDER_DEFAULT_TRACK_WIDTH);
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const bounded = Math.min(max, Math.max(min, value));
  const sections = channelSections(intervals);
  const thresholds = channelThresholds(sections);
  const { placement, obstacles } = channelWarning(warningPosition, width, markers, thresholds);
  const position = hover ?? (focused ? (bounded - min) / (max - min) : null);
  const nearest = position === null ? null : nearestThreshold(thresholds, position);
  const context =
    nearest && position !== null && Math.abs(nearest.position - position) * width <= 14
      ? nearest
      : null;
  const helpId = help ? `${id}-help` : undefined;
  const warningId = warningVisible ? `${id}-gamut-warning` : undefined;
  const describedBy = [helpId, warningId].filter(Boolean).join(" ") || undefined;
  const warningStyle: CSSProperties & Record<string, string | number | undefined> = {
    display: warningVisible ? undefined : "none",
    "--picker-slider-warning-position": `${placement.positionPercent.toFixed(4)}%`,
    "--picker-slider-warning-thumb-offset": `${placement.thumbOffset.toFixed(4)}px`,
    "--picker-slider-warning-side-offset": `${placement.sideOffset}px`,
    "--picker-slider-warning-edge": `${placement.edge}px`,
  };
  useLayoutEffect(() => {
    const mounted = mountRange(range.current!, () => current.current!);
    binding.current = mounted;
    const measure = () => {
      const measured = track.current!.getBoundingClientRect().width;
      if (measured > 0)
        setWidth((previous) => (Math.abs(previous - measured) > 0.25 ? measured : previous));
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(track.current!);
    measure();
    return () => {
      binding.current = null;
      mounted.dispose();
      observer?.disconnect();
    };
  }, [current]);
  useLayoutEffect(() => {
    binding.current?.reconcile();
  });
  return (
    <div
      className="gpr-channel-control"
      data-picker-control={channel.toLowerCase()}
      data-instrument-overflow={String(value < min || value > max)}
      data-warning-visible={String(warningVisible)}
      style={presentationStyle(geometryStyle)}
    >
      <header className="gpr-channel-control-header">
        <label htmlFor={id}>
          <span>{channel}</span>
          {label}
        </label>
        {context && (
          <span
            className="gpr-channel-control-threshold-context"
            dir="ltr"
            data-contextual-gamut-label={context.label}
          >
            {context.label}
          </span>
        )}
        <NumericInput
          className="gpr-channel-control-number"
          aria-label={`${label} numeric value`}
          aria-describedby={describedBy}
          value={value}
          min={min}
          max={overflowMax ? undefined : max}
          step={step}
          precision={precision}
          onComplete={onComplete}
          onCancel={onCancel}
        />
      </header>
      <div
        ref={track}
        className="gpr-channel-control-track"
        dir="ltr"
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          setHover(Math.min(1, Math.max(0, (event.clientX - box.left) / (box.width || width))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <span className="gpr-channel-control-field" style={{ backgroundImage: gradient }} />
        <span className="gpr-channel-control-gamut-ranges" aria-hidden="true">
          {sections.map((section, index) => (
            <span
              key={`${section.tone}-${index}`}
              className={`gpr-channel-control-gamut-range gpr-channel-control-gamut-range--${section.tone}`}
              style={{
                left: `${section.start * 100}%`,
                width: `${(section.end - section.start) * 100}%`,
              }}
              data-gamut-range={section.tone}
              data-range-start={section.start}
              data-range-end={section.end}
            />
          ))}
        </span>
        {markers.map((marker) => (
          <span
            key={marker.id}
            className={`gpr-channel-control-tick gpr-channel-control-tick--${marker.tone}`}
            style={presentationStyle({
              left: `${Math.min(1, Math.max(0, marker.position)) * 100}%`,
              "--tick-color": marker.cssColor,
            })}
            title={marker.label}
            aria-label={marker.label}
            role="img"
            data-gamut-marker={marker.id}
          />
        ))}
        <span
          className="gpr-channel-control-warning"
          style={warningStyle}
          data-gamut-warning="linear"
          data-warning-channel={channel.toLowerCase()}
          data-warning-position={Math.min(1, Math.max(0, warningPosition))}
          data-warning-side={placement.side}
          data-warning-obstacle-count={obstacles.length}
          data-visible={String(warningVisible)}
          aria-hidden="true"
        >
          <GamutWarningGlyph />
        </span>
        <input
          ref={range}
          id={id}
          className="gpr-channel-control-range"
          dir="ltr"
          type="range"
          aria-label={`${label} ${value.toFixed(precision)}`}
          aria-describedby={describedBy}
          defaultValue={bounded}
          min={min}
          max={max}
          step={step}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </div>
      {help && (
        <p id={helpId} className="gpr-channel-control-help">
          {help}
        </p>
      )}
      {warningId && (
        <span id={warningId} className="gpr-sr-only">
          Outside Display P3
        </span>
      )}
    </div>
  );
}
