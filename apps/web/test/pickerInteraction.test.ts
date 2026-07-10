import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OKLCH_PICKER_MAX_CHROMA,
  getCachedGamutBoundaryTable,
  getPickerGamutStatus,
  type ChromavertColor,
  type PickerGamutBoundaryTables,
} from "@chromavert/color";
import OklchPlanarPicker from "@/components/chromavert/OklchPlanarPicker.vue";

const TABLE_OPTIONS = { hueSteps: 6, lightnessSteps: 5, searchIterations: 6 } as const;
const tables: PickerGamutBoundaryTables = {
  srgb: getCachedGamutBoundaryTable("srgb", TABLE_OPTIONS),
  displayP3: getCachedGamutBoundaryTable("display-p3", TABLE_OPTIONS),
};

function installAnimationFrameController() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();

  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    callbacks.delete(id);
  });

  return {
    flush(): void {
      const scheduled = [...callbacks.values()];
      callbacks.clear();
      for (const callback of scheduled) callback(0);
    },
  };
}

function dispatchPointer(
  element: Element,
  type: string,
  init: {
    pointerId: number;
    clientX?: number;
    clientY?: number;
    pointerType?: string;
    button?: number;
  },
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId },
    clientX: { value: init.clientX ?? 0 },
    clientY: { value: init.clientY ?? 0 },
    pointerType: { value: init.pointerType ?? "mouse" },
    button: { value: init.button ?? 0 },
  });
  element.dispatchEvent(event);
}

function emittedColors(wrapper: VueWrapper): ChromavertColor[] {
  return (wrapper.emitted("update:modelValue") ?? []).map(([color]) => color as ChromavertColor);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("OklchPlanarPicker pointer interaction", () => {
  it("coalesces rectangular drags, commits pointerup, and cancels pending movement", async () => {
    const animationFrames = installAnimationFrameController();
    const canonical: ChromavertColor = { l: 0.6, c: 0.12, h: 210, alpha: 1 };
    const wrapper = mount(OklchPlanarPicker, {
      attachTo: document.body,
      props: {
        modelValue: canonical,
        srgbTable: tables.srgb,
        displayP3Table: tables.displayP3,
        srgbFallbackColor: null,
        activeOutsideDisplayP3: false,
      },
    });
    await flushPromises();
    animationFrames.flush();

    const surface = wrapper.get("[data-picker-plane] > div").element as HTMLElement;
    const marker = wrapper.get("[data-active-marker]").element as HTMLElement;
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      x: 10,
      y: 20,
      left: 10,
      top: 20,
      right: 210,
      bottom: 120,
      width: 200,
      height: 100,
      toJSON: () => ({}),
    });

    const capturedPointers = new Set<number>();
    const setPointerCapture = vi.fn((pointerId: number) => capturedPointers.add(pointerId));
    const hasPointerCapture = vi.fn((pointerId: number) => capturedPointers.has(pointerId));
    const releasePointerCapture = vi.fn((pointerId: number) => capturedPointers.delete(pointerId));
    Object.defineProperties(surface, {
      setPointerCapture: { configurable: true, value: setPointerCapture },
      hasPointerCapture: { configurable: true, value: hasPointerCapture },
      releasePointerCapture: { configurable: true, value: releasePointerCapture },
    });

    dispatchPointer(surface, "pointerdown", { pointerId: 7, clientX: 70, clientY: 60 });
    dispatchPointer(surface, "pointermove", { pointerId: 7, clientX: -100, clientY: 300 });
    dispatchPointer(surface, "pointermove", { pointerId: 7, clientX: 500, clientY: -100 });

    expect(emittedColors(wrapper)).toHaveLength(0);
    animationFrames.flush();

    const [latestDrag] = emittedColors(wrapper);
    expect(emittedColors(wrapper)).toHaveLength(1);
    expect(latestDrag?.l).toBe(1);
    expect(latestDrag?.c).toBe(OKLCH_PICKER_MAX_CHROMA);
    expect(latestDrag?.h).toBe(canonical.h);
    const latestStatus = getPickerGamutStatus(latestDrag!, tables);
    expect(latestStatus.srgb.inGamut).toBe(false);
    expect(latestStatus.displayP3.inGamut).toBe(false);

    dispatchPointer(surface, "pointerup", { pointerId: 7, clientX: 90, clientY: 70 });

    const pointerUpColors = emittedColors(wrapper);
    expect(pointerUpColors).toHaveLength(2);
    expect(pointerUpColors[1]?.l).toBeCloseTo(0.5, 12);
    expect(pointerUpColors[1]?.c).toBeCloseTo(OKLCH_PICKER_MAX_CHROMA * 0.4, 12);
    expect(releasePointerCapture).toHaveBeenCalledWith(7);

    dispatchPointer(surface, "pointerdown", { pointerId: 8, clientX: 70, clientY: 60 });
    dispatchPointer(surface, "pointermove", { pointerId: 8, clientX: 210, clientY: 120 });
    expect(marker.style.left).toBe("100%");
    expect(marker.style.top).toBe("100%");

    dispatchPointer(surface, "pointercancel", { pointerId: 8 });
    expect(marker.style.left).toBe("30%");
    expect(marker.style.top).toBe("40%");
    animationFrames.flush();
    expect(emittedColors(wrapper)).toHaveLength(2);

    wrapper.unmount();
  });
});
