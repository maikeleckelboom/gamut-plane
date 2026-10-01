import { describe, expect, it, vi } from "vitest";
import { createColorValue, definitionOf, represent, type ColorValue } from "@gamut-plane/core";
import type { GamutPlaneState } from "../src/index.js";

export function rgbState(space: "srgb" | "display-p3"): GamutPlaneState {
  return {
    selection:
      space === "srgb"
        ? { representationId: space, editorId: "srgb-rg" }
        : { representationId: space, editorId: "display-p3-rg" },
    checkedGamuts: ["srgb-gamut"],
    visibleGuides: ["srgb-boundary"],
    referenceGamutId: "srgb-gamut",
  };
}
export function rgb(
  space: "srgb" | "display-p3" = "srgb",
  channels: readonly [number, number, number] = [1.2, 0.4, -0.1],
) {
  const created = createColorValue({ space, channels, alpha: 0.37 });
  if (!created.ok) throw Error("fixture");
  return created.value;
}
export interface RgbHost {
  element: Element;
  current(): ColorValue;
  changes(): number;
  commits(): number;
  requests(): readonly GamutPlaneState[];
  replace(value: ColorValue): Promise<void>;
  state(state: GamutPlaneState): Promise<void>;
  interact(action: () => void): Promise<void>;
  resize(): Promise<void>;
  dispose(): Promise<void>;
}
export interface RgbHostOptions {
  acceptColor?: boolean;
  acceptState?: boolean;
  readOnlyState?: boolean;
}
function scalar(host: RgbHost, channel: string, type = "number") {
  return host.element.querySelector<HTMLInputElement>(
    `[data-gp-channel="${channel}"] input[type="${type}"]`,
  )!;
}
function key(element: Element, value: string) {
  element.dispatchEvent(
    new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }),
  );
}
function numeric(element: HTMLInputElement, value: number) {
  element.value = String(value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  key(element, "Enter");
}
function marker(host: RgbHost) {
  return host.element.querySelector<HTMLElement>("[data-active-marker]")!;
}
function selector(host: RgbHost, suffix: string) {
  return host.element.querySelector<HTMLButtonElement>(`[role=combobox][id$="-${suffix}"]`)!;
}
function pointer(element: Element, type: string) {
  element.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
      buttons: type === "pointerup" ? 0 : 1,
      clientX: 80,
      clientY: 96,
      bubbles: true,
    }),
  );
}

/** Delivery and adapter markup sentinels; core owns the exhaustive six-binding operation matrix. */
export function rgbEditingContract(
  mount: (value: ColorValue, state: GamutPlaneState, options?: RgbHostOptions) => Promise<RgbHost>,
) {
  describe("native RGB adapter contract", () => {
    it.each(["srgb", "display-p3"] as const)(
      "presents %s resolved full/partial/empty guides without pausing or reauthoring",
      async (space) => {
        const initial = rgb(space, [0.95, 0.1, 0.4]);
        const state = {
          ...rgbState(space),
          visibleGuides: ["srgb-boundary", "display-p3-boundary"] as const,
        };
        const host = await mount(initial, state);
        if (space === "display-p3") {
          expect(
            host.element.querySelector("[role=application]")?.getAttribute("aria-label"),
          ).toContain("Outside sRGB");
          expect(
            host.element.querySelector(
              '[data-gp-marker="reference"], [data-gp-part="reference-connector"]',
            ),
          ).toBeNull();
        }
        const intervals = () =>
          [...host.element.querySelectorAll('[data-gp-part="gamut-interval"]')].map((node) => [
            node.closest("[data-gp-channel]")?.getAttribute("data-gp-channel"),
            node.getAttribute("data-gp-gamut"),
            node.getAttribute("data-range-start"),
            node.getAttribute("data-range-end"),
          ]);
        const before = intervals();
        expect(before.length).toBeGreaterThan(3);
        expect(new Set(before.map((row) => row[0]))).toEqual(new Set(["r", "g", "b"]));
        for (const area of ["rb", "gb", "rg"] as const) {
          const selection: GamutPlaneState["selection"] =
            space === "srgb"
              ? { representationId: space, editorId: `srgb-${area}` }
              : { representationId: space, editorId: `display-p3-${area}` };
          await host.state({ ...state, selection });
          expect(intervals()).toEqual(before);
          expect(host.element.querySelectorAll("[data-gamut-boundary]")).toHaveLength(2);
          expect(host.element.textContent).not.toContain("Paused");
        }
        await host.replace(rgb(space, [0.2, 0.4, -0.1]));
        const same = space === "srgb" ? "srgb" : "display-p3";
        expect(host.element.querySelector(`[data-gamut-boundary="${same}"]`)).toBeNull();
        expect(host.element.textContent).not.toContain("Paused");
        expect(scalar(host, "r", "range").disabled).toBe(false);
        expect(host.changes()).toBe(0);
        await host.dispose();
      },
    );

    it("retains point and line contours and zero-length channel facts without pausing", async () => {
      const host = await mount(rgb("display-p3", [0.8, 0, 0]), rgbState("display-p3"));
      const point = host.element.querySelector('[data-gp-channel="r"] [data-range-point]');
      expect(point?.getAttribute("data-range-start")).toBe("0");
      expect(point?.getAttribute("data-range-end")).toBe("0");
      const boundary = () =>
        host.element.querySelector('[data-gamut-boundary="srgb"]')?.getAttribute("d");
      expect(boundary()).toMatch(/^M .+ L .+$/);
      expect(host.element.textContent).not.toContain("Paused");
      expect(scalar(host, "r", "range").disabled).toBe(false);
      await host.replace(rgb("display-p3", [1, 1, 0.5]));
      await host.state({
        ...rgbState("display-p3"),
        selection: { representationId: "display-p3", editorId: "display-p3-rb" },
      });
      expect(boundary()).toMatch(/^M .+ L .+$/);
      expect(host.element.textContent).not.toContain("Paused");
      expect(host.changes()).toBe(0);
      await host.dispose();
    });
    it.each(["srgb", "display-p3"] as const)(
      "delivers finite extended %s scalar edits with untouched siblings and alpha",
      async (space) => {
        const host = await mount(rgb(space), rgbState(space));
        expect(
          [...host.element.querySelectorAll("[data-gp-part=channel-symbol]")].map((node) =>
            node.textContent?.trim(),
          ),
        ).toEqual(["R", "G", "B"]);
        expect(host.changes()).toBe(0);
        expect(marker(host).style.left).toBe("120%");
        expect(marker(host).style.top).toBe("60%");
        expect(
          host.element.querySelector("[role=application]")?.getAttribute("aria-label"),
        ).toContain("marker may be clipped");
        expect(
          host.element.querySelector("[role=application]")?.getAttribute("aria-label"),
        ).toContain("Outside");
        expect(
          host.element.querySelector(
            '[data-gp-part="reference-connector"], [data-gp-marker="reference"]',
          ),
        ).toBeNull();
        expect(
          host.element.querySelector('[data-gp-channel="r"] [data-gamut-warning="linear"]'),
        ).toBeNull();
        const green = scalar(host, "g");
        expect([green.min, green.max, green.step, green.value]).toEqual([
          "",
          "",
          "0.001",
          "0.4000",
        ]);
        const range = scalar(host, "g", "range");
        expect([range.min, range.max, range.disabled]).toEqual(["0", "1", false]);
        for (const next of [-0.123456789, 1.234567891]) {
          const commits = host.commits();
          await host.interact(() => numeric(green, next));
          expect(definitionOf(host.current())).toEqual({
            space,
            channels: [1.2, next, -0.1],
            alpha: 0.37,
          });
          expect(host.commits()).toBe(commits + 1);
          expect(scalar(host, "g")).toBe(green);
          expect(range.valueAsNumber).toBe(next < 0 ? 0 : 1);
          expect(range.getAttribute("aria-valuetext")).toContain("outside direct range");
        }
        await host.interact(() => {
          range.value = "0.6";
          range.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(definitionOf(host.current())).toEqual({
          space,
          channels: [1.2, 0.6, -0.1],
          alpha: 0.37,
        });
        // A sibling edit reconciles a draft via operation inputs; comparison changes leave it alone.
        await host.interact(() => {
          green.value = "0.7777777";
          green.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await host.state({
          ...rgbState(space),
          checkedGamuts: [],
          referenceGamutId: null,
          visibleGuides: [],
        });
        expect(green.value).toBe("0.7777777");
        await host.replace(rgb(space, [1.3, 0.6, -0.1]));
        expect(green.value).toBe("0.6000");
        await host.dispose();
      },
    );

    it("observes the destination RGB encoding before scalar authorship", async () => {
      const initial = rgb("display-p3", [0.7, 0.3, 0.2]);
      const observation = represent(initial, "srgb");
      if (!observation.ok) throw Error("fixture");
      const host = await mount(initial, rgbState("srgb"));
      await host.interact(() => numeric(scalar(host, "r"), -0.25));
      expect(definitionOf(host.current())).toEqual({
        space: "srgb",
        channels: [-0.25, observation.value.channels[1], observation.value.channels[2]],
        alpha: 0.37,
      });
      await host.dispose();
    });

    it("keeps native fields and scalar authorship available when perceptual observation and exact checks fail", async () => {
      const host = await mount(rgb("srgb", [1.2, 0.4, 1e308]), rgbState("srgb"));
      expect(host.element.querySelector("canvas")).not.toBeNull();
      expect(host.element.querySelector('[data-gp-part="exact-result"]')?.textContent).toContain(
        "Unavailable",
      );
      await host.interact(() => numeric(scalar(host, "g"), -0.2));
      expect(definitionOf(host.current())).toEqual({
        space: "srgb",
        channels: [1.2, -0.2, 1e308],
        alpha: 0.37,
      });
      expect(host.commits()).toBe(1);
      await host.dispose();
    });

    it("uses production Area choices, preferred re-entry and controlled/read-only acceptance", async () => {
      const value = rgb();
      const host = await mount(value, rgbState("srgb"));
      await host.interact(() => {
        selector(host, "area").click();
        host.element.querySelector<HTMLElement>('[role=option][data-value="srgb-gb"]')!.click();
      });
      expect(selector(host, "area").textContent).toContain("G / B");
      expect(
        host.element.querySelector("[data-geometry-id]")?.getAttribute("data-geometry-id"),
      ).toBe("srgb-gb-rectangle");
      expect(
        [...host.element.querySelectorAll("[data-gp-part=channel-symbol]")].map((node) =>
          node.textContent?.trim(),
        ),
      ).toEqual(["R", "G", "B"]);
      await host.interact(() =>
        host.element.querySelector<HTMLInputElement>('input[type=radio][value="inspect"]')!.click(),
      );
      await host.interact(() =>
        host.element.querySelector<HTMLInputElement>('input[type=radio][value="edit"]')!.click(),
      );
      expect(selector(host, "area").textContent).toContain("R / G");
      expect(host.current()).toBe(value);
      expect(host.changes()).toBe(0);
      await host.dispose();
      const rejected = await mount(value, rgbState("srgb"), { acceptState: false });
      await rejected.interact(() => {
        selector(rejected, "area").click();
        rejected.element.querySelector<HTMLElement>('[role=option][data-value="srgb-rb"]')!.click();
      });
      expect(rejected.requests().at(-1)?.selection.editorId).toBe("srgb-rb");
      expect(selector(rejected, "area").textContent).toContain("R / G");
      await rejected.dispose();
      const readOnly = await mount(value, rgbState("srgb"), { readOnlyState: true });
      expect(selector(readOnly, "area").disabled).toBe(true);
      expect(scalar(readOnly, "g").readOnly).toBe(false);
      await readOnly.dispose();
    });

    it("restores raw authored RGB placement after cancellation, rejection, reconciliation and resize", async () => {
      const callbacks = new Map<number, FrameRequestCallback>();
      let id = 0;
      vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
        callbacks.set(++id, callback);
        return id;
      });
      vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
        callbacks.delete(id);
      });
      const host = await mount(rgb(), rgbState("srgb"), { acceptColor: false });
      const surface = host.element.querySelector<HTMLElement>("[role=application]")!;
      const raw = () => {
        expect(marker(host).style.left).toBe("120%");
        expect(marker(host).style.top).toBe("60%");
      };
      raw();
      await host.interact(() => pointer(surface, "pointerdown"));
      expect(marker(host).style.left).toBe("25%");
      await host.interact(() => key(surface, "Escape"));
      raw();
      await host.interact(() => {
        pointer(surface, "pointerdown");
        pointer(surface, "pointerup");
      });
      raw();
      expect(host.commits()).toBe(1);
      await host.resize();
      raw();
      await host.replace(rgb("srgb", [1.4, -0.2, 1.1]));
      expect(parseFloat(marker(host).style.left)).toBe(140);
      expect(parseFloat(marker(host).style.top)).toBe(120);
      await host.state({ ...rgbState("srgb"), checkedGamuts: [], referenceGamutId: null });
      expect(parseFloat(marker(host).style.left)).toBe(140);
      await host.replace(rgb("srgb", [1e308, -1e308, 0.1]));
      expect(parseFloat(marker(host).style.left)).toBeGreaterThan(140);
      expect(parseFloat(marker(host).style.top)).toBeGreaterThan(120);
      await host.resize();
      expect(parseFloat(marker(host).style.left)).toBeGreaterThan(140);
      expect(parseFloat(marker(host).style.top)).toBeGreaterThan(120);
      await host.dispose();
      vi.restoreAllMocks();
    });
  });
}
