import { describe, expect, it } from "vitest";
import { createColorValue, definitionOf, type ColorValue } from "@gamut-plane/core";
import { analyzeRequestedGamuts } from "@gamut-plane/core/internal/capabilities";
import type { GamutPlaneState } from "../src/index.js";

type Host = {
  element: Element;
  update(state: GamutPlaneState): Promise<void>;
  dispose(): Promise<void>;
  changes(): number;
  interact(action: () => void): Promise<void>;
};
const created = createColorValue({ space: "oklch", channels: [0.68, 0.18, 252], alpha: 0.37 });
if (!created.ok) throw new Error("Invalid fixture");
const value = created.value;
const initial: GamutPlaneState = {
  selection: { representationId: "oklch", editorId: "oklch-lc" },
  checkedGamuts: ["srgb-gamut", "display-p3-gamut"],
  visibleGuides: ["srgb-boundary", "display-p3-boundary"],
  referenceGamutId: "srgb-gamut",
};

export function referenceContract(
  mount: (value: ColorValue, state: GamutPlaneState) => Promise<Host>,
) {
  describe("Reference adapter contract", () => {
    it("moves the sole connector to P3 for a color outside both Reference gamuts", async () => {
      const outside = createColorValue({
        space: "oklch",
        channels: [0.68, 0.24, 252],
        alpha: 0.37,
      });
      if (!outside.ok) throw new Error("Invalid fixture");
      const host = await mount(outside.value, initial);
      try {
        const srgb = host.element
          .querySelector('[data-gp-part="reference-connector"]')
          ?.getAttribute("x2");
        await host.update({ ...initial, referenceGamutId: "display-p3-gamut" });
        const p3 = host.element
          .querySelector('[data-gp-part="reference-connector"]')
          ?.getAttribute("x2");
        expect(p3).toBeTruthy();
        expect(p3).not.toBe(srgb);
        expect(host.element.querySelectorAll('[data-gp-marker="reference"]')).toHaveLength(1);
        expect(
          host.element.querySelector('[role="application"]')?.getAttribute("aria-label"),
        ).toContain("Outside Display P3");
        expect(host.changes()).toBe(0);
      } finally {
        await host.dispose();
      }
    });

    it.each([true, false])(
      "keeps ordinary boundaries without excursion annotations for interior color, Status=%s",
      async (status) => {
        const inside = createColorValue({
          space: "oklch",
          channels: [0.68, 0.03, 252],
          alpha: 0.37,
        });
        if (!inside.ok) throw new Error("Invalid fixture");
        const host = await mount(inside.value, {
          ...initial,
          checkedGamuts: status ? initial.checkedGamuts : [],
        });
        try {
          expect(
            host.element.querySelectorAll(
              '[data-gp-part="reference-connector"], [data-gp-marker="reference"]',
            ),
          ).toHaveLength(0);
          expect(host.element.querySelectorAll("[data-gamut-warning]")).toHaveLength(0);
          expect(host.element.querySelectorAll("[data-gamut-boundary]")).toHaveLength(2);
          expect(host.element.querySelector("[data-active-marker]")).not.toBeNull();
        } finally {
          await host.dispose();
        }
      },
    );
    it.each([
      ["inside", [0.3, 0.5, 0.5]],
      ["within-tolerance", [-1e-10, 0.5, 0.5]],
      ["outside", [-0.1, 0.5, 0.5]],
    ] as const)(
      "Status gates only exact outside annotations while preserving boundaries, Reference and authored %s color",
      async (status, channels) => {
        const created = createColorValue({ space: "srgb", channels, alpha: 0.37 });
        if (!created.ok) throw new Error("Invalid fixture");
        const source = created.value;
        const before = definitionOf(source);
        expect(analyzeRequestedGamuts(source, ["srgb-gamut"])[0]?.result).toMatchObject({
          ok: true,
          value: { status },
        });
        const host = await mount(source, initial);
        try {
          const connector = host.element.querySelector('[data-gp-part="reference-connector"]');
          const marker = host.element.querySelector('[data-gp-marker="reference"]');
          expect(Boolean(connector)).toBe(status === "outside");
          expect(Boolean(marker)).toBe(status === "outside");
          const endpoint = [connector?.getAttribute("x2"), connector?.getAttribute("y2")];
          const swatch = marker?.outerHTML;
          const boundaries = () =>
            Array.from(
              host.element.querySelectorAll(
                '[data-gamut-boundary], [data-gp-part="gamut-interval"]',
              ),
              (element) => element.outerHTML,
            );
          const ordinary = boundaries();
          for (const checkedGamuts of [[], initial.checkedGamuts]) {
            await host.update({ ...initial, checkedGamuts });
            const show = status === "outside" && checkedGamuts.length > 0;
            const current = host.element.querySelector('[data-gp-part="reference-connector"]');
            const currentMarker = host.element.querySelector('[data-gp-marker="reference"]');
            expect(Boolean(current)).toBe(show);
            expect(Boolean(currentMarker)).toBe(show);
            if (show) {
              expect([current?.getAttribute("x2"), current?.getAttribute("y2")]).toEqual(endpoint);
              expect(currentMarker?.outerHTML).toBe(swatch);
            }
            expect(boundaries()).toEqual(ordinary);
            expect(
              host.element.querySelector<HTMLInputElement>(
                '[data-gp-part="reference-choice"] [value="srgb-gamut"]',
              )?.checked,
            ).toBe(true);
            expect(host.element.querySelectorAll('[data-gamut-warning="planar"]')).toHaveLength(
              show ? 1 : 0,
            );
            expect(host.element.querySelectorAll('[data-gamut-warning="linear"]')).toHaveLength(
              show ? 3 : 0,
            );
            expect(host.changes()).toBe(0);
            expect(definitionOf(source)).toEqual(before);
          }
        } finally {
          await host.dispose();
        }
      },
    );
    it("preserves a numeric draft and its DOM identity through Reference-only changes", async () => {
      const host = await mount(value, initial);
      try {
        const input = host.element.querySelector<HTMLInputElement>(
          '[aria-label="Chroma numeric value"]',
        )!;
        await host.interact(() => {
          input.value = "0.12345";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        await host.update({ ...initial, referenceGamutId: "display-p3-gamut" });
        expect(host.element.querySelector('[aria-label="Chroma numeric value"]')).toBe(input);
        expect(input.value).toBe("0.12345");
        expect(host.changes()).toBe(0);
        await host.interact(() =>
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })),
        );
        expect(host.changes()).toBe(1);
      } finally {
        await host.dispose();
      }
    });
    it.each([
      [true, true],
      [false, true],
      [true, false],
      [false, false],
    ])(
      "independent sRGB Status=%s Boundary=%s preserves authored color",
      async (status, boundary) => {
        const state: GamutPlaneState = {
          ...initial,
          checkedGamuts: status ? ["srgb-gamut"] : [],
          visibleGuides: boundary ? ["srgb-boundary"] : [],
        };
        const before = definitionOf(value);
        const host = await mount(value, state);
        try {
          expect(
            host.element.querySelectorAll('[data-gp-part="reference-connector"]'),
          ).toHaveLength(status && boundary ? 1 : 0);
          expect(host.element.querySelectorAll('[data-gp-marker="reference"]')).toHaveLength(
            status && boundary ? 1 : 0,
          );
          expect(host.element.querySelectorAll("[data-gamut-boundary]")).toHaveLength(
            boundary ? 1 : 0,
          );
          expect(host.element.querySelectorAll('[data-gamut-warning="planar"]')).toHaveLength(
            status ? 1 : 0,
          );
          expect(host.element.querySelectorAll('[data-gamut-warning="linear"]')).toHaveLength(
            status ? 3 : 0,
          );
          expect(
            host.element
              .querySelector('[role="application"]')
              ?.getAttribute("aria-label")
              ?.includes("Outside sRGB"),
          ).toBe(status);
          expect(
            host.element.querySelector<HTMLInputElement>(
              '[data-gp-part="reference-choice"] [value="srgb-gamut"]',
            )?.checked,
          ).toBe(true);
          expect(host.element.querySelectorAll('[data-gp-part="exact-result"]')).toHaveLength(
            status ? 1 : 0,
          );
          expect(host.changes()).toBe(0);
          expect(definitionOf(value)).toEqual(before);
        } finally {
          await host.dispose();
        }
      },
    );

    it("switches one mapped endpoint, follows only its exact status, and can clear Reference", async () => {
      const host = await mount(value, initial);
      try {
        const srgb = host.element
          .querySelector('[data-gp-part="reference-connector"]')
          ?.getAttribute("x2");
        await host.update({ ...initial, referenceGamutId: "display-p3-gamut" });
        expect(srgb).toBeTruthy();
        expect(
          host.element.querySelectorAll(
            '[data-gp-part="reference-connector"], [data-gp-marker="reference"]',
          ),
        ).toHaveLength(0);
        expect(host.element.querySelectorAll("[data-gamut-warning]")).toHaveLength(0);
        await host.update({ ...initial, referenceGamutId: null });
        expect(
          host.element.querySelectorAll(
            '[data-gp-part="reference-connector"], [data-gp-marker="reference"], [data-gamut-warning]',
          ),
        ).toHaveLength(0);
        expect(host.element.querySelectorAll("[data-gamut-boundary]")).toHaveLength(2);
        expect(host.element.querySelectorAll('[data-gp-part="exact-result"]')).toHaveLength(2);
        expect(host.changes()).toBe(0);
      } finally {
        await host.dispose();
      }
    });

    it.each(["srgb", "display-p3"] as const)(
      "remembers Reference through %s inspection and back to OKLab",
      async (representationId) => {
        const host = await mount(value, initial);
        try {
          await host.update({ ...initial, selection: { representationId, editorId: null } });
          expect(
            host.element.querySelectorAll(
              '[data-picker-plane], [data-gp-part="reference-connector"]',
            ),
          ).toHaveLength(0);
          expect(
            host.element.querySelector<HTMLInputElement>(
              '[data-gp-part="reference-choice"] [value="srgb-gamut"]',
            )?.checked,
          ).toBe(true);
          expect(host.element.querySelectorAll('[data-gp-part="exact-result"]')).toHaveLength(2);
          await host.update({
            ...initial,
            selection: { representationId: "oklab", editorId: "oklab-ab" },
          });
          expect(host.element.querySelectorAll('[data-gp-marker="reference"]')).toHaveLength(1);
          expect(host.element.querySelectorAll('[data-gamut-warning="linear"]')).toHaveLength(3);
          const line = host.element.querySelector('[data-gp-part="reference-connector"]')!;
          expect(line.getAttribute("x1")).not.toBe(line.getAttribute("x2"));
          expect(line.getAttribute("y1")).not.toBe(line.getAttribute("y2"));
          expect(host.changes()).toBe(0);
        } finally {
          await host.dispose();
        }
      },
    );
  });
}
