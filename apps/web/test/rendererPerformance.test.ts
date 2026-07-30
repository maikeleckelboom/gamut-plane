import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  getCachedGamutBoundaryTable,
  type PickerPlaneContract,
} from "@gamut-plane/core";
import ColorPlane from "@/components/ColorPlane.vue";

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
    get pendingCount(): number {
      return callbacks.size;
    },
    flush(): void {
      const scheduled = [...callbacks.values()];
      callbacks.clear();
      for (const callback of scheduled) callback(0);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("renderer invalidation contracts", () => {
  it("keeps field and contours stable within a fixed plane and coalesces fixed-axis redraws", async () => {
    const frames = installAnimationFrameController();
    const context = document.createElement("canvas").getContext("2d")!;
    const createLinearGradient = vi.mocked(context.createLinearGradient);
    createLinearGradient.mockClear();

    const buildGamutContour = vi.fn(OKLCH_LIGHTNESS_CHROMA_PLANE.buildGamutContour);
    const plane: PickerPlaneContract = {
      ...OKLCH_LIGHTNESS_CHROMA_PLANE,
      buildGamutContour,
    };
    const options = { hueSteps: 6, lightnessSteps: 5, searchIterations: 6 } as const;
    const wrapper = mount(ColorPlane, {
      attachTo: document.body,
      props: {
        modelValue: { l: 0.62, c: 0.2, h: 210, alpha: 1 },
        plane,
        srgbTable: getCachedGamutBoundaryTable("srgb", options),
        displayP3Table: getCachedGamutBoundaryTable("display-p3", options),
        srgbBoundaryGuideColor: null,
        warningVisible: false,
        warningLabel: "",
      },
    });
    await flushPromises();
    frames.flush();

    const initialContourBuilds = buildGamutContour.mock.calls.length;
    const initialGradientBuilds = createLinearGradient.mock.calls.length;
    const initialPath = wrapper.get('[data-gamut-boundary="srgb"]').attributes("d");
    expect(initialContourBuilds).toBe(2);
    expect(initialGradientBuilds).toBeGreaterThan(0);

    await wrapper.setProps({
      modelValue: { l: 0.74, c: 0.12, h: 210, alpha: 1 },
    });
    await flushPromises();
    frames.flush();

    expect(buildGamutContour).toHaveBeenCalledTimes(initialContourBuilds);
    expect(createLinearGradient).toHaveBeenCalledTimes(initialGradientBuilds);
    expect(wrapper.get('[data-gamut-boundary="srgb"]').attributes("d")).toBe(initialPath);

    await wrapper.setProps({
      modelValue: { l: 0.74, c: 0.12, h: 220, alpha: 1 },
    });
    await wrapper.setProps({
      modelValue: { l: 0.74, c: 0.12, h: 235, alpha: 1 },
    });
    await flushPromises();

    expect(frames.pendingCount).toBe(1);
    expect(buildGamutContour).toHaveBeenCalledTimes(initialContourBuilds + 4);
    expect(wrapper.get('[data-gamut-boundary="srgb"]').attributes("d")).not.toBe(initialPath);
    frames.flush();
    expect(createLinearGradient.mock.calls.length).toBeGreaterThan(initialGradientBuilds);

    wrapper.unmount();
  });
});
