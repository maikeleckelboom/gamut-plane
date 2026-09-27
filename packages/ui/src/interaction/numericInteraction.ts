export interface NumericInputState {
  value: number;
  precision: number;
  min: number;
  max?: number | undefined;
  onComplete: (value: number) => void;
  onCancel?: (() => void) | undefined;
}

/** Native number input owns temporary text and bad-input state; only interaction metadata is shared. */
export function mountNumericInput(target: HTMLInputElement, current: () => NumericInputState) {
  let element: HTMLInputElement | null = target;
  let readCurrent: (() => NumericInputState) | null = current;
  let dirty = false;
  let composing = false;
  let revision = 0;
  let disposed = false;

  function reset() {
    dirty = false;
    if (!element || !readCurrent) return;
    const state = readCurrent();
    // Direct assignment also clears the browser's internal bad-input buffer.
    element.value = state.value.toFixed(state.precision);
  }
  function edit() {
    revision++;
    dirty = true;
  }
  function complete() {
    const input = element;
    const access = readCurrent;
    if (disposed || !input || !access || !dirty || composing) return;
    dirty = false;
    const completedRevision = revision;
    const numeric = input.valueAsNumber;
    const state = access();
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
      readCurrent?.().onCancel?.();
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
      const input = element;
      if (disposed || !input) return;
      disposed = true;
      revision++;
      dirty = composing = false;
      input.removeEventListener("input", edit);
      input.removeEventListener("change", complete);
      input.removeEventListener("blur", complete);
      input.removeEventListener("keydown", key);
      input.removeEventListener("compositionstart", compositionStart);
      input.removeEventListener("compositionend", compositionEnd);
      element = null;
      readCurrent = null;
    },
  };
}
