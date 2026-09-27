import { act, StrictMode, Suspense, startTransition } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  createColorValue,
  definitionOf,
  definingEquals,
  projectColorToPlane,
  represent,
  snapshotColor,
  type ColorValue,
} from "@gamut-plane/core";
import { GamutPlane } from "../src/index.js";
import { color, event, frames, get, host, initial, input, mount } from "./helpers.js";

function defined(
  space: "oklab" | "display-p3",
  channels: readonly [number, number, number],
  alpha = 0.37,
): ColorValue {
  const result = createColorValue({ space, channels, alpha });
  if (!result.ok) throw new Error("Invalid test color");
  return result.value;
}

describe("ColorValue plane interaction", () => {
  it("accepts a non-OKLCH definition and keeps view changes observational", async () => {
    const value = defined("display-p3", [0.7, 0.3, 0.2]);
    const changes = vi.fn(),
      commits = vi.fn();
    const ui = await mount(
      <GamutPlane value={value} onValueChange={changes} onValueCommit={commits} />,
    );
    expect(get(ui.element, '[role="application"]').getAttribute("aria-label")).toContain(
      "OKLCH plane",
    );
    await event(get(ui.element, '[data-plane-option="oklab"]'), "click");
    expect(changes).not.toHaveBeenCalled();
    expect(commits).not.toHaveBeenCalled();
    expect(definitionOf(value).space).toBe("display-p3");
  });

  it("authors numeric edits in the active plane", async () => {
    const ui = await host({ value: defined("display-p3", [0.7, 0.3, 0.2]) });
    const chroma = get<HTMLInputElement>(ui.element, '[aria-label="Chroma numeric value"]');
    await input(chroma, "0.23");
    await event(chroma, "keydown", { key: "Enter" });
    expect(definitionOf(ui.commits.mock.calls.at(-1)![0]).space).toBe("oklch");
    await event(get(ui.element, '[data-plane-option="oklab"]'), "click");
    const a = get<HTMLInputElement>(ui.element, '[data-oklab-coordinate="a"]');
    await input(a, "-0.13");
    await event(a, "keydown", { key: "Enter" });
    const final = ui.commits.mock.calls.at(-1)![0];
    expect(definitionOf(final).space).toBe("oklab");
    expect(definitionOf(final).channels[1]).toBeCloseTo(-0.13, 10);
  });

  it.each(["oklch", "oklab"] as const)(
    "coalesces %s pointer edits and commits the final point",
    async (view) => {
      const clock = frames(),
        ui = await host({ defaultView: view });
      await clock.flush();
      const surface = get(ui.element, '[role="application"]');
      await event(surface, "pointerdown", { clientX: 80, clientY: 100 });
      await event(surface, "pointermove", { clientX: 100, clientY: 110 });
      expect(ui.changes).not.toHaveBeenCalled();
      await clock.flush();
      expect(ui.changes).toHaveBeenCalledOnce();
      await event(surface, "pointerup", { clientX: 200, clientY: 210 });
      const final = ui.commits.mock.calls[0]![0];
      expect(ui.changes.mock.calls.at(-1)![0]).toBe(final);
      expect(definitionOf(final).space).toBe(view);
      const projection = projectColorToPlane(final, view);
      if (!projection.ok) throw new Error("Invalid final projection");
      expect(projection.value.point.x).toBeCloseTo(200 / 320, 10);
      expect(ui.order).toEqual(["change", "change", "commit"]);
    },
  );

  it("treats reconstructed defining-equal feedback as acknowledgement", async () => {
    const clock = frames(),
      ui = await host();
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    await event(surface, "pointerdown", { clientX: 80, clientY: 100 });
    await clock.flush();
    await event(surface, "pointermove", { clientX: 200, clientY: 200 });
    await clock.flush();
    expect(ui.changes).toHaveBeenCalledTimes(2);
    expect(ui.cancels).not.toHaveBeenCalled();
  });

  it("interrupts on a different defining representation", async () => {
    const clock = frames(),
      ui = await host({ defaultView: "oklab" });
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    await event(surface, "pointerdown", { clientX: 80, clientY: 100 });
    await clock.flush();
    await ui.replace(defined("display-p3", [0.7, 0.3, 0.2]));
    await event(surface, "pointerup", { clientX: 200, clientY: 200 });
    expect(ui.cancels).toHaveBeenCalledOnce();
    expect(ui.commits).not.toHaveBeenCalled();
  });

  it.each(["Escape", "pointercancel", "lostpointercapture"])(
    "%s restores the exact origin",
    async (cancellation) => {
      const origin = defined("oklab", [0.5, -0, 0.1], 0.63);
      const clock = frames(),
        ui = await host({ value: origin });
      await clock.flush();
      const surface = get(ui.element, '[role="application"]');
      await event(surface, "pointerdown", { clientX: 80, clientY: 100 });
      await clock.flush();
      await event(surface, cancellation === "Escape" ? "keydown" : cancellation, { key: "Escape" });
      expect(ui.changes.mock.calls.at(-1)![0]).toBe(origin);
      expect(snapshotColor(origin).channels[1]).toBe("-0");
      expect(ui.order).toEqual(["change", "change", "cancel"]);
      expect(ui.cancels).toHaveBeenCalledOnce();
      expect(ui.commits).not.toHaveBeenCalled();
    },
  );

  it("requires a real Hue edit before chromatic OKLCH work on a hue-less neutral", async () => {
    const neutral = color(0.5, 0, null, 1);
    const clock = frames(),
      ui = await host({ value: neutral });
    await clock.flush();
    expect(ui.element.textContent).toContain("Set Hue before increasing chroma.");
    const surface = get(ui.element, '[role="application"]');
    await event(surface, "keydown", { key: "ArrowRight" });
    expect(ui.changes).not.toHaveBeenCalled();
    const hue = get<HTMLInputElement>(ui.element, '[aria-label="Hue numeric value"]');
    await input(hue, "210");
    await event(hue, "keydown", { key: "Enter" });
    expect(definitionOf(ui.changes.mock.calls.at(-1)![0]).channels).toEqual([0.5, 0, 210]);
    await event(surface, "keydown", { key: "ArrowRight" });
    expect(definitionOf(ui.changes.mock.calls.at(-1)![0]).space).toBe("oklch");
    const count = ui.changes.mock.calls.length;
    await ui.replace(color(0.6, 0, null, 1));
    await event(surface, "keydown", { key: "ArrowRight" });
    expect(ui.changes).toHaveBeenCalledTimes(count);
  });

  it("keeps abandoned concurrent callbacks out of the mounted plane", async () => {
    const clock = frames(),
      first = vi.fn(),
      abandoned = vi.fn();
    const ui = await mount(
      <StrictMode>
        <Suspense fallback={<p>Pending</p>}>
          <GamutPlane value={initial} onValueChange={first} />
        </Suspense>
      </StrictMode>,
    );
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    const never = new Promise<void>(() => {});
    function Suspend(): never {
      throw never;
    }
    await act(async () => {
      startTransition(() =>
        ui.schedule(
          <StrictMode>
            <Suspense fallback={<p>Pending</p>}>
              <GamutPlane value={color(0.62, 0.3, 45, 0.37)} onValueChange={abandoned} />
              <Suspend />
            </Suspense>
          </StrictMode>,
        ),
      );
    });
    await event(surface, "keydown", { key: "ArrowLeft" });
    expect(abandoned).not.toHaveBeenCalled();
    expect(definitionOf(first.mock.calls[0]![0]).space).toBe("oklch");
  });

  it("keeps one pointer, previews immediately, then publishes the final point before commit", async () => {
    const clock = frames(),
      ui = await host();
    await clock.flush();
    const surface = get<HTMLElement>(ui.element, '[role="application"]');
    await event(surface, "pointerdown", { pointerId: 8, button: 2, clientX: 80, clientY: 100 });
    expect(surface.hasPointerCapture(8)).toBe(false);
    await event(surface, "pointerdown", { pointerId: 1, clientX: 80, clientY: 100 });
    expect(surface.hasPointerCapture(1)).toBe(true);
    expect(document.activeElement).toBe(surface);
    expect(surface.hasAttribute("data-gp-pointer-focus")).toBe(true);
    await event(surface, "pointerdown", { pointerId: 2, clientX: 20, clientY: 20 });
    await event(surface, "pointermove", { pointerId: 2, clientX: 20, clientY: 20 });
    await event(surface, "pointermove", { pointerId: 1, clientX: 100, clientY: 110 });
    expect(parseFloat(get<HTMLElement>(ui.element, "[data-active-marker]").style.left)).toBe(31.25);
    expect(ui.order).toEqual([]);
    await clock.flush();
    expect(ui.order).toEqual(["change"]);
    await event(surface, "pointermove", { pointerId: 1, clientX: 120, clientY: 130 });
    await event(surface, "pointerup", { pointerId: 2, clientX: 10, clientY: 10 });
    await event(surface, "pointerup", { pointerId: 1, clientX: 200, clientY: 210 });
    expect(surface.hasPointerCapture(1)).toBe(false);
    expect(ui.order).toEqual(["change", "change", "commit"]);
    expect(ui.changes.mock.calls.at(-1)![0]).toBe(ui.commits.mock.calls[0]![0]);
    await clock.flush();
    await event(surface, "lostpointercapture", { pointerId: 1 });
    expect(ui.order).toEqual(["change", "change", "commit"]);
  });

  it.each([false, true])(
    "authoritative replacement with a queued point afterPublication=%s cancels without rollback",
    async (afterPublication) => {
      const clock = frames(),
        ui = await host();
      await clock.flush();
      const surface = get<HTMLElement>(ui.element, '[role="application"]');
      await event(surface, "pointerdown", { pointerId: 1, clientX: 80, clientY: 100 });
      if (afterPublication) {
        await clock.flush();
        await event(surface, "pointermove", { pointerId: 1, clientX: 150, clientY: 150 });
      }
      const replacement = color(0.7, 0.2, 270, 0.3);
      await ui.replace(replacement);
      expect(surface.hasPointerCapture(1)).toBe(false);
      await clock.flush();
      await event(surface, "pointerup", { pointerId: 1, clientX: 200, clientY: 200 });
      expect(ui.order).toEqual(afterPublication ? ["change", "cancel"] : ["cancel"]);
      expect(ui.commits).not.toHaveBeenCalled();
      expect(definingEquals(ui.current(), replacement)).toBe(true);
    },
  );

  it.each([false, true])(
    "pointerup uses queued or latest point when geometry is lost queued=%s",
    async (queued) => {
      const clock = frames(),
        ui = await host();
      await clock.flush();
      const surface = get<HTMLElement>(ui.element, '[role="application"]');
      await event(surface, "pointerdown", { pointerId: 1, clientX: 80, clientY: 100 });
      if (!queued) await clock.flush();
      vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 0, 0));
      window.dispatchEvent(new Event("scroll"));
      await event(surface, "pointerup", { pointerId: 1, clientX: 300, clientY: 300 });
      expect(ui.order).toEqual(queued ? ["change", "commit"] : ["change", "change", "commit"]);
      const projected = projectColorToPlane(ui.commits.mock.calls[0]![0], "oklch");
      if (!projected.ok) throw new Error("Final color cannot be projected");
      expect(projected.value.point.x).toBeCloseTo(0.25, 10);
    },
  );

  it.each([false, true])(
    "view change interrupts without rollback afterPublication=%s",
    async (afterPublication) => {
      const clock = frames(),
        ui = await host();
      await clock.flush();
      const surface = get<HTMLElement>(ui.element, '[role="application"]');
      await event(surface, "pointerdown", { clientX: 80, clientY: 100 });
      if (afterPublication) {
        await clock.flush();
        await event(surface, "pointermove", { clientX: 160, clientY: 160 });
      }
      const accepted = afterPublication ? ui.changes.mock.calls[0]![0] : initial;
      await event(get(ui.element, '[data-plane-option="oklab"]'), "click");
      await clock.flush();
      await event(surface, "pointerup", { clientX: 300, clientY: 300 });
      await event(surface, "lostpointercapture");
      expect(ui.order).toEqual(afterPublication ? ["change", "cancel"] : ["cancel"]);
      expect(ui.commits).not.toHaveBeenCalled();
      expect(get(ui.element, "[data-picker-plane]").getAttribute("data-plane-id")).toBe("oklab");
      expect(definingEquals(ui.current(), accepted)).toBe(true);
    },
  );

  it("stale feedback from an earlier publication ends the gesture once", async () => {
    const clock = frames(),
      ui = await host();
    await clock.flush();
    const surface = get<HTMLElement>(ui.element, '[role="application"]');
    await event(surface, "pointerdown", { clientX: 80, clientY: 100 });
    await clock.flush();
    const first = ui.changes.mock.calls[0]![0];
    await event(surface, "pointermove", { clientX: 160, clientY: 160 });
    await clock.flush();
    await ui.replace(first);
    await event(surface, "pointerup", { clientX: 200, clientY: 200 });
    expect(ui.order).toEqual(["change", "change", "cancel"]);
    expect(ui.commits).not.toHaveBeenCalled();
  });

  it("treats an observed-equivalent new definition as authoritative replacement", async () => {
    const clock = frames(),
      ui = await host();
    await clock.flush();
    const surface = get<HTMLElement>(ui.element, '[role="application"]');
    await event(surface, "pointerdown", { clientX: 80, clientY: 100 });
    await clock.flush();
    const observed = represent(ui.current(), "oklab");
    if (!observed.ok) throw new Error("Selected color cannot be observed");
    const replacement = createColorValue(observed.value);
    if (!replacement.ok) throw new Error("Invalid replacement");
    expect(definingEquals(replacement.value, ui.current())).toBe(false);
    await ui.replace(replacement.value);
    await event(surface, "pointerup", { clientX: 200, clientY: 200 });
    expect(ui.order).toEqual(["change", "cancel"]);
    expect(ui.commits).not.toHaveBeenCalled();
    expect(ui.current()).toBe(replacement.value);
  });
});
