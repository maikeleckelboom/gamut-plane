import { describe, expect, it } from "vitest";
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
function input(root: Element, coordinate: string) {
  return root.querySelector<HTMLInputElement>(
    '[data-gp-channel="' + coordinate + '"] input[type="number"]',
  )!;
}
function key(element: Element, key: string) {
  element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}
function draft(element: HTMLInputElement, value: number) {
  element.value = String(value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
}
export function directCoordinateContract(mount: (value: ColorValue) => Promise<Host>) {
  describe("direct OKLab numeric card adapter contract", () => {
    it.each(["a", "b"] as const)(
      "%s bounded and precise completion preserves other coordinates and alpha exactly",
      async (coordinate) => {
        const host = await mount(lab());
        const numeric = input(host.element, coordinate);
        const index = coordinate === "a" ? 1 : 2;
        const other = coordinate === "a" ? 2 : 1;
        const original = definitionOf(host.current());
        const bounds = [numeric.min, numeric.max];
        expect(host.element.querySelectorAll('[data-gp-control="card"]')).toHaveLength(2);
        expect(host.element.querySelectorAll('input[type="range"]')).toHaveLength(1);
        expect(
          host.element.querySelectorAll('[data-gp-control="card"] input[type="range"]'),
        ).toHaveLength(0);
        expect(
          host.element.querySelector('label[for="' + numeric.id + '"]')?.textContent?.trim(),
        ).toBe(coordinate);
        for (const scalar of [0, 2, -2, 0.123456789123]) {
          const count = host.commits();
          await host.interact(() => draft(numeric, scalar));
          expect(host.commits()).toBe(count);
          await host.interact(() => key(numeric, "Enter"));
          await host.interact(() => numeric.dispatchEvent(new Event("blur")));
          expect(host.commits()).toBe(count + 1);
          const defined = definitionOf(host.current());
          expect(defined.channels[index]).toBe(
            Math.min(Number(numeric.max), Math.max(Number(numeric.min), scalar)),
          );
          expect(defined.channels[other]).toBe(original.channels[other]);
          expect(defined.channels[0]).toBe(original.channels[0]);
          expect(defined.alpha).toBe(original.alpha);
          expect(defined.space).toBe("oklab");
          expect([numeric.min, numeric.max]).toEqual(bounds);
          expect(input(host.element, coordinate)).toBe(numeric);
        }
        await host.dispose();
      },
    );
    it("retains overflow and unavailable values with independent numeric sibling recovery", async () => {
      const host = await mount(lab(0.5, 0.1));
      const a = input(host.element, "a"),
        b = input(host.element, "b");
      expect(host.changes()).toBe(0);
      expect(a.value).toBe("0.5000");
      expect(a.closest("[data-gp-channel]")?.getAttribute("data-gp-overflow")).toBe("true");
      expect(b.readOnly).toBe(true);
      expect(b.hasAttribute("min")).toBe(false);
      expect(b.hasAttribute("max")).toBe(false);
      expect(b.value).toBe("0.1000");
      expect(host.element.textContent).toContain("Direct b editing is unavailable");
      for (const coordinate of ["l", "b"]) {
        const row = host.element.querySelector('[data-gp-channel="' + coordinate + '"]')!;
        const help = row.querySelector('[data-gp-visually-hidden][id$="-help"]')!;
        expect(help).not.toBeNull();
        for (const control of row.querySelectorAll("input"))
          expect(control.getAttribute("aria-describedby")?.split(" ")).toContain(help.id);
      }
      await host.interact(() => {
        draft(a, 0);
        key(a, "Enter");
      });
      expect(definitionOf(host.current()).channels).toEqual([0.68, 0, 0.1]);
      expect(b.readOnly).toBe(false);
      expect(input(host.element, "b")).toBe(b);
      await host.dispose();
    });
    it("keeps exact warnings on the plane and rail and controls through comparison changes", async () => {
      const host = await mount(lab());
      const a = input(host.element, "a");
      expect(host.element.querySelectorAll('[data-gamut-warning="linear"]')).toHaveLength(1);
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
      "invalidates a numeric draft on external %s change",
      async (change) => {
        const host = await mount(lab());
        const numeric = input(host.element, "a");
        await host.interact(() => draft(numeric, 0.3));
        if (change === "inspect")
          await host.state({
            ...directState,
            selection: { representationId: "oklab", editorId: null },
          });
        else await host.replace(lab(0.1, change === "sign" ? -0.2 : 0.35));
        await host.interact(() => key(numeric, "Enter"));
        expect(host.changes()).toBe(0);
        expect(host.commits()).toBe(0);
        if (change !== "inspect") {
          expect(input(host.element, "a")).toBe(numeric);
          expect(numeric.value).toBe("0.1000");
          await host.interact(() => {
            draft(numeric, 0);
            key(numeric, "Enter");
          });
          expect(host.commits()).toBe(1);
        }
        await host.dispose();
      },
    );
  });
}
