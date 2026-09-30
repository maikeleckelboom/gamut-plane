import { describe, expect, it, vi } from "vitest";
import * as capabilities from "@gamut-plane/core/internal/capabilities";
import { createColorValue, definitionOf, type ColorValue } from "@gamut-plane/core";
import type { GamutPlaneState } from "../src/index.js";
import type { GamutHost } from "./gamutContract.js";
import type { GamutCheckResult } from "@gamut-plane/core/internal/capabilities";
import type { GuideId } from "@gamut-plane/render";

type Mount = (
  value: ColorValue,
  state: GamutPlaneState,
  options?: Readonly<{ readOnly?: boolean }>,
) => Promise<GamutHost>;
const created = createColorValue({ space: "oklch", channels: [0.68, 0.18, 252], alpha: 0.37 });
if (!created.ok) throw new Error("fixture");
const value = created.value;
const cleared: GamutPlaneState = {
  selection: { representationId: "oklch", editorId: "oklch-lc" },
  checkedGamuts: [],
  visibleGuides: [],
  referenceGamutId: null,
};
const surface = (root: Element) => root.querySelector<HTMLElement>('[data-gp-part="surface"]')!;
const menu = (root: Element) =>
  root.querySelector<HTMLElement>('[data-gp-part="gamut-context-menu"]')!;
const command = (root: Element, id: string) =>
  menu(root).querySelector<HTMLButtonElement>(`[data-gp-command="${id}"]`)!;
const open = (root: Element) =>
  surface(root).dispatchEvent(
    new MouseEvent("contextmenu", {
      button: 2,
      clientX: 20,
      clientY: 30,
      bubbles: true,
      cancelable: true,
    }),
  );
const text = (node: Element | null) => node?.textContent?.replace(/\s+/g, " ").trim();
const description = (button: Element) =>
  text(button.ownerDocument.getElementById(button.getAttribute("aria-describedby")!));

export function gamutContextMenuContract(mount: Mount) {
  describe("plane gamut menu adapter contract", () => {
    it("opens and dismisses without requesting hidden exact analysis", async () => {
      const host = await mount(value, cleared);
      const analysis = vi.spyOn(capabilities, "analyzeRequestedGamuts");
      try {
        await host.interact(() => open(host.element));
        await host.interact(() =>
          menu(host.element).dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
          ),
        );
        expect(analysis).not.toHaveBeenCalled();
        expect(host.requests()).toEqual([]);
        expect(host.changes()).toBe(0);
      } finally {
        analysis.mockRestore();
        await host.dispose();
      }
    });
    it("renders the same seven accepted commands, named groups and secondary facts", async () => {
      const host = await mount(value, {
        ...cleared,
        checkedGamuts: ["display-p3-gamut", "srgb-gamut"],
        visibleGuides: ["srgb-boundary"],
        referenceGamutId: "display-p3-gamut",
      });
      try {
        const popup = menu(host.element);
        expect(popup.hidden).toBe(true);
        expect(popup.getAttribute("role")).toBe("menu");
        expect(popup.getAttribute("popover")).toBe("manual");
        expect(popup.getAttribute("aria-label")).toBe("Gamut actions");
        expect(
          [...popup.querySelectorAll('[role="group"]')].map((group) =>
            text(group.ownerDocument.getElementById(group.getAttribute("aria-labelledby")!)),
          ),
        ).toEqual(["Reference", "Boundary", "Status"]);
        const buttons = [...popup.querySelectorAll("button")];
        expect(buttons.map((button) => button.dataset.gpCommand)).toEqual([
          "reference-srgb-gamut",
          "reference-display-p3-gamut",
          "reference-none",
          "boundary-srgb-gamut",
          "boundary-display-p3-gamut",
          "status-srgb-gamut",
          "status-display-p3-gamut",
        ]);
        expect(buttons.map((button) => button.getAttribute("aria-checked"))).toEqual([
          "false",
          "true",
          "false",
          "true",
          "false",
          "true",
          "true",
        ]);
        expect(buttons.map((button) => button.getAttribute("role"))).toEqual([
          "menuitemradio",
          "menuitemradio",
          "menuitemradio",
          "menuitemcheckbox",
          "menuitemcheckbox",
          "menuitemcheckbox",
          "menuitemcheckbox",
        ]);
        expect(
          buttons.every(
            (button) =>
              button.type === "button" &&
              button.tabIndex === -1 &&
              button.getAttribute("aria-disabled") === "false",
          ),
        ).toBe(true);
        expect(description(command(host.element, "status-srgb-gamut"))).toBe("Outside");
        expect(description(command(host.element, "status-display-p3-gamut"))).toBe("Inside");
        expect(popup.querySelector('[role="application"]')).toBeNull();
        expect(popup.querySelector("[aria-live]")).toBeNull();
        await host.interact(() => open(host.element));
        expect(document.activeElement).toBe(command(host.element, "reference-display-p3-gamut"));
        expect(host.requests()).toEqual([]);
        expect(host.changes()).toBe(0);
      } finally {
        await host.dispose();
      }
    });

    it("closes once after each rejected request, reopens at accepted state and follows live acceptance", async () => {
      const host = await mount(value, cleared);
      try {
        for (const [id, next] of [
          ["status-srgb-gamut", { ...cleared, checkedGamuts: ["srgb-gamut"] }],
          ["boundary-srgb-gamut", { ...cleared, visibleGuides: ["srgb-boundary"] }],
          ["reference-display-p3-gamut", { ...cleared, referenceGamutId: "display-p3-gamut" }],
        ] as const) {
          await host.interact(() => open(host.element));
          await host.interact(() => command(host.element, id).click());
          expect(host.requests().at(-1)).toEqual(next);
          expect(menu(host.element).hidden).toBe(true);
          expect(document.activeElement).toBe(surface(host.element));
          await host.interact(() => open(host.element));
          expect(command(host.element, id).getAttribute("aria-checked")).toBe("false");
          expect(command(host.element, "reference-none").getAttribute("aria-checked")).toBe("true");
          expect(description(command(host.element, "status-srgb-gamut"))).toBe("Status off");
        }
        expect(host.requests()).toHaveLength(3);
        // A parent update while the menu is open reconciles facts and the next action's base.
        const accepted: GamutPlaneState = {
          ...cleared,
          checkedGamuts: ["srgb-gamut"],
          referenceGamutId: "srgb-gamut",
        };
        await host.update(accepted);
        expect(menu(host.element).hidden).toBe(false);
        expect(description(command(host.element, "status-srgb-gamut"))).toBe("Outside");
        expect(command(host.element, "reference-srgb-gamut").getAttribute("aria-checked")).toBe(
          "true",
        );
        await host.interact(() => command(host.element, "boundary-display-p3-gamut").click());
        expect(host.requests().at(-1)).toEqual({
          ...accepted,
          visibleGuides: ["display-p3-boundary"],
        });
        await host.interact(() => open(host.element));
        await host.interact(() => command(host.element, "reference-srgb-gamut").click());
        expect(host.requests()).toHaveLength(4); // Selecting the accepted Reference is a semantic no-op.
        expect(menu(host.element).hidden).toBe(true);
        expect(host.changes()).toBe(0);
      } finally {
        await host.dispose();
      }
    });

    it("preserves plane and direct-control identities, drafts and authored provenance across gamut changes", async () => {
      const before = definitionOf(value);
      const host = await mount(value, cleared);
      try {
        const nodes = () => [
          ...host.element.querySelectorAll(
            '[data-gp-part="surface"], [data-gp-part="native-range"], [data-gp-part="numeric-input"]',
          ),
        ];
        const original = nodes();
        expect(original).toHaveLength(7);
        const draft = host.element.querySelector<HTMLInputElement>(
          '[aria-label="Chroma numeric value"]',
        )!;
        await host.interact(() => {
          draft.value = "0.12345";
          draft.dispatchEvent(new Event("input", { bubbles: true }));
        });
        for (const id of [
          "status-srgb-gamut",
          "boundary-srgb-gamut",
          "reference-display-p3-gamut",
        ]) {
          await host.interact(() => open(host.element));
          await host.interact(() => command(host.element, id).click());
          await host.update(host.requests().at(-1)!);
          expect(nodes()).toEqual(original);
          expect(draft.value).toBe("0.12345");
        }
        expect(definitionOf(value)).toEqual(before);
        expect(host.changes()).toBe(0);
        await host.update({ ...cleared, selection: { representationId: "srgb", editorId: null } });
        expect(host.element.querySelector('[data-gp-part="gamut-context-menu"]')).toBeNull();
        expect(host.element.querySelector('[data-gp-part="surface"]')).toBeNull();
      } finally {
        await host.dispose();
      }
    });

    it("keeps read-only facts keyboard-inspectable and guards requests while color editing remains live", async () => {
      const host = await mount(
        value,
        { ...cleared, checkedGamuts: ["srgb-gamut"], referenceGamutId: "srgb-gamut" },
        { readOnly: true },
      );
      try {
        await host.interact(() => open(host.element));
        const popup = menu(host.element);
        expect(description(popup)).toBe("Read-only");
        const buttons = [...popup.querySelectorAll("button")];
        expect(buttons.every((button) => button.getAttribute("aria-disabled") === "true")).toBe(
          true,
        );
        expect(description(command(host.element, "status-srgb-gamut"))).toBe("Outside");
        expect(command(host.element, "reference-srgb-gamut").getAttribute("aria-checked")).toBe(
          "true",
        );
        await host.interact(() => command(host.element, "status-display-p3-gamut").click());
        expect(popup.hidden).toBe(false);
        expect(host.requests()).toEqual([]);
        await host.interact(() =>
          popup.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
          ),
        );
        expect(popup.hidden).toBe(true);
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
        expect(host.requests()).toEqual([]);
      } finally {
        await host.dispose();
      }
    });
  });
}

export function gamutContextMenuMarkupContract(
  mount: (props: {
    state: GamutPlaneState;
    checks: readonly GamutCheckResult[];
    paused: readonly GuideId[];
  }) => Promise<{ element: Element; dispose(): Promise<void> }>,
) {
  describe("gamut menu exceptional fact markup", () => {
    it.each(["within-tolerance", "unavailable"] as const)(
      "shares %s and paused copy with the inspector",
      async (status) => {
        const check: GamutCheckResult =
          status === "unavailable"
            ? {
                gamutId: "srgb-gamut",
                result: {
                  ok: false,
                  error: { code: "numerical-range", from: "oklch", to: "srgb" },
                },
              }
            : {
                gamutId: "srgb-gamut",
                result: {
                  ok: true,
                  value: { gamut: "srgb-gamut", linearRgb: [0, 0, 0], tolerance: 1e-9, status },
                },
              };
        const host = await mount({
          state: { ...cleared, checkedGamuts: ["srgb-gamut"], visibleGuides: ["srgb-boundary"] },
          checks: [check],
          paused: ["srgb-boundary"],
        });
        try {
          const boundary = command(host.element, "boundary-srgb-gamut");
          expect(boundary.getAttribute("aria-checked")).toBe("true");
          expect(boundary.getAttribute("aria-disabled")).toBe("false");
          expect(text(boundary)).toContain("Paused");
          expect(description(boundary)).toBe("Paused: Requested boundary cannot be drawn here.");
          expect(description(command(host.element, "status-srgb-gamut"))).toBe(
            status === "unavailable" ? "Unavailable" : "Within tolerance",
          );
          expect(description(command(host.element, "status-display-p3-gamut"))).toBe("Status off");
        } finally {
          await host.dispose();
        }
      },
    );
  });
}
