import { setPointerOwnership } from "./pointerOwnership.js";

export interface RangeInput {
  value: number;
  min?: number | undefined;
  max?: number | undefined;
  context?: string | undefined;
  /** Native continuous range with explicit scalar keyboard increments. */
  keyboardStep?: number | undefined;
  /** Maps native range values to the authored scalar returned by parent feedback. */
  normalizeValue?: (value: number) => number;
  onInput: (value: number) => void;
  onComplete: (value: number) => void;
  onInteraction: ((active: boolean) => void) | undefined;
  /** Presentation follows the native thumb, including normalized endpoints such as Hue 360. */
  onNativeValue?: (value: number) => void;
}

/** Native input is live; native change is completion, independently of React event names. */
export function mountRange(element: HTMLInputElement, current: () => RangeInput) {
  let pointer: number | null = null;
  let preview = false;
  let pending: number | null = null;
  let frame: number | null = null;
  let disposed = false;
  let blocked = false;
  let bounds = [current().min, current().max, current().context] as const;
  let published = current().value;
  let previous = current().value;
  const clamp = (value: number) =>
    Math.min(current().max ?? Infinity, Math.max(current().min ?? -Infinity, value));
  function position() {
    current().onNativeValue?.(element.valueAsNumber);
  }
  function clear() {
    const hadPending = pending !== null;
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = pending = null;
    return hadPending;
  }
  function finish() {
    pointer = null;
    setPointerOwnership(element, false);
    if (!preview) return;
    preview = false;
    current().onInteraction?.(false);
  }
  function interrupt() {
    if (clear()) element.value = String(clamp(published));
    position();
    finish();
  }
  function canInteract() {
    if (!blocked && !element.disabled) return true;
    element.value = String(clamp(current().value));
    position();
    return false;
  }
  function input() {
    if (!canInteract()) return;
    if (!Number.isFinite(element.valueAsNumber)) return;
    pending = clamp(element.valueAsNumber);
    position();
    if (pointer !== null && !preview) {
      preview = true;
      current().onInteraction?.(true);
    }
    if (disposed) return;
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
    if (!canInteract()) return;
    if (!Number.isFinite(element.valueAsNumber)) return;
    const next = clamp(element.valueAsNumber);
    clear();
    published = next;
    position();
    current().onComplete(next);
    finish();
  }
  function down(event: PointerEvent) {
    if (pointer !== null || (event.pointerType === "mouse" && event.button !== 0)) return;
    blocked = false;
    pointer = event.pointerId;
    setPointerOwnership(element, true);
  }
  function up(event: PointerEvent) {
    if (pointer === event.pointerId) finish();
  }
  function cancel(event: PointerEvent) {
    if (pointer === event.pointerId) interrupt();
  }
  function key(event: KeyboardEvent) {
    if (element.disabled) return;
    blocked = false;
    const { keyboardStep, min, max } = current();
    if (keyboardStep === undefined || min === undefined || max === undefined) return;
    let next: number;
    if (event.key === "Home") next = min;
    else if (event.key === "End") next = max;
    else if (["ArrowRight", "ArrowUp"].includes(event.key))
      next = clamp(element.valueAsNumber + keyboardStep);
    else if (["ArrowLeft", "ArrowDown"].includes(event.key))
      next = clamp(element.valueAsNumber - keyboardStep);
    else return;
    event.preventDefault();
    element.value = String(next);
    complete();
  }
  element.addEventListener("keydown", key);
  element.addEventListener("input", input);
  element.addEventListener("change", complete);
  element.addEventListener("pointerdown", down);
  element.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", cancel);
  element.addEventListener("lostpointercapture", cancel);
  element.addEventListener("blur", interrupt);
  return {
    reconcile() {
      if (disposed) return;
      const value = current().value;
      const nextBounds = [current().min, current().max, current().context] as const;
      if (nextBounds.some((value, index) => value !== bounds[index])) {
        bounds = nextBounds;
        // Vue's synchronous prop reconciliation can precede its DOM patch. Native ranges
        // sanitize value against their DOM bounds, so install the accepted bounds first.
        if (nextBounds[0] === undefined) element.removeAttribute("min");
        else element.min = String(nextBounds[0]);
        if (nextBounds[1] === undefined) element.removeAttribute("max");
        else element.max = String(nextBounds[1]);
        blocked ||= pointer !== null;
        interrupt();
        previous = published = value;
        element.value = String(clamp(value));
        position();
        return;
      }
      if (value === previous) {
        position();
        return;
      }
      previous = value;
      const expected = current().normalizeValue?.(published) ?? published;
      if (value !== expected) {
        blocked ||= pointer !== null;
        interrupt();
        published = value;
        if (pending === null) element.value = String(clamp(value));
      }
      position();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clear();
      pointer = null;
      setPointerOwnership(element, false);
      preview = false;
      element.removeEventListener("keydown", key);
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
