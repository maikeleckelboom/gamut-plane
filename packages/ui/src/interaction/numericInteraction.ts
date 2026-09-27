export interface NumericInputState {
  value: number;
  precision: number;
  min: number;
  max?: number | undefined;
  onComplete: (value: number) => void;
  onCancel?: (() => void) | undefined;
}

/** Native number input owns temporary text and bad-input state; only interaction metadata is shared. */
export function mountNumericInput(element: HTMLInputElement, current: () => NumericInputState) {
  let dirty = false;
  let composing = false;
  let revision = 0;
  let disposed = false;

  function reset() {
    dirty = false;
    // Direct assignment also clears the browser's internal bad-input buffer.
    element.value = current().value.toFixed(current().precision);
  }
  function edit() {
    revision++;
    dirty = true;
  }
  function complete() {
    if (disposed || !dirty || composing) return;
    dirty = false;
    const completedRevision = revision;
    const numeric = element.valueAsNumber;
    const state = current();
    if (Number.isFinite(numeric))
      state.onComplete(Math.min(state.max ?? Infinity, Math.max(state.min, numeric)));
    queueMicrotask(() => {
      if (!disposed && revision === completedRevision) reset();
    });
  }
  function key(event: KeyboardEvent) {
    if (disposed || event.isComposing || composing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      complete();
    } else if (event.key === "Escape" && dirty) {
      event.preventDefault();
      event.stopPropagation();
      revision++;
      reset();
      current().onCancel?.();
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
  return {
    reconcile() {
      if (disposed) return;
      revision++;
      reset();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      revision++;
      dirty = composing = false;
      element.removeEventListener("input", edit);
      element.removeEventListener("change", complete);
      element.removeEventListener("blur", complete);
      element.removeEventListener("keydown", key);
      element.removeEventListener("compositionstart", compositionStart);
      element.removeEventListener("compositionend", compositionEnd);
    },
  };
}
