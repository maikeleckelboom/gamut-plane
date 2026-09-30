import { afterEach, describe, expect, it, vi } from "vitest";
import { gamutContextMenuGroups } from "../src/gamutContextMenu.js";
import { initialInstrumentState } from "../src/generalizedInstrument.js";
import { mountGamutContextMenu } from "../src/interaction/gamutContextMenuInteraction.js";
import { mountGamutPopup } from "../src/interaction/gamutInteraction.js";
import { mountSelector } from "../src/interaction/selectorInteraction.js";
import { setPointerOwnership } from "../src/interaction/pointerOwnership.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
const guides = ["display-p3-boundary", "srgb-boundary"] as const;
const guideFor = {
  "srgb-gamut": "srgb-boundary",
  "display-p3-gamut": "display-p3-boundary",
} as const;

function fixture() {
  const root = document.createElement("section");
  root.setAttribute("data-gp-root", "");
  root.innerHTML = `<button id="combo" role="combobox"></button><div id="list" role="listbox" hidden><div role="option" id="o0" data-value="oklch">OKLCH</div></div>
    <div tabindex="0" data-gp-part="surface"></div><input data-gp-part="native-range">
    <button id="gamuts"></button><div id="popup" role="dialog" hidden></div><div id="menu" role="menu" hidden></div>`;
  const outside = document.createElement("button");
  document.body.append(root, outside);
  const plane = root.querySelector<HTMLElement>('[data-gp-part="surface"]')!;
  const menu = root.querySelector<HTMLElement>("#menu")!;
  const request = vi.fn();
  let state = initialInstrumentState(guides);
  let readOnly = false;
  const groups = () => gamutContextMenuGroups(state, [], guideFor);
  menu.innerHTML = groups()
    .flatMap((group) =>
      group.items.map(
        (item) =>
          `<button type="button" role="${item.role}" data-gp-command="${item.id}" aria-checked="${item.checked}" tabindex="-1">${item.label}</button>`,
      ),
    )
    .join("");
  const binding = mountGamutContextMenu(plane, menu, () => ({
    groups: groups(),
    readOnly,
    request,
  }));
  cleanups.push(binding.dispose);
  const invoke = (options: MouseEventInit & { pointerType?: string } = {}) => {
    const event = Object.assign(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: 100,
        clientY: 120,
        ...options,
      }),
      { pointerType: options.pointerType ?? "mouse" },
    );
    plane.dispatchEvent(event);
    return event;
  };
  const key = (key: string, options: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...options,
    });
    document.activeElement!.dispatchEvent(event);
    return event;
  };
  return {
    root,
    plane,
    menu,
    outside,
    binding,
    request,
    invoke,
    key,
    buttons: [...menu.querySelectorAll("button")],
    update: (next: typeof state) => {
      state = next;
    },
    readOnly: () => {
      readOnly = true;
    },
  };
}

describe("plane gamut context menu mechanics", () => {
  it("handles the context event at its pointer coordinates and roves from accepted Reference", () => {
    const f = fixture();
    expect(f.invoke().defaultPrevented).toBe(true);
    expect(f.menu.hidden).toBe(false);
    expect([f.menu.style.left, f.menu.style.top]).toEqual(["100px", "120px"]);
    expect(document.activeElement).toBe(f.buttons[0]);
    expect(f.buttons.map((button) => button.tabIndex)).toEqual([0, -1, -1, -1, -1, -1, -1]);
    expect(f.request).not.toHaveBeenCalled();
  });

  it("uses the stable plane center for keyboard contextmenu, without a second keydown opener", () => {
    const f = fixture();
    vi.spyOn(f.plane, "getBoundingClientRect").mockReturnValue({
      left: 20,
      top: 30,
      width: 300,
      height: 200,
    } as DOMRect);
    f.plane.focus();
    f.key("F10", { shiftKey: true });
    expect(f.menu.hidden).toBe(true);
    f.invoke({ button: -1, clientX: 700, clientY: 900 });
    expect([f.menu.style.left, f.menu.style.top]).toEqual(["170px", "130px"]);
    f.key("Escape");
    f.key("ContextMenu");
    expect(f.menu.hidden).toBe(true);
    f.invoke({ button: 0, clientX: 0, clientY: 0 });
    expect(f.menu.hidden).toBe(false);
  });

  it("clamps a measured overlay at viewport edges and repositions on reconciliation", () => {
    const f = fixture();
    vi.spyOn(f.menu, "getBoundingClientRect").mockReturnValue({
      width: 220,
      height: 260,
    } as DOMRect);
    f.invoke({ clientX: window.innerWidth - 1, clientY: window.innerHeight - 1 });
    expect([f.menu.style.left, f.menu.style.top]).toEqual([
      `${window.innerWidth - 228}px`,
      `${window.innerHeight - 268}px`,
    ]);
    f.invoke({ clientX: -10, clientY: -15 });
    expect([f.menu.style.left, f.menu.style.top]).toEqual(["8px", "8px"]);
    f.binding.reconcile();
    expect(f.request).not.toHaveBeenCalled();
  });

  it("wraps Arrow keys and supports Home/End without including headings or separators", () => {
    const f = fixture();
    f.invoke();
    for (const [key, index] of [
      ["ArrowUp", 6],
      ["ArrowDown", 0],
      ["End", 6],
      ["Home", 0],
      ["ArrowDown", 1],
    ] as const) {
      expect(f.key(key).defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(f.buttons[index]);
      expect(f.buttons.filter((button) => button.tabIndex === 0)).toEqual([f.buttons[index]]);
    }
    expect(f.key("ArrowRight").defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(f.buttons[1]);
    expect(f.request).not.toHaveBeenCalled();
  });

  it.each(["Enter", " "])("activates once with %s, closes and returns focus", (key) => {
    const f = fixture();
    f.invoke();
    f.key("End");
    expect(f.key(key).defaultPrevented).toBe(true);
    expect(f.request).toHaveBeenCalledExactlyOnceWith({
      kind: "status",
      gamutId: "display-p3-gamut",
      requested: false,
    });
    expect(f.menu.hidden).toBe(true);
    expect(document.activeElement).toBe(f.plane);
    expect(f.buttons.every((button) => button.tabIndex === -1)).toBe(true);
  });

  it("reads the latest accepted action on pointer activation instead of keeping an open-time snapshot", () => {
    const f = fixture();
    f.invoke();
    f.update({ ...initialInstrumentState(guides), checkedGamuts: [] });
    f.buttons[5]!.click();
    expect(f.request).toHaveBeenCalledExactlyOnceWith({
      kind: "status",
      gamutId: "srgb-gamut",
      requested: true,
    });
    expect(f.menu.hidden).toBe(true);
    expect(document.activeElement).toBe(f.plane);
  });

  it("consumes only the first Escape and preserves normal Tab/Shift+Tab default behavior", () => {
    const f = fixture();
    const host = vi.fn();
    f.root.addEventListener("keydown", host);
    f.invoke();
    f.key("Escape");
    expect(host).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(f.plane);
    f.key("Escape");
    expect(host).toHaveBeenCalledOnce();
    for (const shiftKey of [false, true]) {
      f.invoke();
      expect(f.key("Tab", { shiftKey }).defaultPrevented).toBe(false);
      expect(f.menu.hidden).toBe(true);
      expect(document.activeElement).toBe(f.plane);
    }
    expect(f.request).not.toHaveBeenCalled();
  });

  it("outside pointer and focus dismissal do not restore the plane over the intended target", () => {
    const f = fixture();
    f.invoke();
    f.outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    f.outside.focus();
    expect(f.menu.hidden).toBe(true);
    expect(document.activeElement).toBe(f.outside);
    f.invoke();
    f.outside.focus();
    expect(f.menu.hidden).toBe(true);
    expect(document.activeElement).toBe(f.outside);
    expect(f.request).not.toHaveBeenCalled();
  });

  it.each(["surface", "native-range"])(
    "suppresses opening while %s owns a pointer without completing or queueing",
    (part) => {
      const f = fixture();
      const control = f.root.querySelector<HTMLElement>(`[data-gp-part="${part}"]`)!;
      control.focus();
      setPointerOwnership(control, true);
      expect(f.invoke().defaultPrevented).toBe(true);
      expect(f.menu.hidden).toBe(true);
      expect(document.activeElement).toBe(control);
      setPointerOwnership(control, false);
      expect(f.menu.hidden).toBe(true);
      expect(f.request).not.toHaveBeenCalled();
      f.invoke();
      expect(f.menu.hidden).toBe(false);
    },
  );

  it("does not take touch-derived contextmenu events or add long-press recognition", () => {
    const f = fixture();
    expect(f.invoke({ pointerType: "touch" }).defaultPrevented).toBe(false);
    expect(f.menu.hidden).toBe(true);
    expect(f.request).not.toHaveBeenCalled();
    f.invoke({ pointerType: "pen" });
    expect(f.menu.hidden).toBe(false);
  });

  it("read-only commands remain inspectable through roving focus and never request state", () => {
    const f = fixture();
    f.readOnly();
    f.invoke();
    f.key("End");
    f.key("Enter");
    f.buttons[1]!.click();
    expect(f.request).not.toHaveBeenCalled();
    expect(f.menu.hidden).toBe(false);
    f.key("Escape");
    expect(f.menu.hidden).toBe(true);
  });

  it("shares ownership with Coordinates, Area and Gamuts without issuing state", () => {
    const f = fixture();
    const gamuts = f.root.querySelector<HTMLButtonElement>("#gamuts")!;
    const popup = f.root.querySelector<HTMLElement>("#popup")!;
    cleanups.push(mountGamutPopup(gamuts, popup).dispose);
    const combo = f.root.querySelector<HTMLButtonElement>("#combo")!;
    const list = f.root.querySelector<HTMLElement>("#list")!;
    const selection = vi.fn();
    cleanups.push(
      mountSelector(combo, list, () => ({
        value: "oklch",
        options: [{ value: "oklch", label: "OKLCH" }],
        disabled: false,
        request: selection,
      })).dispose,
    );
    combo.click();
    f.invoke();
    expect(list.hidden).toBe(true);
    gamuts.click();
    expect(f.menu.hidden).toBe(true);
    expect(popup.hidden).toBe(false);
    f.invoke();
    expect(popup.hidden).toBe(true);
    combo.click();
    expect(f.menu.hidden).toBe(true);
    expect(list.hidden).toBe(false);
    expect(f.request).not.toHaveBeenCalled();
    expect(selection).not.toHaveBeenCalled();
  });

  it("disposes all mounted/open listeners and allows one clean remount", () => {
    const f = fixture();
    const remove = vi.spyOn(document, "removeEventListener");
    const windowRemove = vi.spyOn(window, "removeEventListener");
    const menuRemove = vi.spyOn(f.menu, "removeEventListener");
    f.invoke();
    f.binding.dispose();
    expect(remove.mock.calls.map(([type]) => type)).toEqual(["pointerdown", "focusin"]);
    expect(windowRemove.mock.calls.map(([type]) => type)).toEqual(["resize", "scroll"]);
    expect(menuRemove.mock.calls.map(([type]) => type)).toEqual([
      "click",
      "keydown",
      "beforetoggle",
    ]);
    expect(f.menu.hidden).toBe(true);
    expect(f.invoke().defaultPrevented).toBe(false);
    const request = vi.fn();
    const mounted = mountGamutContextMenu(f.plane, f.menu, () => ({
      groups: gamutContextMenuGroups(initialInstrumentState(guides), [], guideFor),
      readOnly: false,
      request,
    }));
    cleanups.push(mounted.dispose);
    f.invoke();
    f.buttons[1]!.click();
    expect(request).toHaveBeenCalledOnce();
    expect(f.request).not.toHaveBeenCalled();
  });
});
