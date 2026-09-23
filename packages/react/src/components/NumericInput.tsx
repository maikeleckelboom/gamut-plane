import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from "react";
import { useCommitted } from "../hooks/useCommitted.js";

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
  min: number;
  max?: number | undefined;
  step: number;
  precision: number;
  onComplete: (value: number) => void;
  onCancel: (() => void) | undefined;
}

/** The native number input owns its temporary text/bad-input/IME buffer. */
export function NumericInput(props: NumericInputProps) {
  const { value, min, max, step, precision, onComplete, onCancel, ...dom } = props;
  const input = useRef<HTMLInputElement>(null);
  const current = useCommitted({ value, precision, min, max, onComplete, onCancel });
  const resetDraft = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const element = input.current!;
    let dirty = false;
    let composing = false;
    let revision = 0;
    let disposed = false;
    function reset() {
      dirty = false;
      element.value = current.current!.value.toFixed(current.current!.precision);
    }
    resetDraft.current = () => {
      revision++;
      reset();
    };
    function edit() {
      revision++;
      dirty = true;
    }
    function complete() {
      if (!dirty || composing) return;
      dirty = false;
      const completedRevision = revision;
      const numeric = element.valueAsNumber;
      const committed = current.current!;
      if (Number.isFinite(numeric))
        committed.onComplete(Math.min(committed.max ?? Infinity, Math.max(committed.min, numeric)));
      queueMicrotask(() => {
        if (!disposed && revision === completedRevision) reset();
      });
    }
    function key(event: KeyboardEvent) {
      if (event.isComposing || composing) return;
      if (event.key === "Enter") {
        event.preventDefault();
        complete();
      } else if (event.key === "Escape" && dirty) {
        event.preventDefault();
        event.stopPropagation();
        revision++;
        reset();
        current.current!.onCancel?.();
      }
    }
    function compositionStart() {
      composing = true;
    }
    function compositionEnd() {
      composing = false;
    }
    element.addEventListener("input", edit);
    element.addEventListener("change", complete);
    element.addEventListener("blur", complete);
    element.addEventListener("keydown", key);
    element.addEventListener("compositionstart", compositionStart);
    element.addEventListener("compositionend", compositionEnd);
    return () => {
      disposed = true;
      resetDraft.current = null;
      element.removeEventListener("input", edit);
      element.removeEventListener("change", complete);
      element.removeEventListener("blur", complete);
      element.removeEventListener("keydown", key);
      element.removeEventListener("compositionstart", compositionStart);
      element.removeEventListener("compositionend", compositionEnd);
    };
  }, [current]);
  useLayoutEffect(() => {
    resetDraft.current?.();
  }, [value, precision]);
  return (
    <input
      {...dom}
      ref={input}
      type="number"
      inputMode="decimal"
      dir="ltr"
      defaultValue={value.toFixed(precision)}
      min={min}
      max={max}
      step={step}
    />
  );
}
