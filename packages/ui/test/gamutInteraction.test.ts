import { afterEach, describe, expect, it, vi } from "vitest";
import { mountGamutPopup } from "../src/interaction/gamutInteraction.js";
import { mountSelector } from "../src/interaction/selectorInteraction.js";
import { setPointerOwnership } from "../src/interaction/pointerOwnership.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
function fixture() {
  const root = document.createElement("section");
  root.setAttribute("data-gp-root", "");
  root.innerHTML = `
    <button id="combo" role="combobox" aria-expanded="false"></button>
    <div id="list" role="listbox" hidden><div role="option" id="o0" data-value="oklch">OKLCH</div></div>
    <input data-gp-part="native-range">
    <button id="gamuts" aria-expanded="false"></button>
    <div id="popup" role="dialog" tabindex="-1" hidden>
      <button data-gp-close>Close</button><input id="status" type="checkbox"><input id="last" type="checkbox">
    </div>`;
  const after = document.createElement("button");
  after.id = "outside";
  document.body.append(root, after);
  const trigger = root.querySelector<HTMLButtonElement>("#gamuts")!;
  const popup = root.querySelector<HTMLElement>("#popup")!;
  const binding = mountGamutPopup(trigger, popup);
  cleanups.push(binding.dispose);
  const key = (target: Element, key: string) =>
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  return { root, trigger, popup, binding, key, outside: after };
}

describe("nonmodal Gamuts popup mechanics", () => {
  it("opens from the trigger without moving focus into the surface", () => {
    const f = fixture();
    f.trigger.click();
    expect(f.trigger.getAttribute("aria-expanded")).toBe("true");
    expect(f.popup.hidden).toBe(false);
    expect(document.activeElement).toBe(f.trigger);
    f.trigger.click();
    expect(f.popup.hidden).toBe(true);
    expect(f.trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("a trigger press that light-dismissed the surface does not reopen it on click", () => {
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
  });

  it("consumes Escape from inside and returns focus to the trigger", () => {
    const f = fixture();
    const host = vi.fn();
    document.addEventListener("keydown", host);
    f.trigger.click();
    const status = f.popup.querySelector<HTMLInputElement>("#status")!;
    status.focus();
    f.key(status, "Escape");
    expect(host).not.toHaveBeenCalled();
    expect(f.popup.hidden).toBe(true);
    expect(document.activeElement).toBe(f.trigger);
    // Closed: Escape belongs to the host again.
    f.key(f.trigger, "Escape");
    expect(host).toHaveBeenCalledOnce();
    document.removeEventListener("keydown", host);
  });

  it("closes explicitly, returning focus, and ignores ordinary control clicks", () => {
    const f = fixture();
    f.trigger.click();
    f.popup.querySelector<HTMLInputElement>("#status")!.click();
    expect(f.popup.hidden).toBe(false);
    const close = f.popup.querySelector<HTMLButtonElement>("[data-gp-close]")!;
    close.focus();
    close.click();
    expect(f.popup.hidden).toBe(true);
    expect(document.activeElement).toBe(f.trigger);
  });

  it("dismisses on outside pointer or focus without stealing the intended focus", () => {
    const f = fixture();
    f.trigger.click();
    f.popup.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(f.popup.hidden).toBe(false);
    f.outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    f.outside.focus();
    expect(f.popup.hidden).toBe(true);
    expect(document.activeElement).toBe(f.outside);
    f.trigger.click();
    f.popup.querySelector<HTMLInputElement>("#last")!.focus();
    expect(f.popup.hidden).toBe(false);
    f.outside.focus();
    expect(f.popup.hidden).toBe(true);
    expect(document.activeElement).toBe(f.outside);
  });

  it("does not open, steal focus or queue opening while a controller owns a pointer", () => {
    const f = fixture();
    const range = f.root.querySelector("input")!;
    range.focus();
    setPointerOwnership(range, true);
    const down = new Event("pointerdown", { bubbles: true, cancelable: true });
    f.trigger.dispatchEvent(down);
    f.trigger.click();
    expect(down.defaultPrevented).toBe(true);
    expect(f.popup.hidden).toBe(true);
    expect(document.activeElement).toBe(range);
    setPointerOwnership(range, false);
    expect(f.popup.hidden).toBe(true);
    f.trigger.click();
    expect(f.popup.hidden).toBe(false);
  });

  it("owns at most one instrument popup alongside the Coordinates selector", () => {
    const f = fixture();
    const combo = f.root.querySelector<HTMLButtonElement>("#combo")!;
    const list = f.root.querySelector<HTMLElement>("#list")!;
    const request = vi.fn();
    const selector = mountSelector(combo, list, () => ({
      value: "oklch",
      options: [{ value: "oklch", label: "OKLCH" }],
      disabled: false,
      request,
    }));
    cleanups.push(selector.dispose);
    combo.click();
    expect(list.hidden).toBe(false);
    f.trigger.click();
    expect(list.hidden).toBe(true);
    expect(combo.getAttribute("aria-expanded")).toBe("false");
    expect(f.popup.hidden).toBe(false);
    combo.click();
    expect(f.popup.hidden).toBe(true);
    expect(f.trigger.getAttribute("aria-expanded")).toBe("false");
    expect(list.hidden).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("registers document and window listeners only while open and disposes cleanly", () => {
    const documentAdd = vi.spyOn(document, "addEventListener");
    const windowAdd = vi.spyOn(window, "addEventListener");
    const f = fixture();
    expect(documentAdd).not.toHaveBeenCalled();
    expect(windowAdd).not.toHaveBeenCalled();
    const documentRemove = vi.spyOn(document, "removeEventListener");
    const windowRemove = vi.spyOn(window, "removeEventListener");
    f.trigger.click();
    expect(documentAdd.mock.calls.map(([type]) => type)).toEqual(["pointerdown", "focusin"]);
    expect(windowAdd.mock.calls.map(([type]) => type)).toEqual(["resize", "scroll"]);
    f.binding.dispose();
    expect(documentRemove).toHaveBeenCalledTimes(2);
    expect(windowRemove).toHaveBeenCalledTimes(2);
    expect(f.popup.hidden).toBe(true);
    f.trigger.click();
    expect(f.popup.hidden).toBe(true);
  });
});
