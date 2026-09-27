import { describe, expect, it } from "vitest";
import {
  createColorValue,
  definitionOf,
  type ColorRepresentation,
  type ColorValue,
} from "@gamut-plane/core";
import {
  currentEditorByView,
  currentViewOptions,
  editorUi,
  representationUi,
} from "../src/instrumentMetadata.js";

type View = "oklch" | "oklab";
export interface CompositionHost {
  element: Element;
  changes: ColorValue[];
  commits: ColorValue[];
  order: string[];
  run(action: () => void): Promise<void>;
  switchView(view: View): Promise<void>;
  flushFrames(): Promise<void>;
  dispose(): Promise<void>;
}

function value(definition: ColorRepresentation): ColorValue {
  const result = createColorValue(definition);
  if (!result.ok) throw new Error("Invalid composition fixture");
  return result.value;
}

function input(root: Element, selector: string): HTMLInputElement {
  const found = root.querySelector<HTMLInputElement>(selector);
  if (!found) throw new Error(`Missing control ${selector}`);
  return found;
}

/** The same native behavior contract runs through each adapter's real lifecycle and callbacks. */
export function currentCompositionContract(
  mount: (color: ColorValue, view: View) => Promise<CompositionHost>,
): void {
  describe("shared current product composition", () => {
    it.each(currentViewOptions)(
      "preserves %s selector, control order, bounds, steps and precision",
      async (view) => {
        const channels =
          view === "oklch"
            ? ([0.625123, 0.523456, 45.6789] as const)
            : ([0.625123, 0.112345, -0.212345] as const);
        const host = await mount(value({ space: view, channels, alpha: 0.37 }), view);
        try {
          const options = [...host.element.querySelectorAll('[role="radio"]')];
          expect(options.map((option) => option.textContent?.trim())).toEqual(
            currentViewOptions.map((id) => representationUi[id].label),
          );
          expect(options.map((option) => option.getAttribute("data-plane-option"))).toEqual([
            "oklch",
            "oklab",
          ]);
          const numbers = [...host.element.querySelectorAll<HTMLInputElement>('[type="number"]')];
          const ranges = [...host.element.querySelectorAll<HTMLInputElement>('[type="range"]')];
          const controls = editorUi[currentEditorByView[view]].companions;
          expect(numbers).toHaveLength(3);
          expect(ranges).toHaveLength(view === "oklch" ? 3 : 1);
          controls.forEach((control, index) => {
            const number = numbers[index]!;
            const label =
              control.controlKind === "number"
                ? control.numericLabel
                : `${control.label} numeric value`;
            expect(number.getAttribute("aria-label")).toBe(label);
            expect(number.min).toBe(String(control.numericBounds.min));
            expect(number.getAttribute("max")).toBe(
              "max" in control.numericBounds ? String(control.numericBounds.max) : null,
            );
            expect(number.step).toBe(String(control.step));
            const coordinate = view === "oklch" ? channels[[2, 0, 1][index]!]! : channels[index]!;
            expect(number.value).toBe(coordinate.toFixed(control.precision));
            if (control.controlKind === "range-and-number") {
              const range = ranges[index]!;
              expect(range.getAttribute("aria-label")).toBe(control.label);
              expect([range.min, range.max, range.step]).toEqual([
                String(control.sliderRange.min),
                String(control.sliderRange.max),
                String(control.step),
              ]);
            }
          });
          if (view === "oklch") {
            expect(ranges[2]!.value).toBe("0.4");
            expect(
              host.element.querySelector('[data-gp-channel="c"]')?.getAttribute("data-gp-overflow"),
            ).toBe("true");
          }
          expect(host.changes).toHaveLength(0);
        } finally {
          await host.dispose();
        }
      },
    );

    const bindings = [
      {
        view: "oklch",
        channelId: "oklch.h",
        operationId: "oklch-hue-edit",
        index: 0,
        source: [0.62, 0.52, 725],
        next: "360",
        expected: [0.62, 0.52, 0],
        range: true,
      },
      {
        view: "oklch",
        channelId: "oklch.l",
        operationId: "oklch-channel-patch",
        index: 1,
        source: [0.62, 0.52, 725],
        next: "0.7",
        expected: [0.7, 0.52, 725],
        range: true,
      },
      {
        view: "oklch",
        channelId: "oklch.c",
        operationId: "oklch-channel-patch",
        index: 2,
        source: [0.62, 0.52, 725],
        next: "0.3",
        expected: [0.62, 0.3, 725],
        range: true,
      },
      {
        view: "oklab",
        channelId: "oklab.l",
        operationId: "oklab-channel-patch",
        index: 0,
        source: [0.62, 0.62, -0.31],
        next: "0.7",
        expected: [0.7, 0.62, -0.31],
        range: true,
      },
      {
        view: "oklab",
        channelId: "oklab.a",
        operationId: "oklab-disc-coordinate",
        index: 1,
        source: [0.62, 0.3, 0.3],
        next: "0.9",
        expected: [0.62, 0.32, 0.24],
        range: false,
      },
      {
        view: "oklab",
        channelId: "oklab.b",
        operationId: "oklab-disc-coordinate",
        index: 2,
        source: [0.62, 0.3, 0.3],
        next: "0.9",
        expected: [0.62, 0.24, 0.32],
        range: false,
      },
    ] as const;
    for (const fixture of bindings) {
      for (const kind of fixture.range ? ["number", "range"] : ["number"]) {
        it(`${fixture.channelId} ${kind} implements ${fixture.operationId}`, async () => {
          const control = editorUi[currentEditorByView[fixture.view]].companions[fixture.index]!;
          expect([control.channelId, control.operationId]).toEqual([
            fixture.channelId,
            fixture.operationId,
          ]);
          const host = await mount(
            value({ space: fixture.view, channels: fixture.source, alpha: 0.37 }),
            fixture.view,
          );
          try {
            const target = host.element.querySelectorAll<HTMLInputElement>(`[type="${kind}"]`)[
              fixture.index
            ]!;
            await host.run(() => {
              target.value = fixture.next;
              target.dispatchEvent(new Event("input", { bubbles: true }));
              target.dispatchEvent(new Event("change", { bubbles: true }));
            });
            expect(host.order).toEqual(["update", "commit"]);
            const authored = definitionOf(host.commits[0]!);
            expect(authored.space).toBe(fixture.view);
            expect(authored.alpha).toBe(0.37);
            authored.channels.forEach((channel, index) =>
              expect(channel).toBeCloseTo(fixture.expected[index]!, 12),
            );
            if (fixture.channelId === "oklch.h" && kind === "range")
              expect(target.value).toBe("360");
          } finally {
            await host.dispose();
          }
        });
      }
    }

    it("allows Chroma overflow numerically while preserving the bounded native range", async () => {
      const host = await mount(
        value({ space: "oklch", channels: [0.62, 0.2, 725], alpha: 0.37 }),
        "oklch",
      );
      try {
        const number = input(host.element, '[aria-label="Chroma numeric value"]');
        await host.run(() => {
          number.value = "0.723456";
          number.dispatchEvent(new Event("input", { bubbles: true }));
          number.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(definitionOf(host.commits[0]!).channels).toEqual([0.62, 0.723456, 725]);
        expect(number.value).toBe("0.7235");
        expect(input(host.element, '[aria-label="Chroma"]').value).toBe("0.4");
      } finally {
        await host.dispose();
      }
    });

    it("never authors a missing Hue from untouched presentation fallback", async () => {
      const host = await mount(
        value({ space: "oklch", channels: [0.62, 0, null], alpha: 0.37 }),
        "oklch",
      );
      try {
        const hue = input(host.element, '[aria-label="Hue numeric value"]');
        await host.run(() => {
          hue.dispatchEvent(new Event("change", { bubbles: true }));
          hue.dispatchEvent(new Event("blur"));
        });
        expect(host.changes).toHaveLength(0);
        expect(host.element.textContent).toContain("Hue is unset.");
      } finally {
        await host.dispose();
      }
    });

    it.each(currentViewOptions)(
      "disposes equal-valued Lightness range and draft on leaving %s",
      async (view) => {
        const host = await mount(value({ space: "oklab", channels: [0.5, 0, 0], alpha: 1 }), view);
        try {
          const label = view === "oklch" ? "Lightness" : "OKLab lightness · fixed axis";
          const range = input(host.element, `[aria-label="${label}"]`);
          const number = input(host.element, `[aria-label="${label} numeric value"]`);
          await host.run(() => {
            range.value = "0.7";
            range.dispatchEvent(new Event("input", { bubbles: true }));
            number.value = "0.8";
            number.dispatchEvent(new Event("input", { bubbles: true }));
          });
          await host.switchView(view === "oklch" ? "oklab" : "oklch");
          expect(range.isConnected).toBe(false);
          expect(number.isConnected).toBe(false);
          await host.run(() => {
            range.dispatchEvent(new Event("change", { bubbles: true }));
            number.dispatchEvent(new Event("change", { bubbles: true }));
            number.dispatchEvent(new Event("blur"));
          });
          await host.flushFrames();
          expect(host.order).toEqual([]);
        } finally {
          await host.dispose();
        }
      },
    );
  });
}
