import { afterEach, describe, expect, it, vi } from "vitest";
import { mountRange, type RangeInput } from "../src/interaction/rangeInteraction.js";

function fixture(normalizeValue?: RangeInput["normalizeValue"]) {
  const element = document.createElement("input");
  element.type = "range";
  element.min = "0";
  element.max = "360";
  element.step = "any";
  element.value = "10";
  document.body.append(element);
  let value = 10;
  const live = vi.fn();
  const complete = vi.fn();
  const interaction = vi.fn();
  const nativeValue = vi.fn();
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
  const binding = mountRange(element, () => ({
    value,
    min: 0,
    max: 360,
    ...(normalizeValue ? { normalizeValue } : {}),
    onInput: live,
    onComplete: complete,
    onInteraction: interaction,
    onNativeValue: nativeValue,
  }));
  function dispatch(type: string, next?: number) {
    if (next !== undefined) element.value = String(next);
    const event =
      type.startsWith("pointer") || type === "lostpointercapture"
        ? new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: "mouse", button: 0 })
        : new Event(type, { bubbles: true });
    element.dispatchEvent(event);
  }
  function flush() {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach((callback) => callback(0));
  }
  return {
    element,
    binding,
    live,
    complete,
    interaction,
    nativeValue,
    frames,
    dispatch,
    flush,
    feedback(next: number) {
      value = next;
      binding.reconcile();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("shared native range interaction", () => {
  it("installs dynamic DOM bounds before clamping a replacement value", () => {
    const element = document.createElement("input");
    element.type = "range";
    element.step = "any";
    element.min = "-0.1";
    element.max = "0.1";
    element.value = "0.1";
    const state = {
      value: 0.1,
      min: -0.1,
      max: 0.1,
      onInput: vi.fn(),
      onComplete: vi.fn(),
      onInteraction: undefined,
    };
    const binding = mountRange(element, () => state);
    Object.assign(state, { value: 0.35, min: -0.35, max: 0.35 });
    binding.reconcile();
    expect(element.min).toBe("-0.35");
    expect(element.max).toBe("0.35");
    expect(element.valueAsNumber).toBe(0.35);
    Object.assign(state, { value: -0.25, min: -0.25, max: 0.25 });
    binding.reconcile();
    expect(element.valueAsNumber).toBe(-0.25);
    expect(state.onInput).not.toHaveBeenCalled();
    expect(state.onComplete).not.toHaveBeenCalled();
    binding.dispose();
  });
  it("reports the actual thumb through pending work, normalized feedback, and replacement", () => {
    const f = fixture((value) => value % 360);
    f.dispatch("input", 360);
    expect(f.nativeValue).toHaveBeenLastCalledWith(360);
    expect(f.live).not.toHaveBeenCalled();
    f.flush();
    f.feedback(0);
    expect(f.nativeValue).toHaveBeenLastCalledWith(360);
    f.feedback(180);
    expect(f.nativeValue).toHaveBeenLastCalledWith(180);
    f.dispatch("input", 90);
    f.dispatch("blur");
    expect(f.nativeValue).toHaveBeenLastCalledWith(180);
    f.binding.dispose();
    f.nativeValue.mockClear();
    f.dispatch("input", 30);
    expect(f.nativeValue).not.toHaveBeenCalled();
  });
  it("coalesces live input to the latest value in one frame", () => {
    const f = fixture();
    f.dispatch("input", 20);
    f.dispatch("input", 30);
    f.dispatch("input", 40);
    expect(f.frames.size).toBe(1);
    expect(f.live).not.toHaveBeenCalled();
    f.flush();
    expect(f.live).toHaveBeenCalledExactlyOnceWith(40);
    expect(f.complete).not.toHaveBeenCalled();
  });

  it("native change cancels pending work and completes the actual final native value", () => {
    const f = fixture();
    f.dispatch("input", 20);
    f.dispatch("change", 35);
    expect(f.frames.size).toBe(0);
    expect(f.complete).toHaveBeenCalledExactlyOnceWith(35);
    f.flush();
    expect(f.live).not.toHaveBeenCalled();
  });

  it("accepts normalized feedback without interrupting the native endpoint", () => {
    const f = fixture((native) => native % 360);
    f.dispatch("pointerdown");
    f.dispatch("input", 360);
    f.flush();
    f.feedback(0);
    expect(f.element.value).toBe("360");
    expect(f.interaction.mock.calls).toEqual([[true]]);
    f.dispatch("input", 90);
    f.flush();
    expect(f.live.mock.calls).toEqual([[360], [90]]);
    expect(f.interaction.mock.calls).toEqual([[true]]);
  });

  it.each([false, true])(
    "different authoritative feedback interrupts pending work after publication=%s",
    (published) => {
      const f = fixture();
      f.dispatch("pointerdown");
      f.dispatch("input", 20);
      if (published) f.flush();
      f.dispatch("input", 30);
      f.feedback(70);
      f.flush();
      expect(f.element.value).toBe("70");
      expect(f.live).toHaveBeenCalledTimes(published ? 1 : 0);
      expect(f.complete).not.toHaveBeenCalled();
      expect(f.interaction.mock.calls).toEqual([[true], [false]]);
    },
  );

  it("starts pointer preview only after pointer input", () => {
    const f = fixture();
    f.dispatch("pointerdown");
    expect(f.interaction).not.toHaveBeenCalled();
    f.dispatch("input", 20);
    f.dispatch("input", 30);
    expect(f.interaction.mock.calls).toEqual([[true]]);
    f.dispatch("pointerup");
    expect(f.interaction.mock.calls).toEqual([[true], [false]]);
  });

  it.each(["pointercancel", "lostpointercapture", "blur"])(
    "%s restores the latest published native value and ends preview once",
    (interruption) => {
      const f = fixture();
      f.dispatch("pointerdown");
      f.dispatch("input", 20);
      f.flush();
      f.dispatch("input", 30);
      f.dispatch(interruption);
      f.flush();
      f.dispatch("blur");
      expect(f.element.value).toBe("20");
      expect(f.live).toHaveBeenCalledExactlyOnceWith(20);
      expect(f.complete).not.toHaveBeenCalled();
      expect(f.interaction.mock.calls).toEqual([[true], [false]]);
    },
  );

  it("completion ends preview once even after later pointer events", () => {
    const f = fixture();
    f.dispatch("pointerdown");
    f.dispatch("input", 20);
    f.dispatch("change", 25);
    f.dispatch("pointerup");
    f.dispatch("lostpointercapture");
    expect(f.complete).toHaveBeenCalledExactlyOnceWith(25);
    expect(f.interaction.mock.calls).toEqual([[true], [false]]);
  });

  it("disposes queued work silently and makes later native events and reconciliation inert", () => {
    const f = fixture();
    f.dispatch("pointerdown");
    f.dispatch("input", 20);
    f.binding.dispose();
    f.binding.dispose();
    expect(f.frames.size).toBe(0);
    f.dispatch("change", 30);
    f.dispatch("input", 40);
    f.dispatch("pointercancel");
    f.feedback(70);
    f.flush();
    expect(f.element.value).toBe("40");
    expect(f.live).not.toHaveBeenCalled();
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.interaction.mock.calls).toEqual([[true]]);
  });

  it("does not schedule work when preview-start callback disposes the binding", () => {
    const f = fixture();
    f.interaction.mockImplementation(() => f.binding.dispose());
    f.dispatch("pointerdown");
    f.dispatch("input", 20);
    expect(f.frames.size).toBe(0);
    f.flush();
    expect(f.live).not.toHaveBeenCalled();
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.interaction.mock.calls).toEqual([[true]]);
  });
});
