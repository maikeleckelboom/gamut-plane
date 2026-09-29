import { rangeWarningStyle } from "@gamut-plane/render/internal/current";
import { presentationStyle } from "../model/presentationStyle.js";

import { useLayoutEffect, useRef } from "react";
import { gpAttribute, gpPart, mountRange, referenceWarningGlyphPath } from "@gamut-plane/ui";
import {
  channelSections,
  PICKER_SLIDER_FIELD_INSET,
  PICKER_SLIDER_TRACK_HEIGHT,
  PICKER_SLIDER_THUMB_TOP,
  PICKER_SLIDER_THUMB_WIDTH,
  type LinearControlInterval,
} from "@gamut-plane/render";
import { useCommitted } from "../hooks/useCommitted.js";
import { NumericInput } from "./NumericInput.js";

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
  overflowMax?: boolean;
  help?: string | undefined;
  warning?: string | null;
  normalizeValue?: (value: number) => number;
  onInput: (value: number) => void;
  onComplete: (value: number) => void;
  onCancel: (() => void) | undefined;
  onInteraction?: ((active: boolean) => void) | undefined;
}

const geometryStyle = {
  "--picker-slider-field-inset": `${PICKER_SLIDER_FIELD_INSET}px`,
  "--picker-slider-track-height": `${PICKER_SLIDER_TRACK_HEIGHT}px`,
  "--picker-slider-thumb-top": `${PICKER_SLIDER_THUMB_TOP}px`,
  "--picker-slider-thumb-width": `${PICKER_SLIDER_THUMB_WIDTH}px`,
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
    overflowMax,
    help,
    onComplete,
    onCancel,
  } = props;
  const range = useRef<HTMLInputElement>(null);
  const current = useCommitted({
    ...props,
    onInteraction: props.onInteraction,
    onNativeValue: (nativeValue: number) => {
      const position = rangeWarningStyle(nativeValue, min, max);
      if (position)
        range.current?.parentElement?.style.setProperty(
          "--gp-range-warning-position",
          position.left,
        );
    },
  });
  const binding = useRef<ReturnType<typeof mountRange> | null>(null);
  const bounded = Math.min(max, Math.max(min, value));
  const sections = channelSections(intervals);
  const helpId = help ? `${id}-help` : undefined;
  const warningId = props.warning ? `${id}-warning` : undefined;
  const describedBy = [helpId, warningId].filter(Boolean).join(" ") || undefined;
  const warningStyle = rangeWarningStyle(value, min, max);
  useLayoutEffect(() => {
    const mounted = mountRange(range.current!, () => current.current!);
    binding.current = mounted;
    return () => {
      binding.current = null;
      mounted.dispose();
    };
  }, [current]);
  useLayoutEffect(() => {
    binding.current?.reconcile();
  });
  return (
    <div
      className="gpr-channel-control"
      data-gp-part={gpPart.channel}
      data-gp-channel={channel.toLowerCase()}
      data-gp-overflow={String(value < min || value > max)}
      data-picker-control={channel.toLowerCase()}
      data-instrument-overflow={String(value < min || value > max)}
      style={presentationStyle(geometryStyle)}
    >
      <header className="gpr-channel-control-header" data-gp-part={gpPart.channelHeader}>
        <label htmlFor={id}>{label}</label>
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
      <span data-gp-part={gpPart.channelSymbol} aria-hidden="true">
        {channel}
      </span>
      <div className="gpr-channel-control-track" data-gp-part={gpPart.channelTrack} dir="ltr">
        <span
          className="gpr-channel-control-field"
          data-gp-part={gpPart.channelField}
          style={{ backgroundImage: gradient }}
        />
        <span className="gpr-channel-control-gamut-ranges" aria-hidden="true">
          {sections.map((section, index) => (
            <span
              key={`${section.tone}-${index}`}
              className={`gpr-channel-control-gamut-range gpr-channel-control-gamut-range--${section.tone}`}
              data-gp-part={gpPart.gamutInterval}
              data-gp-gamut={section.tone}
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
        {props.warning && warningStyle && (
          <svg
            data-gp-part={gpPart.referenceWarning}
            data-gamut-warning="linear"
            style={{ left: `var(--gp-range-warning-position, ${warningStyle.left})` }}
            width="16"
            height="16"
            viewBox="0 0 16 16"
            aria-hidden="true"
            focusable="false"
          >
            <path d={referenceWarningGlyphPath} />
          </svg>
        )}
        <input
          ref={range}
          id={id}
          className="gpr-channel-control-range"
          data-gp-part={gpPart.nativeRange}
          dir="ltr"
          type="range"
          aria-label={label}
          aria-describedby={describedBy}
          defaultValue={bounded}
          min={min}
          max={max}
          step={step}
          onBlur={(event) => {
            event.currentTarget.removeAttribute("data-pointer-focus");
            event.currentTarget.removeAttribute(gpAttribute.pointerFocus);
          }}
          onPointerDown={(event) => {
            if (event.pointerType !== "mouse" || event.button === 0) {
              event.currentTarget.dataset.pointerFocus = "";
              event.currentTarget.setAttribute(gpAttribute.pointerFocus, "");
            }
          }}
          onKeyDown={(event) => {
            event.currentTarget.removeAttribute("data-pointer-focus");
            event.currentTarget.removeAttribute(gpAttribute.pointerFocus);
          }}
        />
      </div>
      {help && (
        <p id={helpId} className="gpr-channel-control-help">
          {help}
        </p>
      )}
      {props.warning && (
        <span id={warningId} data-gp-visually-hidden="">
          {props.warning}
        </span>
      )}
    </div>
  );
}
