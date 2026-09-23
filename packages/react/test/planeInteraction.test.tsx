import { act, StrictMode, Suspense, startTransition } from "react";
import { describe, expect, it, vi } from "vitest";
import { OKLAB_AB_PLANE, OKLCH_LIGHTNESS_CHROMA_PLANE } from "@gamut-plane/core";
import { GamutPlane } from "../src/index.js";
import { event, frames, get, host, initial, input, mount } from "./helpers.js";
import { canvasContext } from "./setup.js";

describe("plane ownership and edits", () => {
  it.each(["oklch", "oklab"] as const)(
    "coalesces %s pointer edits and synchronously commits the final coordinate",
    async (view) => {
      const clock = frames(),
        ui = await host({ defaultView: view });
      await clock.flush();
      const surface = get(ui.element, '[role="application"]');
      await event(surface, "pointerdown", { clientX: 80, clientY: 100 });
      await event(surface, "pointermove", { clientX: 100, clientY: 110 });
      await event(surface, "pointermove", { clientX: 110, clientY: 120, pointerId: 2 });
      expect(clock.size).toBe(1);
      expect(ui.changes).not.toHaveBeenCalled();
      await clock.flush();
      expect(ui.changes).toHaveBeenCalledOnce();
      const plane = view === "oklab" ? OKLAB_AB_PLANE : OKLCH_LIGHTNESS_CHROMA_PLANE;
      expect(ui.changes.mock.calls[0]![0]).toEqual(
        plane.unproject({ x: 100 / 320, y: 110 / 320 }, plane.project(initial).fixed, initial),
      );
      await event(surface, "pointermove", { clientX: 120, clientY: 150 });
      await event(surface, "pointerup", { clientX: 200, clientY: 210 });
      const previous = ui.changes.mock.calls[0]![0];
      const final = plane.unproject(
        { x: 200 / 320, y: 210 / 320 },
        plane.project(previous).fixed,
        previous,
      );
      expect(ui.changes.mock.calls.at(-1)![0]).toEqual(final);
      expect(ui.commits).toHaveBeenCalledExactlyOnceWith(final);
      expect(ui.order).toEqual(["change", "change", "commit"]);
      await event(surface, "lostpointercapture");
      await clock.flush();
      expect(ui.cancels).not.toHaveBeenCalled();
      expect(ui.changes).toHaveBeenCalledTimes(2);
    },
  );
  it.each(["Escape", "pointercancel", "lostpointercapture"])(
    "%s rolls back once after discarding queued work",
    async (cancellation) => {
      const clock = frames(),
        ui = await host();
      await clock.flush();
      const surface = get(ui.element, '[role="application"]');
      await event(surface, "pointerdown", { clientX: 80, clientY: 100 });
      await clock.flush();
      await event(surface, "pointermove", { clientX: 180, clientY: 200 });
      await event(surface, cancellation === "Escape" ? "keydown" : cancellation, { key: "Escape" });
      await clock.flush();
      expect(ui.order).toEqual(["change", "change", "cancel"]);
      expect(ui.changes.mock.calls.at(-1)![0]).toEqual(initial);
      expect(ui.cancels).toHaveBeenCalledOnce();
      expect(ui.commits).not.toHaveBeenCalled();
      const escaped = vi.fn();
      ui.element.addEventListener("keydown", escaped);
      await event(surface, "keydown", { key: "Escape" });
      expect(escaped).toHaveBeenCalledOnce();
      expect(ui.cancels).toHaveBeenCalledOnce();
    },
  );
  it("cloned feedback and fresh callbacks retain the owning pointer", async () => {
    const clock = frames(),
      ui = await host();
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    await event(surface, "pointerdown", { clientX: 80, clientY: 100 });
    await clock.flush();
    const live = ui.changes.mock.calls[0]![0];
    await ui.replace({ ...live });
    await event(surface, "pointermove", { clientX: 200, clientY: 200 });
    await clock.flush();
    expect(ui.changes).toHaveBeenCalledTimes(2);
    expect(ui.cancels).not.toHaveBeenCalled();
    await event(surface, "pointerup", { clientX: 210, clientY: 210 });
    expect(ui.commits).toHaveBeenCalledOnce();
  });
  it.each(["l", "c", "h", "alpha"] as const)(
    "different external %s wins and cancels without rollback",
    async (channel) => {
      const clock = frames(),
        ui = await host();
      await clock.flush();
      const surface = get(ui.element, '[role="application"]');
      await event(surface, "pointerdown", { clientX: 80, clientY: 100 });
      await clock.flush();
      await event(surface, "pointermove", { clientX: 200, clientY: 200 });
      const live = ui.changes.mock.calls[0]![0];
      const next = { ...live, [channel]: live[channel] + 0.01 };
      await ui.replace(next);
      await clock.flush();
      await event(surface, "pointerup", { clientX: 200, clientY: 200 });
      expect(ui.changes).toHaveBeenCalledOnce();
      expect(ui.cancels).toHaveBeenCalledOnce();
      expect(ui.commits).not.toHaveBeenCalled();
      expect(get<HTMLInputElement>(ui.element, '[aria-label="Chroma numeric value"]').value).toBe(
        next.c.toFixed(4),
      );
    },
  );
  it("actual view change cancels without reinterpreting an old point", async () => {
    const clock = frames(),
      ui = await host();
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    await event(surface, "pointerdown", { clientX: 80, clientY: 100 });
    await clock.flush();
    await event(surface, "pointermove", { clientX: 200, clientY: 200 });
    await event(get(ui.element, '[data-plane-option="oklab"]'), "click");
    await clock.flush();
    await event(surface, "pointerup", { clientX: 200, clientY: 200 });
    expect(ui.order).toEqual(["change", "cancel"]);
    expect(ui.cancels).toHaveBeenCalledOnce();
    expect(ui.commits).not.toHaveBeenCalled();
  });
  it("unmount releases capture and discards all queued work silently", async () => {
    const clock = frames(),
      ui = await host();
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    await event(surface, "pointerdown", { clientX: 80, clientY: 100 });
    expect(surface.hasPointerCapture(1)).toBe(true);
    await ui.unmount();
    expect(surface.hasPointerCapture(1)).toBe(false);
    await clock.flush();
    await event(surface, "pointerup", { clientX: 200, clientY: 200 });
    expect(ui.changes).not.toHaveBeenCalled();
    expect(ui.commits).not.toHaveBeenCalled();
    expect(ui.cancels).not.toHaveBeenCalled();
    expect(clock.size).toBe(0);
  });
  for (const view of ["oklch", "oklab"] as const)
    it.each(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"])(
      `${view} %s uses core keyboard semantics and preserves alpha`,
      async (key) => {
        const clock = frames(),
          ui = await host({ defaultView: view });
        await clock.flush();
        const plane = view === "oklab" ? OKLAB_AB_PLANE : OKLCH_LIGHTNESS_CHROMA_PLANE;
        const action = {
          ArrowLeft: "decrease-x",
          ArrowRight: "increase-x",
          ArrowUp: "increase-y",
          ArrowDown: "decrease-y",
          Home: "minimum-x",
          End: "maximum-x",
        } as const;
        if (!(key in action)) throw Error(key);
        await event(get(ui.element, '[role="application"]'), "keydown", { key, shiftKey: true });
        const expected = plane.editFromKeyboard(initial, action[key as keyof typeof action], true);
        expect(ui.changes).toHaveBeenCalledExactlyOnceWith(expected);
        expect(ui.commits).toHaveBeenCalledExactlyOnceWith(expected);
        expect(expected.alpha).toBe(initial.alpha);
        expect(ui.order).toEqual(["change", "commit"]);
      },
    );
  it.each(["a", "b"] as const)(
    "edits negative OKLab %s through core unprojection",
    async (coordinate) => {
      const ui = await host({ defaultView: "oklab" });
      const field = get<HTMLInputElement>(ui.element, `[data-oklab-coordinate="${coordinate}"]`);
      await input(field, "-0.13");
      await event(field, "keydown", { key: "Enter" });
      const final = ui.commits.mock.calls[0]![0];
      const projection = OKLAB_AB_PLANE.project(final);
      const original = OKLAB_AB_PLANE.project(initial);
      expect(coordinate === "a" ? projection.x : projection.y).toBeCloseTo(-0.13, 12);
      expect(coordinate === "a" ? projection.y : projection.x).toBeCloseTo(
        coordinate === "a" ? original.y : original.x,
        12,
      );
      expect(final.alpha).toBe(initial.alpha);
      expect(final.l).toBe(initial.l);
    },
  );
  it("out-of-domain colors stay authored and have exact warning plus sampled projection", async () => {
    const value = Object.freeze({ ...initial, c: 0.52 });
    const changes = vi.fn();
    const ui = await mount(
      <GamutPlane value={value} onValueChange={changes} defaultView="oklab" />,
    );
    expect(get(ui.element, '[role="application"]').dataset.outsideInstrument).toBe("true");
    expect(get(ui.element, "[data-active-marker]").dataset.outsideDisplayP3).toBe("true");
    expect(ui.element.querySelectorAll("[data-table-boundary-guide-marker]")).toHaveLength(1);
    expect(ui.element.querySelectorAll("[data-table-boundary-guide-connector]")).toHaveLength(1);
    expect(get(ui.element, "[data-picker-plane]").dataset.fieldResolution).toBe("80x24");
    expect(changes).not.toHaveBeenCalled();
    expect(value.c).toBe(0.52);
    expect(get<HTMLDetailsElement>(ui.element, "details").open).toBe(false);
  });
  it("does not let an abandoned concurrent render replace committed event callbacks", async () => {
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
    // A render that suspends never commits its callbacks into the native binding.
    const never = new Promise<void>(() => {});
    function Suspend(): never {
      throw never;
    }
    await act(async () => {
      startTransition(() => {
        ui.schedule(
          <StrictMode>
            <Suspense fallback={<p>Pending</p>}>
              <GamutPlane value={{ ...initial, c: 0.3 }} onValueChange={abandoned} />
              <Suspend />
            </Suspense>
          </StrictMode>,
        );
      });
    });
    expect(surface.isConnected).toBe(true);
    await event(surface, "keydown", { key: "ArrowLeft" });
    expect(abandoned).not.toHaveBeenCalled();
    expect(first).toHaveBeenCalledExactlyOnceWith(
      OKLCH_LIGHTNESS_CHROMA_PLANE.editFromKeyboard(initial, "decrease-x", false),
    );
  });
});

describe("field invalidation", () => {
  it("visible axes retain fields while fixed axes, view and resize invalidate", async () => {
    const clock = frames(),
      ui = await host();
    await clock.flush();
    const canvas = get<HTMLCanvasElement>(ui.element, "canvas"),
      context = canvasContext(canvas);
    const before = context.clearRect.mock.calls.length;
    await ui.replace({ ...initial, l: 0.4, c: 0.1 });
    await clock.flush();
    expect(context.clearRect).toHaveBeenCalledTimes(before);
    await ui.replace({ ...initial, h: 70 });
    await ui.replace({ ...initial, h: 80 });
    expect(clock.size).toBe(1);
    await clock.flush();
    expect(context.clearRect).toHaveBeenCalledTimes(before + 1);
    await event(get(ui.element, '[data-plane-option="oklab"]'), "click");
    await clock.flush();
    expect(context.clearRect).toHaveBeenCalledTimes(before + 2);
    expect(context.drawImage).toHaveBeenCalled();
    const buffer = context.drawImage.mock.calls.at(-1)?.[0];
    expect(buffer).toBeInstanceOf(HTMLCanvasElement);
    if (buffer instanceof HTMLCanvasElement) {
      expect(buffer.width).toBe(80);
      expect(buffer.height).toBe(80);
      expect(canvasContext(buffer).createLinearGradient).toHaveBeenCalledTimes(80);
      for (const result of canvasContext(buffer).createLinearGradient.mock.results)
        expect(result.value.addColorStop).toHaveBeenCalledTimes(24);
    }
    const calls = context.clearRect.mock.calls.length;
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 250, 250),
    );
    await act(async () => window.dispatchEvent(new Event("resize")));
    await clock.flush();
    expect(canvas.width).toBe(250);
    expect(context.clearRect).toHaveBeenCalledTimes(calls + 1);
  });
  it("reuses the 192-column Hue preview buffer and restores full sampling", async () => {
    const clock = frames(),
      ui = await host();
    await clock.flush();
    const canvas = get<HTMLCanvasElement>(ui.element, "canvas"),
      context = canvasContext(canvas);
    const range = get<HTMLInputElement>(ui.element, '[data-picker-control="h"] [type="range"]');
    await event(range, "pointerdown");
    await input(range, "180");
    await clock.flush();
    await clock.flush();
    const buffer = context.drawImage.mock.calls.at(-1)![0];
    expect(buffer).toBeInstanceOf(HTMLCanvasElement);
    if (!(buffer instanceof HTMLCanvasElement)) throw Error("Expected preview buffer");
    expect(buffer.width).toBe(192);
    expect(buffer.height).toBe(canvas.height);
    expect(canvasContext(buffer).createLinearGradient.mock.calls.length % 192).toBe(0);
    await input(range, "190");
    await clock.flush();
    await clock.flush();
    expect(context.drawImage.mock.calls.at(-1)![0]).toBe(buffer);
    context.createLinearGradient.mockClear();
    await event(range, "change");
    await clock.flush();
    expect(context.createLinearGradient).toHaveBeenCalledTimes(320);
    expect(get(ui.element, "[data-picker-plane]").dataset.fieldQuality).toBe("full");
  });
  it("switching plane invalidates even when the fixed-axis number matches", async () => {
    const clock = frames(),
      ui = await host({ value: { ...initial, l: 0.5, h: 0.5 } });
    await clock.flush();
    const canvas = get<HTMLCanvasElement>(ui.element, "canvas"),
      context = canvasContext(canvas);
    const before = context.clearRect.mock.calls.length;
    await event(get(ui.element, '[data-plane-option="oklab"]'), "click");
    await clock.flush();
    expect(context.clearRect).toHaveBeenCalledTimes(before + 1);
  });
  it("projection remains a sampled guide and never increases authored chroma", async () => {
    const changes = vi.fn();
    const ui = await mount(
      <GamutPlane value={{ l: 0.48, c: 0.225, h: 262, alpha: 0.37 }} onValueChange={changes} />,
    );
    expect(get(ui.element, "[data-table-boundary-guide-marker]").style.left).toBe(
      get(ui.element, "[data-active-marker]").style.left,
    );
    expect(ui.element.textContent).toContain("boundary projection overlaps active");
    expect(changes).not.toHaveBeenCalled();
  });
});
