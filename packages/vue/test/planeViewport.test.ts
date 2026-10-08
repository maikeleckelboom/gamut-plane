import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  projectColorToPlane,
  OKLAB_AB_PLANE,
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  type ColorValue,
  type PickerPlaneFieldSampler,
  type PickerPlaneGeometry,
} from "@gamut-plane/core";
import ColorPlane from "../src/components/ColorPlane.vue";
import GamutPlane from "../src/components/GamutPlane.vue";
import { color, planeValue } from "./colorValue";
import { dispatchPointer, installAnimationFrameController } from "./interactionHelpers";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

type Plane = PickerPlaneGeometry & PickerPlaneFieldSampler;

function mountPlane(value: ColorValue, plane: Plane = OKLCH_LIGHTNESS_CHROMA_PLANE) {
  const wrapper = mount(ColorPlane, {
    attachTo: document.body,
    props: {
      ...planeValue(value, plane.id),
      plane,
      semanticContextKey: plane.id === "oklch" ? "oklch:oklch-lc" : "oklab:oklab-ab",
    },
  });
  const surface = wrapper.get('[role="application"]').element as HTMLElement;
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 320, 320));
  const captured = new Set<number>();
  Object.defineProperties(surface, {
    setPointerCapture: { configurable: true, value: (id: number) => captured.add(id) },
    hasPointerCapture: { configurable: true, value: (id: number) => captured.has(id) },
    releasePointerCapture: { configurable: true, value: (id: number) => captured.delete(id) },
  });
  return { wrapper, surface };
}

function emitted(wrapper: VueWrapper, event: "update:modelValue" | "commit" | "cancel") {
  return (wrapper.emitted(event) ?? []).map(([value]) => value as ColorValue);
}

const plane = (wrapper: VueWrapper) => wrapper.get('[data-gp-part="plane"]').element as HTMLElement;
const zoomOf = (wrapper: VueWrapper) => Number(plane(wrapper).dataset.gpViewportZoom);
const viewBoxOf = (wrapper: VueWrapper) =>
  wrapper.get('[data-gp-part="gamut-guides"]').attributes("viewBox")!.split(" ").map(Number);
const percent = (value: string) => Number(value.replace("%", ""));

function wheel(
  surface: Element,
  init: { clientX: number; clientY: number; deltaY: number; altKey?: boolean; ctrlKey?: boolean },
) {
  const native = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    altKey: true,
    ...init,
  });
  surface.dispatchEvent(native);
  return native;
}

function zoomTo2x(surface: Element, clientX = 160, clientY = 160) {
  wheel(surface, { clientX, clientY, deltaY: -240 });
  wheel(surface, { clientX, clientY, deltaY: -240 });
}

function key(surface: Element, init: KeyboardEventInit) {
  surface.dispatchEvent(
    new KeyboardEvent(init.key === " " || init.key?.startsWith("Arrow") ? "keydown" : "keydown", {
      bubbles: true,
      cancelable: true,
      ...init,
    }),
  );
}

describe("field viewport in Vue", () => {
  it("refreshes scrolled bounds during pan without moving the grabbed field point", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, surface } = mountPlane(color(0.62, 0.2, 45));
    await flushPromises();
    frames.flush();
    zoomTo2x(surface);
    frames.flush();
    dispatchPointer(surface, "pointerdown", {
      button: 1,
      buttons: 4,
      clientX: 160,
      clientY: 160,
    });
    vi.mocked(surface.getBoundingClientRect).mockReturnValue(new DOMRect(0, -64, 320, 320));
    surface.parentElement!.dispatchEvent(new Event("scroll"));
    dispatchPointer(surface, "pointermove", { buttons: 4, clientX: 160, clientY: 160 });
    dispatchPointer(surface, "pointerup", {
      button: 1,
      buttons: 0,
      clientX: 160,
      clientY: 160,
    });
    frames.flush();
    expect(viewBoxOf(wrapper)).toEqual([250, 150, 500, 500]);
    expect(emitted(wrapper, "update:modelValue")).toHaveLength(0);
    expect(emitted(wrapper, "commit")).toHaveLength(0);
    expect(emitted(wrapper, "cancel")).toHaveLength(0);
    wrapper.unmount();
  });

  it("declines a second pointer edit while a pan owns the surface", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, surface } = mountPlane(color(0.62, 0.2, 45));
    await flushPromises();
    frames.flush();
    dispatchPointer(surface, "pointerdown", { pointerId: 1, button: 1, buttons: 4 });
    dispatchPointer(surface, "pointerdown", {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      buttons: 1,
      clientX: 80,
      clientY: 240,
    });
    dispatchPointer(surface, "pointerup", {
      pointerId: 2,
      pointerType: "touch",
      button: 0,
      buttons: 0,
      clientX: 80,
      clientY: 240,
    });
    frames.flush();
    expect(surface.hasAttribute("data-gp-viewport-panning")).toBe(true);
    expect(emitted(wrapper, "update:modelValue")).toHaveLength(0);
    expect(emitted(wrapper, "commit")).toHaveLength(0);
    wrapper.unmount();
  });
  it("never turns browser chords or composing keys into color edits during a pan", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, surface } = mountPlane(color(0.62, 0.2, 45));
    await flushPromises();
    frames.flush();
    zoomTo2x(surface);
    frames.flush();
    dispatchPointer(surface, "pointerdown", { pointerId: 1, button: 1, buttons: 4 });
    for (const modifiers of [
      { ctrlKey: true },
      { altKey: true },
      { metaKey: true },
      { isComposing: true },
    ])
      key(surface, { key: "ArrowRight", ...modifiers });
    expect(emitted(wrapper, "update:modelValue")).toHaveLength(0);
    expect(emitted(wrapper, "commit")).toHaveLength(0);
    expect(surface.hasAttribute("data-gp-viewport-panning")).toBe(true);
    wrapper.unmount();
  });

  it("resize drops a pending pan pose before a later animation frame", async () => {
    const callbacks: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          callbacks.push(callback);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const frames = installAnimationFrameController();
    const { wrapper, surface } = mountPlane(color(0.62, 0.2, 45));
    await flushPromises();
    frames.flush();
    zoomTo2x(surface);
    frames.flush();
    const shown = viewBoxOf(wrapper);
    dispatchPointer(surface, "pointerdown", {
      pointerId: 1,
      button: 1,
      buttons: 4,
      clientX: 160,
      clientY: 160,
    });
    dispatchPointer(surface, "pointermove", {
      pointerId: 1,
      buttons: 4,
      clientX: 220,
      clientY: 160,
    });
    expect(frames.pendingCount).toBe(1);
    for (const callback of callbacks) callback([], {} as ResizeObserver);
    frames.flush();
    expect(viewBoxOf(wrapper)).toEqual(shown);
    dispatchPointer(surface, "pointerup", {
      pointerId: 1,
      button: 1,
      buttons: 0,
      clientX: 250,
      clientY: 160,
    });
    frames.flush();
    expect(viewBoxOf(wrapper)).toEqual(shown);
    expect(emitted(wrapper, "update:modelValue")).toHaveLength(0);
    expect(emitted(wrapper, "commit")).toHaveLength(0);
    expect(emitted(wrapper, "cancel")).toHaveLength(0);
    wrapper.unmount();
  });

  it("starting a sibling color range discards an unpresented zoom", async () => {
    const frames = installAnimationFrameController();
    const wrapper = mount(GamutPlane, {
      attachTo: document.body,
      props: { modelValue: color(0.62, 0.2, 45) },
    });
    await flushPromises();
    frames.flush();
    const surface = wrapper.get('[role="application"]').element as HTMLElement;
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 320, 320));
    zoomTo2x(surface);
    dispatchPointer(wrapper.get('[data-gp-part="native-range"]').element, "pointerdown", {
      pointerId: 2,
      button: 0,
      buttons: 1,
    });
    frames.flush();
    expect(zoomOf(wrapper)).toBe(1);
    expect(emitted(wrapper, "update:modelValue")).toHaveLength(0);
    wrapper.unmount();
  });

  it.each([1, 2])("a component patch preserves a pending color preview at %sx", async (zoom) => {
    const frames = installAnimationFrameController();
    const { wrapper, surface } = mountPlane(color(0.62, 0.2, 45));
    await flushPromises();
    frames.flush();
    if (zoom === 2) {
      zoomTo2x(surface);
      frames.flush();
    }
    dispatchPointer(surface, "pointerdown", { pointerId: 1, clientX: 80, clientY: 240 });
    const marker = wrapper.get("[data-active-marker]").element as HTMLElement;
    expect(percent(marker.style.left)).toBeCloseTo(25, 6);
    await wrapper.setProps({ warning: "Outside sRGB" });
    expect(percent(marker.style.left)).toBeCloseTo(25, 6);
    expect(percent(marker.style.top)).toBeCloseTo(75, 6);
    frames.flush();
    expect(emitted(wrapper, "update:modelValue")).toHaveLength(1);
    wrapper.unmount();
  });

  it("presents one coherent camera frame and stays silent about color", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, surface } = mountPlane(color(0.62, 0.2, 45, 0.37));
    await flushPromises();
    frames.flush();
    const marker = wrapper.get("[data-active-marker]").element as HTMLElement;
    const fittedLeft = marker.style.left;
    expect(wheel(surface, { clientX: 160, clientY: 160, deltaY: -240 }).defaultPrevented).toBe(
      true,
    );
    wheel(surface, { clientX: 160, clientY: 160, deltaY: -240 });
    // Requested, not presented.
    expect(zoomOf(wrapper)).toBe(1);
    expect(marker.style.left).toBe(fittedLeft);
    expect(viewBoxOf(wrapper)).toEqual([0, 0, 1000, 1000]);
    frames.flush();
    expect(zoomOf(wrapper)).toBeCloseTo(2, 9);
    expect(percent(marker.style.left)).toBeCloseTo(50, 6);
    expect(percent(marker.style.top)).toBeCloseTo(26, 6);
    expect(viewBoxOf(wrapper)).toEqual([250, 250, 500, 500]);
    expect(wrapper.get('[data-gp-part="viewport-zoom"]').text()).toBe("200%");
    expect(
      wrapper
        .findAll('[data-gp-part="axis-end"]')
        .map((node) => `${node.attributes("data-gp-end")}=${node.text()}`),
    ).toEqual(["y-end=0.75", "y-start=0.25", "x-start=0.1", "x-end=0.3"]);
    expect(emitted(wrapper, "update:modelValue")).toHaveLength(0);
    expect(emitted(wrapper, "commit")).toHaveLength(0);
    expect(wrapper.emitted("cancel")).toBeUndefined();
    wrapper.unmount();
  });

  it("leaves ordinary wheel and browser zoom chords alone", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, surface } = mountPlane(color(0.62, 0.2, 45));
    await flushPromises();
    frames.flush();
    expect(
      wheel(surface, { clientX: 160, clientY: 160, deltaY: -240, altKey: false }).defaultPrevented,
    ).toBe(false);
    expect(
      wheel(surface, { clientX: 160, clientY: 160, deltaY: -240, ctrlKey: true }).defaultPrevented,
    ).toBe(false);
    frames.flush();
    expect(zoomOf(wrapper)).toBe(1);
    wrapper.unmount();
  });

  it("maps editing through the inverse camera, never the visible window", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, surface } = mountPlane(color(0.62, 0.2, 45));
    await flushPromises();
    frames.flush();
    zoomTo2x(surface);
    frames.flush();
    dispatchPointer(surface, "pointerdown", { pointerId: 1, clientX: 80, clientY: 240 });
    frames.flush();
    dispatchPointer(surface, "pointerup", { pointerId: 1, clientX: 80, clientY: 240 });
    const point = projectColorToPlane(emitted(wrapper, "commit")[0]!, "oklch");
    if (!point.ok) throw new Error("projection");
    expect(point.value.point.x).toBeCloseTo(0.375, 9);
    expect(point.value.point.y).toBeCloseTo(0.625, 9);
    dispatchPointer(surface, "pointerdown", { pointerId: 1, clientX: 160, clientY: 160 });
    dispatchPointer(surface, "pointerup", { pointerId: 1, clientX: 384, clientY: 160 });
    const beyond = projectColorToPlane(emitted(wrapper, "commit")[1]!, "oklch");
    if (!beyond.ok) throw new Error("projection");
    expect(beyond.value.point.x).toBeCloseTo(0.85, 9);
    wrapper.unmount();
  });

  it("interprets a press against the presented camera and discards an unpresented zoom", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, surface } = mountPlane(color(0.62, 0.2, 45));
    await flushPromises();
    frames.flush();
    zoomTo2x(surface);
    expect(frames.pendingCount).toBe(1);
    dispatchPointer(surface, "pointerdown", { pointerId: 1, clientX: 80, clientY: 100 });
    // The pending zoom frame was cancelled, not flushed.
    expect(frames.cancellationCount).toBeGreaterThan(0);
    frames.flush();
    dispatchPointer(surface, "pointerup", { pointerId: 1, clientX: 80, clientY: 100 });
    const point = projectColorToPlane(emitted(wrapper, "commit")[0]!, "oklch");
    if (!point.ok) throw new Error("projection");
    expect(point.value.point.x).toBeCloseTo(80 / 320, 9);
    expect(point.value.point.y).toBeCloseTo(100 / 320, 9);
    frames.flush();
    expect(zoomOf(wrapper)).toBe(1);
    wrapper.unmount();
  });

  it("holds the camera still during a color gesture", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, surface } = mountPlane(color(0.62, 0.2, 45));
    await flushPromises();
    frames.flush();
    zoomTo2x(surface);
    frames.flush();
    dispatchPointer(surface, "pointerdown", { pointerId: 1, clientX: 160, clientY: 160 });
    wrapper.element.setAttribute("data-gp-root", "");
    expect(wheel(surface, { clientX: 40, clientY: 40, deltaY: -240 }).defaultPrevented).toBe(true);
    frames.flush();
    expect(zoomOf(wrapper)).toBeCloseTo(2, 9);
    dispatchPointer(surface, "pointerup", { pointerId: 1, clientX: 80, clientY: 240 });
    const point = projectColorToPlane(emitted(wrapper, "commit")[0]!, "oklch");
    if (!point.ok) throw new Error("projection");
    expect(point.value.point.x).toBeCloseTo(0.375, 9);
    wrapper.unmount();
  });

  it("pans with the middle button and with Space without authoring or editing", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, surface } = mountPlane(color(0.62, 0.2, 45));
    await flushPromises();
    frames.flush();
    zoomTo2x(surface);
    frames.flush();
    dispatchPointer(surface, "pointerdown", {
      pointerId: 1,
      button: 1,
      buttons: 4,
      clientX: 160,
      clientY: 160,
    });
    dispatchPointer(surface, "pointermove", {
      pointerId: 1,
      buttons: 4,
      clientX: 192,
      clientY: 160,
    });
    dispatchPointer(surface, "pointerup", {
      pointerId: 1,
      button: 1,
      buttons: 0,
      clientX: 192,
      clientY: 160,
    });
    frames.flush();
    expect(viewBoxOf(wrapper)[0]).toBeCloseTo(200, 6);
    surface.focus();
    key(surface, { key: " ", code: "Space" });
    dispatchPointer(surface, "pointerdown", {
      pointerId: 1,
      button: 0,
      buttons: 1,
      clientX: 160,
      clientY: 160,
    });
    dispatchPointer(surface, "pointermove", {
      pointerId: 1,
      buttons: 1,
      clientX: 160,
      clientY: 128,
    });
    dispatchPointer(surface, "pointerup", {
      pointerId: 1,
      button: 0,
      buttons: 0,
      clientX: 160,
      clientY: 128,
    });
    document.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true }));
    frames.flush();
    expect(viewBoxOf(wrapper)[1]).toBeCloseTo(300, 6);
    expect(emitted(wrapper, "update:modelValue")).toHaveLength(0);
    expect(emitted(wrapper, "commit")).toHaveLength(0);
    expect(wrapper.emitted("cancel")).toBeUndefined();
    dispatchPointer(surface, "pointerdown", { pointerId: 1, clientX: 160, clientY: 160 });
    dispatchPointer(surface, "pointerup", { pointerId: 1, clientX: 160, clientY: 160 });
    expect(emitted(wrapper, "commit")).toHaveLength(1);
    wrapper.unmount();
  });

  it("restores the camera-projected accepted marker, not its 1x position, on rollback", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, surface } = mountPlane(color(0.62, 0.2, 45));
    await flushPromises();
    frames.flush();
    const marker = wrapper.get("[data-active-marker]").element as HTMLElement;
    zoomTo2x(surface, 256, 96);
    frames.flush();
    expect(percent(marker.style.left)).toBeCloseTo(20, 4);
    expect(percent(marker.style.top)).toBeCloseTo(46, 4);
    dispatchPointer(surface, "pointerdown", { pointerId: 1, clientX: 200, clientY: 200 });
    frames.flush();
    expect(percent(marker.style.left)).toBeCloseTo((200 / 320) * 100, 4);
    await wrapper.get('[role="application"]').trigger("keydown", { key: "Escape" });
    expect(emitted(wrapper, "cancel")).toHaveLength(1);
    expect(percent(marker.style.left)).toBeCloseTo(20, 4);
    expect(percent(marker.style.top)).toBeCloseTo(46, 4);
    wrapper.unmount();
  });

  it("keeps the camera across same-geometry changes and resets for an accepted editor change", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, surface } = mountPlane(color(0.62, 0.2, 45));
    await flushPromises();
    frames.flush();
    zoomTo2x(surface);
    frames.flush();
    const next = color(0.5, 0.1, 100);
    await wrapper.setProps({ ...planeValue(next, "oklch") });
    frames.flush();
    expect(zoomOf(wrapper)).toBeCloseTo(2, 9);
    expect(viewBoxOf(wrapper)).toEqual([250, 250, 500, 500]);
    await wrapper.setProps({
      ...planeValue(next, "oklab"),
      plane: OKLAB_AB_PLANE,
      semanticContextKey: "oklab:oklab-ab",
    });
    await flushPromises();
    frames.flush();
    expect(zoomOf(wrapper)).toBe(1);
    expect(viewBoxOf(wrapper)).toEqual([0, 0, 1000, 1000]);
    expect(wrapper.findAll('[data-gp-part="axis-end"]').map((node) => node.text())).toEqual([
      "0.4",
      "-0.4",
      "-0.4",
      "0.4",
    ]);
    // The disc outline's box is back to the stylesheet's own fit.
    const outline = wrapper.get('[data-gp-part="domain-boundary"]').element as HTMLElement;
    expect(outline.style.width).toBe("");
    wrapper.unmount();
  });

  it("keeps two instances independent and cancels frames and input on unmount", async () => {
    const frames = installAnimationFrameController();
    const first = mountPlane(color(0.62, 0.2, 45));
    const second = mountPlane(color(0.62, 0.2, 45));
    await flushPromises();
    frames.flush();
    zoomTo2x(first.surface);
    frames.flush();
    expect(zoomOf(first.wrapper)).toBeCloseTo(2, 9);
    expect(zoomOf(second.wrapper)).toBe(1);
    zoomTo2x(second.surface);
    expect(frames.pendingCount).toBe(1);
    second.wrapper.unmount();
    expect(frames.pendingCount).toBe(0);
    expect(
      wheel(second.surface, { clientX: 160, clientY: 160, deltaY: -240 }).defaultPrevented,
    ).toBe(false);
    expect(frames.pendingCount).toBe(0);
    first.wrapper.unmount();
  });

  it("routes Space-armed arrows to the camera and plain arrows to color", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, surface } = mountPlane(color(0.62, 0.2, 45));
    await flushPromises();
    frames.flush();
    zoomTo2x(surface);
    frames.flush();
    key(surface, { key: " ", code: "Space" });
    key(surface, { key: "ArrowRight" });
    document.dispatchEvent(new KeyboardEvent("keyup", { key: " ", code: "Space", bubbles: true }));
    frames.flush();
    expect(viewBoxOf(wrapper)[0]).toBeCloseTo(300, 6);
    expect(emitted(wrapper, "commit")).toHaveLength(0);
    key(surface, { key: "ArrowRight" });
    expect(emitted(wrapper, "commit")).toHaveLength(1);
    wrapper.unmount();
  });

  it("zooms through the native buttons and Fit without a hidden color change", async () => {
    const frames = installAnimationFrameController();
    const { wrapper } = mountPlane(color(0.62, 0.2, 45));
    await flushPromises();
    frames.flush();
    const button = (name: string) => wrapper.get(`[data-gp-viewport="${name}"]`);
    await button("in").trigger("click");
    await button("in").trigger("click");
    frames.flush();
    expect(zoomOf(wrapper)).toBeCloseTo(1.5625, 9);
    expect(wrapper.get('[data-gp-part="viewport-zoom"]').text()).toBe("156%");
    await button("fit").trigger("click");
    expect(zoomOf(wrapper)).toBe(1);
    expect(button("fit").attributes("aria-disabled")).toBe("true");
    expect(button("out").attributes("aria-disabled")).toBe("true");
    expect(emitted(wrapper, "update:modelValue")).toHaveLength(0);
    expect(emitted(wrapper, "commit")).toHaveLength(0);
    wrapper.unmount();
  });

  it("never triggers a reactive update of the instrument for camera-only work", async () => {
    const frames = installAnimationFrameController();
    const triggers: string[] = [];
    const wrapper = mount(GamutPlane, {
      attachTo: document.body,
      props: { modelValue: color(0.62, 0.2, 45) },
      global: {
        mixins: [
          { renderTriggered: (event: { key: unknown }) => triggers.push(String(event.key)) },
        ],
      },
    });
    await flushPromises();
    frames.flush();
    const surface = wrapper.get('[role="application"]').element as HTMLElement;
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 320, 320));
    triggers.length = 0;
    zoomTo2x(surface);
    frames.flush();
    dispatchPointer(surface, "pointerdown", {
      pointerId: 1,
      button: 1,
      buttons: 4,
      clientX: 160,
      clientY: 160,
    });
    dispatchPointer(surface, "pointerup", {
      pointerId: 1,
      button: 1,
      buttons: 0,
      clientX: 200,
      clientY: 160,
    });
    frames.flush();
    await wrapper.get('[data-gp-viewport="fit"]').trigger("click");
    await flushPromises();
    expect(Number(wrapper.get('[data-gp-part="plane"]').attributes("data-gp-viewport-zoom"))).toBe(
      1,
    );
    // Exact checks and guides live in the parent's computed state; none of it was invalidated.
    expect(triggers).toEqual([]);
    wrapper.unmount();
  });

  it("schedules at most one presentation frame for a burst of wheel events", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, surface } = mountPlane(color(0.62, 0.2, 45));
    await flushPromises();
    frames.flush();
    for (let index = 0; index < 20; index += 1)
      wheel(surface, { clientX: 100 + index, clientY: 120, deltaY: -20 });
    expect(frames.pendingCount).toBe(1);
    frames.flush();
    expect(frames.pendingCount).toBe(0);
    wrapper.unmount();
  });
});
