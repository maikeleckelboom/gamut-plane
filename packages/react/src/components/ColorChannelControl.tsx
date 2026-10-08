import { presentationStyle } from "../model/presentationStyle.js";

import { useLayoutEffect, useRef } from "react";
import { gpAttribute, gpPart, mountRange } from "@gamut-plane/ui";
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
  channel: "H" | "L" | "C" | "a" | "b" | "R" | "G" | "B";
  label: string;
  value: number | null;
  presentation?: "rail" | "card";
  min?: number | undefined;
  max?: number | undefined;
  coordinateContext?: string | undefined;
  accessibleLabel?: string;
  continuous?: boolean;
  step: number;
  precision: number;
  gradient: string;
  intervals: readonly LinearControlInterval[];
  numericBounds?: Readonly<{ min?: number; max?: number }>;
  help?: string | undefined;
  helpVisuallyHidden?: boolean;
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
    help,
    onComplete,
    onCancel,
  } = props;
  const available = min !== undefined && max !== undefined;
  const numericBounds = props.numericBounds ?? { min, max };
  const range = useRef<HTMLInputElement>(null);
  const current = useCommitted({
    ...props,
    value: props.value ?? 0,
    context: props.coordinateContext,
    keyboardStep: props.continuous ? props.step : undefined,
    onInteraction: props.onInteraction,
  });
  const binding = useRef<ReturnType<typeof mountRange> | null>(null);
  const bounded = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value ?? 0));
  const overflow = available && value !== null && (value < min || value > max);
  const sections = channelSections(intervals);
  const helpId = help ? `${id}-help` : undefined;
  const warningId = props.warning ? `${id}-warning` : undefined;
  const describedBy = [helpId, warningId].filter(Boolean).join(" ") || undefined;
  useLayoutEffect(() => {
    if (!range.current) return;
    const mounted = mountRange(range.current!, () => current.current!);
    binding.current = mounted;
    return () => {
      binding.current = null;
      mounted.dispose();
    };
  }, [current, props.presentation]);
  useLayoutEffect(() => {
    binding.current?.reconcile();
  });
  return (
    <div
      className="gpr-channel-control"
      data-gp-part={gpPart.channel}
      data-gp-channel={channel.toLowerCase()}
      data-gp-control={props.presentation ?? "rail"}
      data-gp-missing={String(value === null)}
      data-gp-overflow={String(overflow)}
      data-gp-unavailable={String(!available)}
      data-picker-control={channel.toLowerCase()}
      data-instrument-overflow={String(overflow)}
      style={presentationStyle(geometryStyle)}
    >
      <header className="gpr-channel-control-header" data-gp-part={gpPart.channelHeader}>
        <label htmlFor={`${id}-number`}>{label}</label>
        <span className="gp-channel-value">
          <NumericInput
            id={`${id}-number`}
            className="gpr-channel-control-number"
            aria-label={`${props.accessibleLabel ?? label} numeric value`}
            aria-describedby={describedBy}
            value={value}
            placeholder={value === null ? "unset" : undefined}
            readOnly={!available}
            aria-disabled={!available || undefined}
            context={props.coordinateContext}
            min={numericBounds.min}
            max={numericBounds.max}
            step={step}
            precision={precision}
            onComplete={onComplete}
            onCancel={onCancel}
          />
          {channel === "H" && value !== null && (
            <span className="gp-channel-unit" aria-hidden="true">
              °
            </span>
          )}
        </span>
      </header>
      {(props.presentation ?? "rail") === "rail" && (
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
                data-range-point={section.point ? "" : undefined}
                data-range-start={section.start}
                data-range-end={section.end}
              />
            ))}
          </span>
          <input
            ref={range}
            id={id}
            className="gpr-channel-control-range"
            data-gp-part={gpPart.nativeRange}
            dir="ltr"
            type="range"
            aria-label={props.accessibleLabel ?? label}
            aria-valuetext={
              overflow ? `${value!.toFixed(precision)} (outside direct range)` : undefined
            }
            disabled={!available || min === max}
            aria-describedby={describedBy}
            defaultValue={bounded}
            min={min}
            max={max}
            step={props.continuous ? "any" : step}
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
      )}
      {help &&
        (props.helpVisuallyHidden ? (
          <span id={helpId} data-gp-visually-hidden="">
            {help}
          </span>
        ) : (
          <p id={helpId} className="gpr-channel-control-help">
            {help}
          </p>
        ))}
      {props.warning && (
        <span id={warningId} data-gp-visually-hidden="">
          {props.warning}
        </span>
      )}
    </div>
  );
}
