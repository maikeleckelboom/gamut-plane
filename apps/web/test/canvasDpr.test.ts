import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  getCachedGamutBoundaryTable,
  parseUserColor,
} from "@chromavert/color";
import OklchPlanarPicker from "@/components/chromavert/OklchPlanarPicker.vue";

const originalPixelRatio = window.devicePixelRatio;

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, "devicePixelRatio", {
    configurable: true,
    value: originalPixelRatio,
  });
  document.body.innerHTML = "";
});

describe("planar canvas backing store", () => {
  it("renders at the actual device pixel ratio rather than a capped ratio", async () => {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 3.25 });
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 160,
      bottom: 120,
      width: 160,
      height: 120,
      toJSON: () => ({}),
    });
    const options = { hueSteps: 6, lightnessSteps: 5, searchIterations: 6 } as const;
    const wrapper = mount(OklchPlanarPicker, {
      attachTo: document.body,
      props: {
        modelValue: parseUserColor("oklch(62% 0.2 248)"),
        plane: OKLCH_LIGHTNESS_CHROMA_PLANE,
        srgbTable: getCachedGamutBoundaryTable("srgb", options),
        displayP3Table: getCachedGamutBoundaryTable("display-p3", options),
        srgbFallbackGuideColor: null,
        warningVisible: false,
        warningLabel: "",
      },
    });
    await flushPromises();

    const canvas = wrapper.get("canvas").element as HTMLCanvasElement;
    expect(canvas.width).toBe(520);
    expect(canvas.height).toBe(390);
    wrapper.unmount();
  });
});
