import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from "react";
import { useCommitted } from "../hooks/useCommitted.js";
import { gpPart, mountNumericInput } from "@gamut-plane/ui";

interface NumericInputProps extends Omit<
  ComponentPropsWithoutRef<"input">,
  | "value"
  | "defaultValue"
  | "onChange"
  | "onInput"
  | "onBlur"
  | "onKeyDown"
  | "type"
  | "min"
  | "max"
  | "step"
> {
  value: number;
  context?: string | undefined;
  min?: number | undefined;
  max?: number | undefined;
  step: number;
  precision: number;
  onComplete: (value: number) => void;
  onCancel: (() => void) | undefined;
}

/** The native number input owns its temporary text/bad-input/IME buffer. */
export function NumericInput(props: NumericInputProps) {
  const { value, min, max, step, precision, onComplete, onCancel, context, ...dom } = props;
  const input = useRef<HTMLInputElement>(null);
  const current = useCommitted({ value, precision, min, max, onComplete, onCancel });
  const binding = useRef<ReturnType<typeof mountNumericInput> | null>(null);
  useLayoutEffect(() => {
    const mounted = mountNumericInput(input.current!, () => current.current!);
    binding.current = mounted;
    return () => {
      binding.current = null;
      mounted.dispose();
    };
  }, [current]);
  useLayoutEffect(() => {
    binding.current?.reconcile();
  }, [value, precision, context]);
  return (
    <input
      {...dom}
      ref={input}
      type="number"
      data-gp-part={gpPart.numericInput}
      inputMode="decimal"
      dir="ltr"
      defaultValue={value.toFixed(precision)}
      min={min}
      max={max}
      step={step}
    />
  );
}
