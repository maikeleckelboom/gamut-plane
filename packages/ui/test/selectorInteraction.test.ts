import { afterEach, describe, expect, it, vi } from "vitest";
import { mountSelector } from "../src/interaction/selectorInteraction.js";
import { setPointerOwnership } from "../src/interaction/pointerOwnership.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  document.body.innerHTML = "";
  vi.useRealTimers();
});
function fixture() {
  const root = document.createElement("section");
  root.setAttribute("data-gp-root", "");
  root.innerHTML =
    '<button role="combobox" aria-expanded="false"></button><div role="listbox" hidden></div><input data-gp-part="native-range"><button id="outside">Outside</button>';
  document.body.append(root);
  const trigger = root.querySelector("button")!;
  const popup = root.querySelector("div")!;
  const options = ["OKLCH", "OKLab", "sRGB", "Display P3"].map((label) => ({
    value: label,
    label,
  }));
  popup.innerHTML = options
    .map(
      (option, i) =>
        `<div role="option" id="o${i}" data-value="${option.value}" aria-selected="${i === 0}">${option.label}</div>`,
    )
    .join("");
  const request = vi.fn();
  const state = { options, value: "OKLCH", disabled: false, request };
  const binding = mountSelector(trigger, popup, () => state);
  cleanups.push(binding.dispose);
  const key = (key: string) =>
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  return { root, trigger, popup, state, request, binding, key };
}
describe("single-select mounted interaction", () => {
  it("opens at accepted, navigates without requests, dismisses and clears candidate", () => {
    const f = fixture();
    f.key("Enter");
    expect(f.trigger.getAttribute("aria-activedescendant")).toBe("o0");
    f.key("ArrowDown");
    expect(f.trigger.getAttribute("aria-activedescendant")).toBe("o1");
    expect(f.popup.querySelector('[aria-selected="true"]')?.id).toBe("o0");
    f.key("End");
    expect(f.trigger.getAttribute("aria-activedescendant")).toBe("o3");
    f.key("Home");
    expect(f.trigger.getAttribute("aria-activedescendant")).toBe("o0");
    const escape = vi.fn();
    document.addEventListener("keydown", escape);
    f.key("Escape");
    document.removeEventListener("keydown", escape);
    expect(escape).not.toHaveBeenCalled();
    expect(f.request).not.toHaveBeenCalled();
    expect(f.popup.hidden).toBe(true);
    expect(document.activeElement).toBe(f.trigger);
    f.key(" ");
    f.key("Enter");
    expect(f.request).not.toHaveBeenCalled();
  });
  it("activates once without promoting rejected value; clears timed typeahead and on close", () => {
    vi.useFakeTimers();
    const f = fixture();
    f.trigger.click();
    f.key("s");
    expect(f.trigger.getAttribute("aria-activedescendant")).toBe("o2");
    f.key("Enter");
    expect(f.request).toHaveBeenCalledExactlyOnceWith("sRGB");
    expect(f.state.value).toBe("OKLCH");
    f.trigger.click();
    f.key("d");
    vi.advanceTimersByTime(710);
    f.key("s");
    expect(f.trigger.getAttribute("aria-activedescendant")).toBe("o2");
    f.key("Escape");
    f.trigger.click();
    f.key("o");
    f.key("o");
    expect(f.trigger.getAttribute("aria-activedescendant")).toBe("o0");
    f.key("Tab");
    expect(f.popup.hidden).toBe(true);
  });
  it("dismisses outside, reconciles accepted changes and disables without a request", () => {
    const f = fixture();
    f.trigger.click();
    f.state.value = "sRGB";
    f.binding.reconcile();
    expect(f.trigger.getAttribute("aria-activedescendant")).toBe("o2");
    f.root.querySelector("#outside")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(f.popup.hidden).toBe(true);
    f.trigger.click();
    f.state.disabled = true;
    f.binding.reconcile();
    expect(f.popup.hidden).toBe(true);
    expect(f.request).not.toHaveBeenCalled();
  });
  it("a trigger press that light-dismissed the popup does not reopen it on click", () => {
    const f = fixture();
    f.trigger.click();
    f.trigger.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
    // Native light dismiss treats the source invoker as outside and closes during the press.
    f.popup.dispatchEvent(Object.assign(new Event("beforetoggle"), { newState: "closed" }));
    expect(f.trigger.getAttribute("aria-expanded")).toBe("false");
    f.trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(f.popup.hidden).toBe(true);
    // Keyboard activation (detail 0) is never suppressed by an earlier press.
    f.trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    expect(f.popup.hidden).toBe(false);
    expect(f.request).not.toHaveBeenCalled();
  });
  it("does not steal focus or queue opening while a controller owns a pointer", () => {
    const f = fixture();
    const range = f.root.querySelector("input")!;
    range.focus();
    setPointerOwnership(range, true);
    f.trigger.click();
    f.key("ArrowDown");
    expect(f.popup.hidden).toBe(true);
    expect(document.activeElement).toBe(range);
    setPointerOwnership(range, false);
    expect(f.popup.hidden).toBe(true);
    f.trigger.click();
    expect(f.popup.hidden).toBe(false);
  });
  it("disposes cleanly while open", () => {
    const f = fixture();
    f.trigger.click();
    f.binding.dispose();
    f.key("ArrowDown");
    f.trigger.click();
    expect(f.popup.hidden).toBe(true);
  });
});
