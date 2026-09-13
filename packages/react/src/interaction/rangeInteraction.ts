export interface RangeInput {
  value: number;
  min: number;
  max: number;
  /** Maps native range values to the authored scalar returned by parent feedback. */
  normalizeValue?: (value: number) => number;
  onInput: (value: number) => void;
  onComplete: (value: number) => void;
  onInteraction: ((active: boolean) => void) | undefined;
}

/** Native input is live; native change is completion, independently of React event names. */
export function mountRange(element: HTMLInputElement, current: () => RangeInput) {
  let pointer: number | null = null;
  let preview = false;
  let pending: number | null = null;
  let frame: number | null = null;
  let disposed = false;
  let published = current().value;
  let previous = current().value;
  const clamp = (value: number) => Math.min(current().max, Math.max(current().min, value));
  function clear() {
    const hadPending = pending !== null;
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = pending = null;
    return hadPending;
  }
  function finish() {
    pointer = null;
    if (!preview) return;
    preview = false;
    current().onInteraction?.(false);
  }
  function interrupt() {
    if (clear()) element.value = String(clamp(published));
    finish();
  }
  function input() {
    if (!Number.isFinite(element.valueAsNumber)) return;
    pending = clamp(element.valueAsNumber);
    if (pointer !== null && !preview) {
      preview = true;
      current().onInteraction?.(true);
    }
    if (frame !== null) return;
    frame = window.requestAnimationFrame(() => {
      frame = null;
      const next = pending;
      pending = null;
      if (disposed || next === null) return;
      published = next;
      current().onInput(next);
    });
  }
  function complete() {
    if (!Number.isFinite(element.valueAsNumber)) return;
    const next = clamp(element.valueAsNumber);
    clear();
    published = next;
    current().onComplete(next);
    finish();
  }
  function down(event: PointerEvent) {
    if (pointer !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
    pointer = event.pointerId;
  }
  function up(event: PointerEvent) {
    if (pointer === event.pointerId) finish();
  }
  function cancel(event: PointerEvent) {
    if (pointer === event.pointerId) interrupt();
  }
  element.addEventListener("input", input);
  element.addEventListener("change", complete);
  element.addEventListener("pointerdown", down);
  element.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", cancel);
  element.addEventListener("lostpointercapture", cancel);
  element.addEventListener("blur", interrupt);
  return {
    reconcile() {
      const value = current().value;
      if (value === previous) return;
      previous = value;
      const expected = current().normalizeValue?.(published) ?? published;
      if (value !== expected) interrupt();
      published = value;
      if (pending === null) element.value = String(clamp(value));
    },
    dispose() {
      disposed = true;
      clear();
      pointer = null;
      preview = false;
      element.removeEventListener("input", input);
      element.removeEventListener("change", complete);
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointerup", up);
      element.removeEventListener("pointercancel", cancel);
      element.removeEventListener("lostpointercapture", cancel);
      element.removeEventListener("blur", interrupt);
    },
  };
}
