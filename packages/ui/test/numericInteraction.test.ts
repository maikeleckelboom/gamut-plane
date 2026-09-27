import { afterEach, describe, expect, it, vi } from "vitest";
import { mountNumericInput } from "../src/interaction/numericInteraction.js";

function fixture() {
  const element = document.createElement("input");
  element.type = "number";
  element.min = "-0.4";
  element.max = "0.4";
  element.step = "any";
  element.value = "0.2000";
  document.body.append(element);
  let value = 0.2;
  let precision = 4;
  const complete = vi.fn();
  const cancel = vi.fn();
  const binding = mountNumericInput(element, () => ({
    value,
    precision,
    min: -0.4,
    max: 0.4,
    onComplete: complete,
    onCancel: cancel,
  }));
  function dispatch(type: string, next?: string) {
    if (next !== undefined) element.value = next;
    const event = new Event(type, { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    return event;
  }
  function key(name: string, isComposing = false) {
    const event = new KeyboardEvent("keydown", {
      key: name,
      isComposing,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return event;
  }
  return {
    element,
    complete,
    cancel,
    binding,
    dispatch,
    key,
    reconcile(nextValue: number, nextPrecision = precision) {
      value = nextValue;
      precision = nextPrecision;
      binding.reconcile();
    },
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("shared native numeric draft interaction", () => {
  it("keeps input local until completion", () => {
    const f = fixture();
    f.dispatch("input", "0.31");
    expect(f.element.value).toBe("0.31");
    expect(f.complete).not.toHaveBeenCalled();
  });

  it.each(["change", "Enter", "blur"])("%s completes a valid draft once", (action) => {
    const f = fixture();
    f.dispatch("input", "0.31");
    if (action === "Enter") f.key("Enter");
    else f.dispatch(action);
    f.dispatch("change");
    f.dispatch("blur");
    f.key("Enter");
    expect(f.complete).toHaveBeenCalledExactlyOnceWith(0.31);
    expect(f.cancel).not.toHaveBeenCalled();
  });

  it.each(["", "invalid"])(
    "restores an invalid or empty draft %s without callback",
    async (draft) => {
      const f = fixture();
      f.dispatch("input", draft);
      f.dispatch("change");
      await Promise.resolve();
      expect(f.element.value).toBe("0.2000");
      expect(f.complete).not.toHaveBeenCalled();
      expect(f.cancel).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["-1", -0.4],
    ["1", 0.4],
    ["0.1", 0.1],
  ] as const)("applies completion bounds to %s", (draft, expected) => {
    const f = fixture();
    f.dispatch("input", draft);
    f.key("Enter");
    expect(f.complete).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it("dirty Escape restores formatting and cancels once", () => {
    const f = fixture();
    f.dispatch("input", "-0.12");
    const escape = f.key("Escape");
    expect(escape.defaultPrevented).toBe(true);
    expect(f.element.value).toBe("0.2000");
    expect(f.cancel).toHaveBeenCalledOnce();
    expect(f.complete).not.toHaveBeenCalled();
  });

  it("does not consume idle Escape", () => {
    const f = fixture();
    const bubbled = vi.fn();
    document.body.addEventListener("keydown", bubbled, { once: true });
    const escape = f.key("Escape");
    expect(escape.defaultPrevented).toBe(false);
    expect(bubbled).toHaveBeenCalledOnce();
    expect(f.cancel).not.toHaveBeenCalled();
  });

  it.each([
    { value: 0.3, precision: 4, formatted: "0.3000" },
    { value: 0.2, precision: 2, formatted: "0.20" },
  ])(
    "reconciles authoritative value or precision and discards stale draft",
    ({ value, precision, formatted }) => {
      const f = fixture();
      f.dispatch("input", "-0.17");
      f.reconcile(value, precision);
      f.dispatch("blur");
      expect(f.element.value).toBe(formatted);
      expect(f.complete).not.toHaveBeenCalled();
      expect(f.cancel).not.toHaveBeenCalled();
    },
  );

  it.each(["change", "blur"])("explicit composition suppresses Enter, Escape and %s", (action) => {
    const f = fixture();
    f.dispatch("compositionstart");
    f.dispatch("input", "-0.3");
    f.key("Enter");
    f.key("Escape");
    f.dispatch(action);
    expect(f.element.value).toBe("-0.3");
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.cancel).not.toHaveBeenCalled();
  });

  it("compositionend alone is inert and an ordinary action completes once", () => {
    const f = fixture();
    f.dispatch("compositionstart");
    f.dispatch("input", "-0.3");
    f.dispatch("compositionend");
    expect(f.complete).not.toHaveBeenCalled();
    f.dispatch("change");
    f.dispatch("blur");
    expect(f.complete).toHaveBeenCalledExactlyOnceWith(-0.3);
  });

  it("ignores an isComposing key without an explicit composition session", () => {
    const f = fixture();
    f.dispatch("input", "0.3");
    f.key("Enter", true);
    f.key("Escape", true);
    expect(f.complete).not.toHaveBeenCalled();
    expect(f.cancel).not.toHaveBeenCalled();
  });

  it("does not let queued restoration overwrite a newer draft", async () => {
    const f = fixture();
    f.dispatch("input", "0.3");
    f.dispatch("change");
    f.dispatch("input", "0.1");
    await Promise.resolve();
    expect(f.element.value).toBe("0.1");
    expect(f.complete).toHaveBeenCalledExactlyOnceWith(0.3);
  });

  it("disposes silently, invalidates queued restoration, and makes later events and reconcile inert", async () => {
    const f = fixture();
    f.dispatch("input", "0.3");
    f.dispatch("change");
    f.dispatch("input", "0.1");
    f.binding.dispose();
    f.binding.dispose();
    f.reconcile(0.4, 2);
    f.dispatch("change");
    f.key("Escape");
    await Promise.resolve();
    expect(f.element.value).toBe("0.1");
    expect(f.complete).toHaveBeenCalledExactlyOnceWith(0.3);
    expect(f.cancel).not.toHaveBeenCalled();
  });
});
