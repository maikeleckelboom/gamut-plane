import { describe, expect, it } from "vitest";
import {
  analyzeGamut,
  createColorValue,
  definingEquals,
  definitionOf,
  represent,
  snapshotColor,
  type ColorValue,
  type DisplayGamut,
  type PickerPlaneId,
} from "@gamut-plane/core";
import type { resolveAcceptedRevision } from "../src/model/acceptedResolution.js";

type Revision = ReturnType<typeof resolveAcceptedRevision>;
export interface RevisionHost {
  element: Element;
  changes: ColorValue[];
  commits: ColorValue[];
  cancels: string[];
  requests: PickerPlaneId[];
  acceptColors(accept: boolean): void;
  revisions(): Revision[];
  context(): string;
  run(action: () => void): Promise<void>;
  update(
    props: Partial<{
      value: ColorValue;
      view: PickerPlaneId;
      showSrgbBoundary: boolean;
      showDisplayP3Boundary: boolean;
      boundaryTarget: DisplayGamut;
    }>,
  ): Promise<void>;
  flush(): Promise<void>;
  dispose(): Promise<void>;
}

function color(l: number, c: number, h: number | null = 40): ColorValue {
  const result = createColorValue({ space: "oklch", channels: [l, c, h], alpha: 0.37 });
  if (!result.ok) throw new Error("Invalid revision fixture");
  return result.value;
}
function get<T extends Element = HTMLElement>(host: RevisionHost, selector: string): T {
  const element = host.element.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}
function latest(host: RevisionHost): Revision {
  const result = host.revisions().at(-1);
  if (!result) throw new Error("Production did not compose a revision");
  return result;
}
function coherent(revision: Revision): void {
  expect(revision.observation).toEqual(
    represent(revision.source, revision.state.selection.representationId),
  );
  expect(revision.checks.map((row) => row.gamutId)).toEqual(["display-p3-gamut", "srgb-gamut"]);
  for (const row of revision.checks)
    expect(row.result).toEqual(analyzeGamut(revision.source, row.gamutId));
  expect(revision.guides.map((row) => row.guideId)).toEqual(revision.state.visibleGuides);
  expect(Object.keys(revision.state).sort()).toEqual([
    "checkedGamuts",
    "selection",
    "visibleGuides",
  ]);
  expect(Object.isFrozen(revision.state)).toBe(true);
  expect(Object.isFrozen(revision.state.visibleGuides)).toBe(true);
  expect(revision).not.toHaveProperty("capability");
  expect(revision).not.toHaveProperty("boundaryTarget");
}
function pointer(element: Element, type: string): void {
  element.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: "mouse",
      clientX: 100,
      clientY: 110,
    }),
  );
}

/** Same scenarios, through the actual public components and native framework acceptance paths. */
export function acceptedRevisionContract(
  mount: (value: ColorValue, view: PickerPlaneId) => Promise<RevisionHost>,
): void {
  describe("accepted production resolution revisions", () => {
    it.each(["oklch", "oklab"] as const)(
      "initial %s and all guide combinations retain independent checks and target",
      async (view) => {
        const source = color(0.68, 0.18, 252);
        const before = snapshotColor(source);
        const host = await mount(source, view);
        try {
          const editorId = view === "oklch" ? "oklch-lc" : "oklab-ab";
          expect(latest(host).state.selection).toEqual({ representationId: view, editorId });
          expect(host.context()).toBe(`${view}:${editorId}`);
          expect(get(host, "[data-picker-plane]").getAttribute("data-plane-id")).toBe(view);
          for (const srgb of [false, true])
            for (const p3 of [false, true]) {
              await host.update({ showSrgbBoundary: srgb, showDisplayP3Boundary: p3 });
              const revision = latest(host);
              expect(revision.state.visibleGuides).toEqual([
                ...(p3 ? ["display-p3-boundary"] : []),
                ...(srgb ? ["srgb-boundary"] : []),
              ]);
              expect(host.element.querySelectorAll("[data-gamut-boundary]")).toHaveLength(
                Number(srgb) + Number(p3),
              );
              const state = JSON.stringify(revision.state);
              await host.update({ boundaryTarget: "display-p3" });
              expect(JSON.stringify(latest(host).state)).toBe(state);
              expect(
                get(host, "[data-boundary-target-result]").getAttribute("data-target-exact-status"),
              ).toBe("inside");
              await host.update({ boundaryTarget: "srgb" });
              expect(
                get(host, "[data-boundary-target-result]").getAttribute("data-target-exact-status"),
              ).toBe("outside");
            }
          host.revisions().forEach(coherent);
          expect(snapshotColor(source)).toEqual(before);
          expect(host.changes).toEqual([]);
          expect(host.commits).toEqual([]);
          expect(host.cancels).toEqual([]);
        } finally {
          await host.dispose();
        }
      },
    );

    it.each(["oklch", "oklab"] as const)(
      "replaces outside facts with inside facts in %s",
      async (view) => {
        const host = await mount(color(0.62, 0.3), view);
        try {
          const old = latest(host);
          expect(old.guides.find((row) => row.guideId === "srgb-boundary")).toMatchObject({
            kind: "resolved",
            forms: { targetMarker: { kind: "available" } },
          });
          expect(host.element.querySelector("[data-table-boundary-guide-marker]")).not.toBeNull();
          const inside = color(0.5, 0.02);
          await host.update({ value: inside });
          const next = latest(host);
          expect(definingEquals(next.source, inside)).toBe(true);
          expect(next.state).toEqual(old.state);
          expect(next.checks).not.toBe(old.checks);
          expect(next.guides.find((row) => row.guideId === "srgb-boundary")).toMatchObject({
            kind: "resolved",
            forms: { targetMarker: { kind: "exact-not-outside", status: "inside" } },
          });
          expect(host.element.querySelector("[data-table-boundary-guide-marker]")).toBeNull();
          host.revisions().forEach(coherent);
          expect(host.changes).toEqual([]);
          expect(host.commits).toEqual([]);
          expect(host.cancels).toEqual([]);
        } finally {
          await host.dispose();
        }
      },
    );

    it.each(["oklch", "oklab"] as const)(
      "accepted departure from %s disposes old plane, range and equal-valued draft authority",
      async (view) => {
        const source = color(0.5, 0, 40);
        const host = await mount(source, view);
        try {
          await host.flush();
          const label = view === "oklch" ? "Lightness" : "OKLab lightness · fixed axis";
          const range = get<HTMLInputElement>(host, `[aria-label="${label}"]`);
          const number = get<HTMLInputElement>(host, `[aria-label="${label} numeric value"]`);
          const surface = get(host, '[role="application"]');
          await host.run(() => {
            pointer(surface, "pointerdown");
            range.value = "0.7";
            range.dispatchEvent(new Event("input", { bubbles: true }));
            number.value = "0.8";
            number.dispatchEvent(new Event("input", { bubbles: true }));
          });
          const next = view === "oklch" ? "oklab" : "oklch";
          await host.update({ view: next });
          expect(host.context()).toBe(next === "oklch" ? "oklch:oklch-lc" : "oklab:oklab-ab");
          expect(definingEquals(latest(host).source, source)).toBe(true);
          expect(range.isConnected).toBe(false);
          expect(number.isConnected).toBe(false);
          await host.run(() => {
            pointer(surface, "pointerup");
            range.dispatchEvent(new Event("change", { bubbles: true }));
            number.dispatchEvent(new Event("change", { bubbles: true }));
            number.dispatchEvent(new Event("blur"));
          });
          await host.flush();
          expect(host.changes).toEqual([]);
          expect(host.commits).toEqual([]);
          expect(host.cancels).toEqual(["cancel"]);
          await host.update({ view }); // No gesture: accepting a selection alone is silent.
          expect(host.cancels).toEqual(["cancel"]);
          host.revisions().forEach(coherent);
        } finally {
          await host.dispose();
        }
      },
    );

    it("a rejected parent-owned selection never installs a requested revision or remounts controls", async () => {
      const host = await mount(color(0.62, 0.2), "oklch");
      try {
        await host.flush();
        const range = get<HTMLInputElement>(host, '[aria-label="Lightness"]');
        const number = get<HTMLInputElement>(host, '[aria-label="Lightness numeric value"]');
        const surface = get(host, '[role="application"]');
        await host.run(() => {
          number.value = "0.8";
          number.dispatchEvent(new Event("input", { bubbles: true }));
          pointer(surface, "pointerdown");
          get(host, '[data-plane-option="oklab"]').click();
        });
        expect(host.requests).toEqual(["oklab"]);
        expect(host.context()).toBe("oklch:oklch-lc");
        expect(
          host.revisions().every((revision) => revision.state.selection.editorId === "oklch-lc"),
        ).toBe(true);
        expect(get(host, '[aria-label="Lightness"]')).toBe(range);
        expect(get(host, '[aria-label="Lightness numeric value"]')).toBe(number);
        expect(number.value).toBe("0.8");
        expect(host.cancels).toEqual([]);
        await host.run(() => pointer(surface, "pointerup"));
        await host.flush();
        expect(host.changes).toHaveLength(1);
        expect(host.commits).toHaveLength(1);
        expect(definitionOf(host.commits[0]!).space).toBe("oklch");
        host.revisions().forEach(coherent);
      } finally {
        await host.dispose();
      }
    });

    it("does not replay a temporary Hue reference across accepted editor contexts", async () => {
      const source = color(0.5, 0, null);
      const host = await mount(source, "oklch");
      try {
        host.acceptColors(false);
        const hue = get<HTMLInputElement>(host, '[aria-label="Hue numeric value"]');
        await host.run(() => {
          hue.value = "210";
          hue.dispatchEvent(new Event("input", { bubbles: true }));
          hue.dispatchEvent(new Event("change", { bubbles: true }));
        });
        expect(host.changes).toHaveLength(1);
        expect(definingEquals(latest(host).source, source)).toBe(true);
        await host.update({ view: "oklab" });
        await host.update({ view: "oklch" });
        await host.run(() =>
          get(host, '[role="application"]').dispatchEvent(
            new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
          ),
        );
        expect(host.changes).toHaveLength(1);
        expect(host.commits).toHaveLength(1);
        expect(latest(host).observation).toMatchObject({
          ok: true,
          value: { channels: [0.5, 0, null] },
        });
      } finally {
        await host.dispose();
      }
    });

    it("defining-equal feedback retains queued ownership, including signed zero and missing Hue", async () => {
      const source = color(0.5, -0, null);
      const host = await mount(source, "oklab");
      try {
        await host.flush();
        const surface = get(host, '[role="application"]');
        await host.run(() => pointer(surface, "pointerdown"));
        const rebuilt = createColorValue(definitionOf(source));
        if (!rebuilt.ok) throw new Error("Invalid feedback");
        expect(rebuilt.value).not.toBe(source);
        await host.update({ value: rebuilt.value });
        expect(host.cancels).toEqual([]);
        expect(snapshotColor(latest(host).source)).toEqual(snapshotColor(source));
        await host.run(() => pointer(surface, "pointerup"));
        await host.flush();
        expect(host.commits).toHaveLength(1);
        expect(definitionOf(host.commits[0]!).space).toBe("oklab");
        host.revisions().forEach(coherent);
      } finally {
        await host.dispose();
      }
    });

    it("unmount silently discards queued plane and range work and dirty numeric completion", async () => {
      const host = await mount(color(0.62, 0.2), "oklch");
      await host.flush();
      const range = get<HTMLInputElement>(host, '[aria-label="Lightness"]');
      const number = get<HTMLInputElement>(host, '[aria-label="Lightness numeric value"]');
      const surface = get(host, '[role="application"]');
      await host.run(() => {
        pointer(surface, "pointerdown");
        range.value = "0.7";
        range.dispatchEvent(new Event("input", { bubbles: true }));
        number.value = "0.8";
        number.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await host.dispose();
      await host.run(() => {
        pointer(surface, "pointerup");
        range.dispatchEvent(new Event("change"));
        number.dispatchEvent(new Event("blur"));
      });
      await host.flush();
      expect(host.changes).toEqual([]);
      expect(host.commits).toEqual([]);
      expect(host.cancels).toEqual([]);
    });
  });
}
