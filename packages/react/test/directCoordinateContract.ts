import { describe, expect, it, vi } from "vitest";
import { createColorValue, definitionOf, type ColorValue } from "@gamut-plane/core";
import type { GamutPlaneState } from "../src/index.js";

export const directState: GamutPlaneState = {
  selection: { representationId: "oklab", editorId: "oklab-ab" },
  checkedGamuts: ["srgb-gamut"],
  visibleGuides: [],
  referenceGamutId: "srgb-gamut",
};
export function lab(a = 0.1, b = 0.2): ColorValue {
  const result = createColorValue({ space: "oklab", channels: [0.68, a, b], alpha: 0.37 });
  if (!result.ok) throw Error("fixture");
  return result.value;
}
interface Host {
  element: Element;
  current(): ColorValue;
  changes(): number;
  commits(): number;
  replace(value: ColorValue): Promise<void>;
  state(state: GamutPlaneState): Promise<void>;
  interact(action: () => void): Promise<void>;
  dispose(): Promise<void>;
}
function input(root: Element, coordinate: string, type = "range") {
  return root.querySelector<HTMLInputElement>(
    `[data-gp-channel="${coordinate}"] input[type="${type}"]`,
  )!;
}
function key(element: Element, key: string) {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}
function native(element: HTMLInputElement, value: number, type = "change") {
  element.value = String(value);
  element.dispatchEvent(new Event(type, { bubbles: true }));
}
export function directCoordinateContract(mount: (value: ColorValue) => Promise<Host>) {
  describe("direct OKLab adapter contract", () => {
    it.each(["a", "b"] as const)(
      "%s endpoints, arrows, zero and numeric completion preserve other coordinates exactly",
      async (coordinate) => {
        const host = await mount(lab());
        const range = input(host.element, coordinate);
        const numeric = input(host.element, coordinate, "number");
        const index = coordinate === "a" ? 1 : 2;
        const other = coordinate === "a" ? 2 : 1;
        const original = definitionOf(host.current());
        const bounds = [range.min, range.max];
        expect([numeric.min, numeric.max]).toEqual(bounds);
        expect(host.element.querySelectorAll('[data-gp-part="channel-symbol"]')).toHaveLength(3);
        expect(host.element.querySelector('[data-gp-part="coordinate-readout"]')).toBeNull();
        for (const action of ["Home", "End", "ArrowLeft", "ArrowRight"]) {
          await host.interact(() => key(range, action));
          const defined = definitionOf(host.current());
          expect(defined.channels[other]).toBe(original.channels[other]);
          expect(defined.channels[0]).toBe(original.channels[0]);
          expect(defined.alpha).toBe(original.alpha);
          expect(defined.space).toBe("oklab");
          expect([range.min, range.max]).toEqual(bounds);
          if (action === "Home") expect(defined.channels[index]).toBe(Number(range.min));
          if (action === "End") expect(defined.channels[index]).toBe(Number(range.max));
        }
        for (const scalar of [0, 2, -2]) {
          const count = host.commits();
          await host.interact(() => native(numeric, scalar, "input"));
          expect(host.commits()).toBe(count);
          await host.interact(() => key(numeric, "Enter"));
          await host.interact(() => numeric.dispatchEvent(new Event("blur")));
          expect(host.commits()).toBe(count + 1);
          const defined = definitionOf(host.current());
          expect(defined.channels[index]).toBe(
            Math.min(Number(range.max), Math.max(Number(range.min), scalar)),
          );
          expect(defined.channels[other]).toBe(original.channels[other]);
          expect(input(host.element, coordinate)).toBe(range);
          expect(input(host.element, coordinate, "number")).toBe(numeric);
        }
        await host.dispose();
      },
    );
    it("retains overflow and unavailable values without authoring, with independent sibling recovery", async () => {
      const host = await mount(lab(0.5, 0.1));
      expect(host.changes()).toBe(0);
      expect(host.element.textContent).not.toContain("Authored a is outside");
      expect(host.element.textContent).not.toContain("Authored b is outside");
      const a = input(host.element, "a");
      const b = input(host.element, "b");
      expect(input(host.element, "a", "number").value).toBe("0.5000");
      expect(a.closest("[data-gp-channel]")?.getAttribute("data-gp-overflow")).toBe("true");
      expect(a.valueAsNumber).toBe(Number(a.max));
      expect(a.getAttribute("aria-valuetext")).toContain("0.5000 (outside direct range)");
      expect(b.disabled).toBe(true);
      expect(b.hasAttribute("min")).toBe(false);
      expect(b.hasAttribute("max")).toBe(false);
      expect(input(host.element, "b", "number").readOnly).toBe(true);
      expect(input(host.element, "b", "number").value).toBe("0.1000");
      expect(host.element.textContent).toContain("Direct b editing is unavailable");
      for (const coordinate of ["l", "b"]) {
        const row = host.element.querySelector(`[data-gp-channel="${coordinate}"]`)!;
        const help = row.querySelector('[data-gp-visually-hidden][id$="-help"]')!;
        expect(help).not.toBeNull();
        for (const control of row.querySelectorAll("input"))
          expect(control.getAttribute("aria-describedby")?.split(" ")).toContain(help.id);
      }
      expect(
        a.closest("[data-gp-channel]")?.querySelector('[data-gamut-warning="linear"]'),
      ).toBeNull();
      expect(
        b.closest("[data-gp-channel]")?.querySelector('[data-gamut-warning="linear"]'),
      ).toBeNull();
      await host.interact(() => native(a, 0));
      expect(definitionOf(host.current()).channels).toEqual([0.68, 0, 0.1]);
      expect(b.disabled).toBe(false);
      expect(input(host.element, "b")).toBe(b);
      await host.dispose();
    });
    it("shows exact warnings on all truthful positions and keeps controls through comparison changes", async () => {
      const host = await mount(lab());
      expect(host.element.querySelectorAll('[data-gamut-warning="linear"]')).toHaveLength(3);
      const a = input(host.element, "a");
      for (const state of [
        { ...directState, checkedGamuts: [] },
        { ...directState, referenceGamutId: null },
        { ...directState, visibleGuides: ["srgb-boundary"] as const },
      ]) {
        await host.state(state);
        expect(input(host.element, "a")).toBe(a);
        if (!state.checkedGamuts.length || state.referenceGamutId === null)
          expect(host.element.querySelectorAll('[data-gamut-warning="linear"]')).toHaveLength(0);
      }
      await host.replace(lab(0, 0));
      expect(host.element.querySelectorAll('[data-gamut-warning="linear"]')).toHaveLength(0);
      expect(host.changes()).toBe(0);
      await host.dispose();
    });
    it.each(["bounds", "sign", "inspect"])(
      "interrupts pending range and numeric work on external %s change",
      async (change) => {
        const callbacks = new Map<number, FrameRequestCallback>();
        let id = 0;
        vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
          callbacks.set(++id, callback);
          return id;
        });
        vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
          callbacks.delete(id);
        });
        const host = await mount(lab());
        const range = input(host.element, "a");
        const numeric = input(host.element, "a", "number");
        await host.interact(() => {
          range.dispatchEvent(
            new PointerEvent("pointerdown", { pointerId: 1, pointerType: "mouse", button: 0 }),
          );
          native(range, 0.25, "input");
          native(numeric, 0.3, "input");
        });
        if (change === "inspect")
          await host.state({
            ...directState,
            selection: { representationId: "oklab", editorId: null },
          });
        else await host.replace(lab(0.1, change === "sign" ? -0.2 : 0.35));
        await host.interact(() => {
          for (const callback of callbacks.values()) callback(0);
          callbacks.clear();
          native(range, 0.3, "input");
          native(range, 0.3);
          key(numeric, "Enter");
        });
        expect(host.changes()).toBe(0);
        expect(host.commits()).toBe(0);
        if (change !== "inspect") {
          expect(input(host.element, "a")).toBe(range);
          expect(numeric.value).toBe("0.1000");
          await host.interact(() => key(range, "Home"));
          expect(host.commits()).toBe(1);
        }
        await host.dispose();
        vi.restoreAllMocks();
      },
    );
  });
}
