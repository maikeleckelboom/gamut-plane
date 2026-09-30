import { describe, expect, it } from "vitest";
import { createColorValue, definitionOf, type ColorValue } from "@gamut-plane/core";
import type { GamutPlaneState } from "../src/index.js";

export type GamutHost = {
  element: Element;
  /** Proposed states. A controlled host never accepts them unless `update` is called. */
  requests(): readonly GamutPlaneState[];
  update(state: GamutPlaneState): Promise<void>;
  interact(action: () => void): Promise<void>;
  /** Authored ColorValue deliveries of any kind. */
  changes(): number;
  dispose(): Promise<void>;
};
type Mount = (
  value: ColorValue,
  state: GamutPlaneState,
  options?: Readonly<{ readOnly?: boolean }>,
) => Promise<GamutHost>;

const created = createColorValue({ space: "oklch", channels: [0.68, 0.18, 252], alpha: 0.37 });
if (!created.ok) throw new Error("Invalid fixture");
const value = created.value;
const cleared: GamutPlaneState = {
  selection: { representationId: "oklch", editorId: "oklch-lc" },
  checkedGamuts: [],
  visibleGuides: [],
  referenceGamutId: null,
};
const input = (root: Element, label: string) =>
  root.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
const radio = (root: Element, value: string) =>
  root.querySelector<HTMLInputElement>(
    `[data-gp-part="reference-choice"] input[value="${value}"]`,
  )!;
const trigger = (root: Element) =>
  root.querySelector<HTMLButtonElement>('[data-gp-part="gamut-trigger"]')!;
const popup = (root: Element) => root.querySelector<HTMLElement>('[data-gp-part="gamut-popup"]')!;
const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, " ").trim();

export function gamutContract(mount: Mount) {
  describe("Gamuts shell adapter contract", () => {
    it("renders a closed Reference-first trigger and a named nonmodal surface", async () => {
      const host = await mount(value, { ...cleared, referenceGamutId: "srgb-gamut" });
      try {
        const button = trigger(host.element);
        expect(button.type).toBe("button");
        expect(button.disabled).toBe(false);
        expect(button.getAttribute("aria-expanded")).toBe("false");
        expect(button.getAttribute("aria-haspopup")).toBe("dialog");
        const surface = popup(host.element);
        expect(button.getAttribute("aria-controls")).toBe(surface.id);
        expect(surface.hidden).toBe(true);
        expect(surface.getAttribute("role")).toBe("dialog");
        expect(surface.getAttribute("aria-modal")).toBeNull();
        const name = (element: Element, attribute: string) =>
          element
            .getAttribute(attribute)!
            .split(" ")
            .map((id) => text(host.element.ownerDocument.getElementById(id)))
            .filter(Boolean)
            .join(" ");
        expect(name(button, "aria-labelledby")).toBe("Gamuts");
        expect(name(surface, "aria-labelledby")).toBe("Gamuts");
        expect(name(button, "aria-describedby")).toBe("Reference sRGB, Status off");
        expect(text(button.querySelector('[data-gp-part="gamut-summary"]'))).toBe(
          "Reference sRGB · Status off",
        );
        expect(host.element.querySelectorAll('[data-gp-part="exact-result"]')).toHaveLength(0);
        expect(
          host.element.querySelector('[role="radiogroup"][data-gp-part="reference-choice"]'),
        ).not.toBeNull();
        expect(host.element.querySelectorAll('[role="application"]')).toHaveLength(1);
        await host.interact(() => button.click());
        expect(button.getAttribute("aria-expanded")).toBe("true");
        expect(surface.hidden).toBe(false);
        await host.interact(() =>
          surface.querySelector<HTMLButtonElement>("[data-gp-close]")!.click(),
        );
        expect(surface.hidden).toBe(true);
        expect(host.requests()).toEqual([]);
        expect(host.changes()).toBe(0);
      } finally {
        await host.dispose();
      }
    });

    it("keeps rejected Status, Boundary and Reference requests at accepted state, then follows delayed acceptance", async () => {
      const host = await mount(value, cleared);
      try {
        await host.interact(() => trigger(host.element).click());
        const status = input(host.element, "sRGB Status");
        const boundary = input(host.element, "sRGB Boundary");
        await host.interact(() => status.click());
        expect(host.requests().at(-1)).toEqual({ ...cleared, checkedGamuts: ["srgb-gamut"] });
        expect(status.checked).toBe(false);
        await host.interact(() => boundary.click());
        expect(host.requests().at(-1)).toEqual({ ...cleared, visibleGuides: ["srgb-boundary"] });
        expect(boundary.checked).toBe(false);
        await host.interact(() => radio(host.element, "display-p3-gamut").click());
        expect(host.requests().at(-1)).toEqual({
          ...cleared,
          referenceGamutId: "display-p3-gamut",
        });
        expect(
          [...host.element.querySelectorAll<HTMLInputElement>('[type="radio"][value]')]
            .filter((choice) => choice.name.endsWith("-reference"))
            .map((choice) => [choice.value, choice.checked]),
        ).toEqual([
          ["srgb-gamut", false],
          ["display-p3-gamut", false],
          ["none", true],
        ]);
        expect(host.requests()).toHaveLength(3);
        expect(host.element.querySelectorAll('[data-gp-part="exact-result"]')).toHaveLength(0);

        // Delayed acceptance of the first request; later requests build on it.
        const accepted = host.requests()[0]!;
        await host.update(accepted);
        expect(status.checked).toBe(true);
        expect(boundary.checked).toBe(false);
        expect(radio(host.element, "none").checked).toBe(true);
        expect(trigger(host.element).getAttribute("aria-expanded")).toBe("true");
        expect(
          host.element.querySelector('[data-gp-part="exact-result"][data-gp-gamut="srgb-gamut"]')
            ?.textContent,
        ).toBe("Outside");
        await host.interact(() => radio(host.element, "srgb-gamut").click());
        expect(host.requests().at(-1)).toEqual({ ...accepted, referenceGamutId: "srgb-gamut" });
        await host.update(host.requests().at(-1)!);
        expect(radio(host.element, "srgb-gamut").checked).toBe(true);
        expect(text(trigger(host.element).querySelector('[data-gp-part="gamut-summary"]'))).toBe(
          "Reference sRGB · Outside",
        );
        expect(host.changes()).toBe(0);
      } finally {
        await host.dispose();
      }
    });

    it("keeps direct controls, draft and color untouched through open, close and comparison changes", async () => {
      const before = definitionOf(value);
      const host = await mount(value, { ...cleared, referenceGamutId: "srgb-gamut" });
      try {
        const nodes = () => [
          host.element.querySelector('[aria-label="Chroma numeric value"]'),
          host.element.querySelector('[data-gp-channel="h"] input[type="range"]'),
          host.element.querySelector('[data-gp-part="surface"]'),
        ];
        const original = nodes();
        expect(original.every(Boolean)).toBe(true);
        const draft = original[0] as HTMLInputElement;
        await host.interact(() => {
          draft.value = "0.12345";
          draft.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await host.interact(() => trigger(host.element).click());
        for (const label of ["sRGB Status", "sRGB Boundary", "Display P3 Status"]) {
          await host.interact(() => input(host.element, label).click());
          await host.update(host.requests().at(-1)!);
        }
        await host.interact(() => radio(host.element, "none").click());
        await host.update(host.requests().at(-1)!);
        await host.interact(() =>
          popup(host.element).dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
          ),
        );
        expect(popup(host.element).hidden).toBe(true);
        expect(nodes()).toEqual(original);
        expect(draft.value).toBe("0.12345");
        expect(host.requests().at(-1)).toMatchObject({
          checkedGamuts: ["display-p3-gamut", "srgb-gamut"],
          visibleGuides: ["srgb-boundary"],
          referenceGamutId: null,
        });
        expect(host.changes()).toBe(0);
        expect(definitionOf(value)).toEqual(before);
      } finally {
        await host.dispose();
      }
    });

    it("keeps read-only state inspectable without disabling color editing", async () => {
      const host = await mount(
        value,
        { ...cleared, checkedGamuts: ["srgb-gamut"], referenceGamutId: "srgb-gamut" },
        { readOnly: true },
      );
      try {
        const button = trigger(host.element);
        expect(button.disabled).toBe(false);
        await host.interact(() => button.click());
        expect(popup(host.element).hidden).toBe(false);
        const surface = popup(host.element);
        expect(
          text(
            host.element.ownerDocument.getElementById(surface.getAttribute("aria-describedby")!),
          ),
        ).toBe("Read-only");
        const controls = [...surface.querySelectorAll("input")];
        expect(controls).toHaveLength(7);
        expect(controls.every((control) => control.disabled)).toBe(true);
        expect(input(host.element, "sRGB Status").checked).toBe(true);
        expect(radio(host.element, "srgb-gamut").checked).toBe(true);
        expect(text(surface.querySelector('[data-gp-part="exact-result"]'))).toBe("Outside");
        await host.interact(() => input(host.element, "Display P3 Status").click());
        expect(input(host.element, "Display P3 Status").checked).toBe(false);
        expect(host.requests()).toEqual([]);
        const chroma = host.element.querySelector<HTMLInputElement>(
          '[aria-label="Chroma numeric value"]',
        )!;
        expect(chroma.disabled).toBe(false);
        await host.interact(() => {
          chroma.value = "0.1";
          chroma.dispatchEvent(new Event("input", { bubbles: true }));
          chroma.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
          );
        });
        expect(host.changes()).toBeGreaterThan(0);
      } finally {
        await host.dispose();
      }
    });

    it.each(["srgb", "display-p3"] as const)(
      "retains paused Boundary requests while inspecting %s",
      async (representationId) => {
        const inspecting: GamutPlaneState = {
          selection: { representationId, editorId: null },
          checkedGamuts: ["display-p3-gamut", "srgb-gamut"],
          visibleGuides: ["display-p3-boundary", "srgb-boundary"],
          referenceGamutId: "display-p3-gamut",
        };
        const host = await mount(value, inspecting);
        try {
          await host.interact(() => trigger(host.element).click());
          const boundary = input(host.element, "sRGB Boundary");
          expect(boundary.checked).toBe(true);
          expect(boundary.disabled).toBe(false);
          expect(
            text(
              host.element.ownerDocument.getElementById(boundary.getAttribute("aria-describedby")!),
            ),
          ).toBe("Paused: Requested boundary appears when editing a color space.");
          expect(host.element.querySelectorAll('[data-gp-part="exact-result"]')).toHaveLength(2);
          await host.interact(() => boundary.click());
          expect(host.requests().at(-1)?.visibleGuides).toEqual(["display-p3-boundary"]);
          await host.interact(() => input(host.element, "sRGB Status").click());
          expect(host.requests().at(-1)?.checkedGamuts).toEqual(["display-p3-gamut"]);
          await host.interact(() => radio(host.element, "srgb-gamut").click());
          expect(host.requests().at(-1)?.referenceGamutId).toBe("srgb-gamut");
          await host.update({
            ...inspecting,
            selection: { representationId: "oklch", editorId: "oklch-lc" },
          });
          expect(host.element.querySelectorAll("[data-gamut-boundary]")).toHaveLength(2);
          expect(input(host.element, "sRGB Boundary").getAttribute("aria-describedby")).toBeNull();
          expect(host.changes()).toBe(0);
        } finally {
          await host.dispose();
        }
      },
    );
  });
}
