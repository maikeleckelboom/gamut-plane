import { act, Profiler, StrictMode, Suspense, startTransition } from "react";
import { describe, expect, it, vi } from "vitest";
import { createColorValue, projectColorToPlane, type ColorValue } from "@gamut-plane/core";
import { GamutPlane } from "../src/index.js";
import { canvasContext } from "./setup.js";
import {
  color,
  editingState,
  event,
  frames,
  get,
  host,
  initial,
  mount,
  selectRepresentation,
} from "./helpers.js";

const planeOf = (root: ParentNode) => get(root, '[data-gp-part="plane"]');
const zoomOf = (root: ParentNode) => Number(planeOf(root).dataset.gpViewportZoom);
const viewBoxOf = (root: ParentNode) =>
  get(root, '[data-gp-part="gamut-guides"]').getAttribute("viewBox")!.split(" ").map(Number);

async function wheel(
  surface: Element,
  init: { clientX: number; clientY: number; deltaY: number; altKey?: boolean; ctrlKey?: boolean },
) {
  const native = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    altKey: true,
    ...init,
  });
  await act(async () => {
    surface.dispatchEvent(native);
  });
  return native;
}

/** Two bounded events compose to 2x about the anchor. */
async function zoomTo2x(surface: Element, clientX = 160, clientY = 160) {
  await wheel(surface, { clientX, clientY, deltaY: -240 });
  await wheel(surface, { clientX, clientY, deltaY: -240 });
}

function percent(value: string): number {
  return Number(value.replace("%", ""));
}

describe("field viewport in React", () => {
  it("refreshes scrolled bounds during pan without moving the grabbed field point", async () => {
    const clock = frames();
    const ui = await host();
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    await zoomTo2x(surface);
    await clock.flush();
    await event(surface, "pointerdown", {
      button: 1,
      buttons: 4,
      clientX: 160,
      clientY: 160,
    });
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(new DOMRect(0, -64, 320, 320));
    await act(async () => surface.parentElement!.dispatchEvent(new Event("scroll")));
    await event(surface, "pointermove", { buttons: 4, clientX: 160, clientY: 160 });
    await event(surface, "pointerup", {
      button: 1,
      buttons: 0,
      clientX: 160,
      clientY: 160,
    });
    await clock.flush();
    expect(viewBoxOf(ui.element)).toEqual([250, 150, 500, 500]);
    expect(ui.changes).not.toHaveBeenCalled();
    expect(ui.commits).not.toHaveBeenCalled();
    expect(ui.cancels).not.toHaveBeenCalled();
  });

  it("declines a second pointer edit while a pan owns the surface", async () => {
    const clock = frames();
    const ui = await host();
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    await event(surface, "pointerdown", { pointerId: 1, button: 1, buttons: 4 });
    await event(surface, "pointerdown", {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      buttons: 1,
      clientX: 80,
      clientY: 240,
    });
    await event(surface, "pointerup", {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      buttons: 0,
      clientX: 80,
      clientY: 240,
    });
    await clock.flush();
    expect(surface.hasAttribute("data-gp-viewport-panning")).toBe(true);
    expect(ui.changes).not.toHaveBeenCalled();
    expect(ui.commits).not.toHaveBeenCalled();
  });
  it("never turns browser chords or composing keys into color edits during a pan", async () => {
    const clock = frames();
    const ui = await host();
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    await zoomTo2x(surface);
    await clock.flush();
    await event(surface, "pointerdown", { button: 1, buttons: 4 });
    for (const modifiers of [
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { isComposing: true },
    ])
      await event(surface, "keydown", { key: "ArrowRight", ...modifiers });
    expect(ui.changes).not.toHaveBeenCalled();
    expect(ui.commits).not.toHaveBeenCalled();
    expect(surface.hasAttribute("data-gp-viewport-panning")).toBe(true);
  });

  it("resize drops a pending pan pose before a later animation frame", async () => {
    const clock = frames();
    const ui = await host();
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    await zoomTo2x(surface);
    await clock.flush();
    const shown = viewBoxOf(ui.element);
    await event(surface, "pointerdown", { button: 1, buttons: 4, clientX: 160, clientY: 160 });
    await event(surface, "pointermove", { buttons: 4, clientX: 220, clientY: 160 });
    expect(clock.size).toBe(1);
    await act(async () => window.dispatchEvent(new Event("resize")));
    await clock.flush();
    expect(viewBoxOf(ui.element)).toEqual(shown);
    expect(surface.hasAttribute("data-gp-viewport-panning")).toBe(false);
    await event(surface, "pointerup", { button: 1, buttons: 0, clientX: 250, clientY: 160 });
    await clock.flush();
    expect(viewBoxOf(ui.element)).toEqual(shown);
    expect(ui.changes).not.toHaveBeenCalled();
    expect(ui.commits).not.toHaveBeenCalled();
    expect(ui.cancels).not.toHaveBeenCalled();
  });

  it("starting a sibling color range discards an unpresented zoom", async () => {
    const clock = frames();
    const ui = await host();
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    await zoomTo2x(surface);
    await event(get(ui.element, '[data-gp-part="native-range"]'), "pointerdown", {
      button: 0,
      buttons: 1,
    });
    await clock.flush();
    expect(zoomOf(ui.element)).toBe(1);
    expect(ui.changes).not.toHaveBeenCalled();
  });

  it("a parent commit preserves a pending color preview under zoom", async () => {
    const clock = frames();
    const change = vi.fn();
    const state = editingState("oklch");
    const render = () => <GamutPlane value={initial} onValueChange={change} state={state} />;
    const ui = await mount(render());
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    await zoomTo2x(surface);
    await clock.flush();
    await event(surface, "pointerdown", { button: 0, buttons: 1, clientX: 80, clientY: 240 });
    const marker = get<HTMLElement>(ui.element, "[data-active-marker]");
    expect(percent(marker.style.left)).toBeCloseTo(25, 6);
    await ui.render(render());
    expect(percent(marker.style.left)).toBeCloseTo(25, 6);
    expect(percent(marker.style.top)).toBeCloseTo(75, 6);
    await clock.flush();
    expect(change).toHaveBeenCalledOnce();
  });

  it("presents one coherent camera frame and stays silent about color", async () => {
    const clock = frames();
    const ui = await host();
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    const marker = get<HTMLElement>(ui.element, "[data-active-marker]");
    const fittedLeft = marker.style.left;
    const native = await wheel(surface, { clientX: 160, clientY: 160, deltaY: -240 });
    expect(native.defaultPrevented).toBe(true);
    await wheel(surface, { clientX: 160, clientY: 160, deltaY: -240 });
    // Requested, not presented: no layer has moved yet.
    expect(zoomOf(ui.element)).toBe(1);
    expect(marker.style.left).toBe(fittedLeft);
    expect(viewBoxOf(ui.element)).toEqual([0, 0, 1000, 1000]);
    await clock.flush();
    expect(zoomOf(ui.element)).toBeCloseTo(2, 9);
    // Initial color is C 0.2 / L 0.62: field (0.5, 0.38) -> viewport (0.5, 0.26) at centered 2x.
    expect(percent(marker.style.left)).toBeCloseTo(50, 6);
    expect(percent(marker.style.top)).toBeCloseTo(26, 6);
    expect(viewBoxOf(ui.element)).toEqual([250, 250, 500, 500]);
    expect(get(ui.element, '[data-gp-part="viewport-zoom"]').textContent).toBe("200%");
    const ends = [...ui.element.querySelectorAll('[data-gp-part="axis-end"]')].map(
      (node) => `${(node as HTMLElement).dataset.gpEnd}=${node.textContent}`,
    );
    expect(ends).toEqual(["y-end=0.75", "y-start=0.25", "x-start=0.1", "x-end=0.3"]);
    expect(ui.changes).not.toHaveBeenCalled();
    expect(ui.commits).not.toHaveBeenCalled();
    expect(ui.cancels).not.toHaveBeenCalled();
  });

  it("leaves ordinary wheel and browser zoom chords alone", async () => {
    const clock = frames();
    const ui = await host();
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    expect(
      (await wheel(surface, { clientX: 160, clientY: 160, deltaY: -240, altKey: false }))
        .defaultPrevented,
    ).toBe(false);
    expect(
      (await wheel(surface, { clientX: 160, clientY: 160, deltaY: -240, ctrlKey: true }))
        .defaultPrevented,
    ).toBe(false);
    await clock.flush();
    expect(zoomOf(ui.element)).toBe(1);
  });

  it("maps editing through the inverse camera before the editor constraint", async () => {
    const clock = frames();
    const ui = await host();
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    await zoomTo2x(surface);
    await clock.flush();
    // Viewport (0.25, 0.75) at centered 2x is field (0.375, 0.625).
    await event(surface, "pointerdown", { clientX: 80, clientY: 240 });
    await clock.flush();
    await event(surface, "pointerup", { clientX: 80, clientY: 240 });
    const final = ui.commits.mock.calls[0]![0];
    const point = projectColorToPlane(final, "oklch");
    if (!point.ok) throw new Error("projection");
    expect(point.value.point.x).toBeCloseTo(0.375, 9);
    expect(point.value.point.y).toBeCloseTo(0.625, 9);
    // A drag past the surface remains a point of the larger field, not the visible window.
    await event(surface, "pointerdown", { clientX: 160, clientY: 160 });
    await event(surface, "pointerup", { clientX: 384, clientY: 160 });
    const beyond = projectColorToPlane(ui.commits.mock.calls[1]![0], "oklch");
    if (!beyond.ok) throw new Error("projection");
    expect(beyond.value.point.x).toBeCloseTo(0.85, 9);
    expect(zoomOf(ui.element)).toBeCloseTo(2, 9);
  });

  it("interprets a press against the presented camera and discards an unpresented zoom", async () => {
    const clock = frames();
    const ui = await host();
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    await zoomTo2x(surface);
    expect(clock.size).toBe(1);
    await event(surface, "pointerdown", { clientX: 80, clientY: 100 });
    // The pending zoom frame was cancelled, not flushed.
    expect(clock.size).toBeLessThanOrEqual(1);
    await clock.flush();
    await event(surface, "pointerup", { clientX: 80, clientY: 100 });
    const point = projectColorToPlane(ui.commits.mock.calls[0]![0], "oklch");
    if (!point.ok) throw new Error("projection");
    expect(point.value.point.x).toBeCloseTo(80 / 320, 9);
    expect(point.value.point.y).toBeCloseTo(100 / 320, 9);
    await clock.flush();
    expect(zoomOf(ui.element)).toBe(1);
  });

  it("holds the camera still during a color gesture and keeps the same pose at pointerup", async () => {
    const clock = frames();
    const ui = await host();
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    await zoomTo2x(surface);
    await clock.flush();
    await event(surface, "pointerdown", { clientX: 160, clientY: 160 });
    const native = await wheel(surface, { clientX: 40, clientY: 40, deltaY: -240 });
    expect(native.defaultPrevented).toBe(true);
    await clock.flush();
    expect(zoomOf(ui.element)).toBeCloseTo(2, 9);
    await event(surface, "pointerup", { clientX: 80, clientY: 240 });
    const point = projectColorToPlane(ui.commits.mock.calls[0]![0], "oklch");
    if (!point.ok) throw new Error("projection");
    expect(point.value.point.x).toBeCloseTo(0.375, 9);
  });

  it("pans with the middle button and with Space without authoring or editing", async () => {
    const clock = frames();
    const ui = await host();
    await clock.flush();
    const surface = get<HTMLElement>(ui.element, '[role="application"]');
    await zoomTo2x(surface);
    await clock.flush();
    await event(surface, "pointerdown", { button: 1, buttons: 4, clientX: 160, clientY: 160 });
    await event(surface, "pointermove", { buttons: 4, clientX: 192, clientY: 160 });
    await event(surface, "pointerup", { button: 1, buttons: 0, clientX: 192, clientY: 160 });
    await clock.flush();
    // Content followed the pointer 0.1 viewport = 0.05 field: window left 0.25 - 0.05.
    expect(viewBoxOf(ui.element)[0]).toBeCloseTo(200, 6);
    await act(async () => surface.focus());
    await event(surface, "keydown", { key: " ", code: "Space" });
    await event(surface, "pointerdown", { button: 0, buttons: 1, clientX: 160, clientY: 160 });
    await event(surface, "pointermove", { buttons: 1, clientX: 160, clientY: 128 });
    await event(surface, "pointerup", { button: 0, buttons: 0, clientX: 160, clientY: 128 });
    await event(surface, "keyup", { key: " ", code: "Space" });
    await clock.flush();
    expect(viewBoxOf(ui.element)[1]).toBeCloseTo(300, 6);
    expect(ui.changes).not.toHaveBeenCalled();
    expect(ui.commits).not.toHaveBeenCalled();
    expect(ui.cancels).not.toHaveBeenCalled();
    // Editing resumes afterwards.
    await event(surface, "pointerdown", { clientX: 160, clientY: 160 });
    await event(surface, "pointerup", { clientX: 160, clientY: 160 });
    expect(ui.commits).toHaveBeenCalledOnce();
  });

  it("restores the camera-projected accepted marker, not its 1x position, on rollback", async () => {
    const clock = frames();
    const ui = await host();
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    const marker = get<HTMLElement>(ui.element, "[data-active-marker]");
    // Anchor (0.8, 0.3): center (0.65, 0.4); marker field (0.5, 0.38) -> viewport (0.2, 0.46).
    await zoomTo2x(surface, 256, 96);
    await clock.flush();
    expect(percent(marker.style.left)).toBeCloseTo(20, 4);
    expect(percent(marker.style.top)).toBeCloseTo(46, 4);
    await event(surface, "pointerdown", { clientX: 200, clientY: 200 });
    await clock.flush();
    expect(percent(marker.style.left)).toBeCloseTo((200 / 320) * 100, 4);
    await event(surface, "keydown", { key: "Escape" });
    expect(ui.cancels).toHaveBeenCalledOnce();
    expect(percent(marker.style.left)).toBeCloseTo(20, 4);
    expect(percent(marker.style.top)).toBeCloseTo(46, 4);
  });

  it("keeps the camera across same-geometry changes and resets for an accepted editor change", async () => {
    const clock = frames();
    const ui = await host();
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    await zoomTo2x(surface);
    await clock.flush();
    await ui.replace(color(0.5, 0.1, 100, 0.37));
    await clock.flush();
    expect(zoomOf(ui.element)).toBeCloseTo(2, 9);
    expect(viewBoxOf(ui.element)).toEqual([250, 250, 500, 500]);
    await selectRepresentation(ui.element, "oklab");
    await clock.flush();
    expect(zoomOf(ui.element)).toBe(1);
    expect(viewBoxOf(ui.element)).toEqual([0, 0, 1000, 1000]);
    expect(
      [...ui.element.querySelectorAll('[data-gp-part="axis-end"]')].map((node) => node.textContent),
    ).toEqual(["0.4", "-0.4", "-0.4", "0.4"]);
  });

  it("preserves the camera when a controlled editor request is rejected", async () => {
    const clock = frames();
    const requests = vi.fn();
    const ui = await mount(
      <GamutPlane
        value={initial}
        onValueChange={() => {}}
        state={editingState("oklch")}
        onStateChange={requests}
      />,
    );
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    await zoomTo2x(surface);
    await clock.flush();
    await selectRepresentation(ui.element, "oklab");
    await clock.flush();
    expect(requests).toHaveBeenCalled();
    expect(zoomOf(ui.element)).toBeCloseTo(2, 9);
    expect(
      requests.mock.calls.every(([state]) => state.selection.representationId !== undefined),
    ).toBe(true);
  });

  it("keeps two instances independent", async () => {
    const clock = frames();
    const ui = await mount(
      <>
        <GamutPlane value={initial} onValueChange={() => {}} state={editingState("oklch")} />
        <GamutPlane value={initial} onValueChange={() => {}} state={editingState("oklch")} />
      </>,
    );
    await clock.flush();
    const surfaces = [...ui.element.querySelectorAll('[role="application"]')];
    await zoomTo2x(surfaces[0]!);
    await clock.flush();
    const zooms = [...ui.element.querySelectorAll('[data-gp-part="plane"]')].map((plane) =>
      Number((plane as HTMLElement).dataset.gpViewportZoom),
    );
    expect(zooms[0]).toBeCloseTo(2, 9);
    expect(zooms[1]).toBe(1);
  });

  it("zooms through the native buttons and Fit without a hidden color change", async () => {
    const clock = frames();
    const ui = await host();
    await clock.flush();
    const button = (name: string) =>
      get<HTMLButtonElement>(ui.element, `[data-gp-viewport="${name}"]`);
    await act(async () => button("in").click());
    await act(async () => button("in").click());
    await clock.flush();
    expect(zoomOf(ui.element)).toBeCloseTo(1.5625, 9);
    expect(get(ui.element, '[data-gp-part="viewport-zoom"]').textContent).toBe("156%");
    expect(button("fit").getAttribute("aria-disabled")).toBeNull();
    await act(async () => button("fit").click());
    expect(zoomOf(ui.element)).toBe(1);
    expect(button("fit").getAttribute("aria-disabled")).toBe("true");
    expect(button("out").getAttribute("aria-disabled")).toBe("true");
    expect(ui.changes).not.toHaveBeenCalled();
    expect(ui.commits).not.toHaveBeenCalled();
  });

  it("routes Space-armed arrows to the camera and plain arrows to color", async () => {
    const clock = frames();
    const ui = await host();
    await clock.flush();
    const surface = get<HTMLElement>(ui.element, '[role="application"]');
    await zoomTo2x(surface);
    await clock.flush();
    await event(surface, "keydown", { key: " ", code: "Space" });
    await event(surface, "keydown", { key: "ArrowRight" });
    await event(surface, "keyup", { key: " ", code: "Space" });
    await clock.flush();
    // 10% of the viewport span to the right: the camera center moves +0.05 field.
    expect(viewBoxOf(ui.element)[0]).toBeCloseTo(300, 6);
    expect(ui.commits).not.toHaveBeenCalled();
    await event(surface, "keydown", { key: "ArrowRight" });
    expect(ui.commits).toHaveBeenCalledOnce();
  });

  it("cancels frames and listeners on unmount and makes late input inert", async () => {
    const clock = frames();
    const ui = await host();
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    await zoomTo2x(surface);
    expect(clock.size).toBe(1);
    await ui.unmount();
    expect(clock.size).toBe(0);
    await wheel(surface, { clientX: 160, clientY: 160, deltaY: -240 });
    expect(clock.size).toBe(0);
  });

  it("survives Strict Mode replay with one presentation per frame", async () => {
    const clock = frames();
    const ui = await mount(
      <StrictMode>
        <GamutPlane value={initial} onValueChange={() => {}} state={editingState("oklch")} />
      </StrictMode>,
    );
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    const context = canvasContext(get<HTMLCanvasElement>(ui.element, "canvas"));
    const before = context.clearRect.mock.calls.length;
    await zoomTo2x(surface);
    await clock.flush();
    expect(zoomOf(ui.element)).toBeCloseTo(2, 9);
    expect(context.clearRect.mock.calls.length).toBe(before + 1);
    await ui.unmount();
    expect(clock.size).toBe(0);
  });

  it("lets abandoned renders neither move the camera nor feed it uncommitted facts", async () => {
    const clock = frames();
    const abandoned = createColorValue({ space: "oklch", channels: [0.2, 0.05, 10], alpha: 0.37 });
    if (!abandoned.ok) throw new Error("fixture");
    const pending = new Promise<void>(() => {});
    function Gate({ blocked }: { blocked: boolean }) {
      if (blocked) throw pending;
      return null;
    }
    const render = (value: ColorValue, blocked = false) => (
      <Suspense fallback={<p>Pending parent</p>}>
        <GamutPlane value={value} onValueChange={() => {}} state={editingState("oklch")} />
        <Gate blocked={blocked} />
      </Suspense>
    );
    const ui = await mount(render(initial));
    await clock.flush();
    await act(async () => {
      startTransition(() => ui.schedule(render(abandoned.value, true)));
    });
    const surface = get(ui.element, '[role="application"]');
    await zoomTo2x(surface);
    await clock.flush();
    const marker = get<HTMLElement>(ui.element, "[data-active-marker]");
    // The committed color (C 0.2 / L 0.62) places the marker; the abandoned one never does.
    expect(percent(marker.style.top)).toBeCloseTo(26, 6);
    await ui.unmount();
  });

  it("never re-renders the instrument or its exact and guide facts for camera-only work", async () => {
    const clock = frames();
    const commits = vi.fn();
    const ui = await mount(
      <Profiler id="instrument" onRender={commits}>
        <GamutPlane value={initial} onValueChange={() => {}} state={editingState("oklch")} />
      </Profiler>,
    );
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    const renders = commits.mock.calls.length;
    await zoomTo2x(surface);
    await clock.flush();
    await event(surface, "pointerdown", { button: 1, buttons: 4, clientX: 160, clientY: 160 });
    await event(surface, "pointermove", { buttons: 4, clientX: 200, clientY: 160 });
    await event(surface, "pointerup", { button: 1, buttons: 0, clientX: 200, clientY: 160 });
    await clock.flush();
    await act(async () => get<HTMLButtonElement>(ui.element, '[data-gp-viewport="fit"]').click());
    expect(zoomOf(ui.element)).toBe(1);
    // Camera frames are imperative: no React commit, so no exact or guide work could rerun.
    expect(commits.mock.calls.length).toBe(renders);
  });

  it("schedules at most one presentation frame for a burst of wheel events", async () => {
    const clock = frames();
    const ui = await host();
    await clock.flush();
    const surface = get(ui.element, '[role="application"]');
    for (let index = 0; index < 20; index += 1)
      await wheel(surface, { clientX: 100 + index, clientY: 120, deltaY: -20 });
    expect(clock.size).toBe(1);
    await clock.flush();
    expect(clock.size).toBe(0);
  });
});
