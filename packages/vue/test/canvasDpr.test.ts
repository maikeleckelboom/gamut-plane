import { installAnimationFrameController } from "./interactionHelpers";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  getCachedGamutBoundaryTable,
  parseCssColor,
} from "@gamut-plane/core";
import ColorPlane from "../src/components/ColorPlane.vue";

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
    const wrapper = mount(ColorPlane, {
      attachTo: document.body,
      props: {
        modelValue: parseCssColor("oklch(62% 0.2 248)"),
        plane: OKLCH_LIGHTNESS_CHROMA_PLANE,
        srgbTable: getCachedGamutBoundaryTable("srgb", options),
        displayP3Table: getCachedGamutBoundaryTable("display-p3", options),
        boundaryProjectionColor: null,
        boundaryProjectionLabel: "sRGB target boundary projection",
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

  it("invalidates backing dimensions when device pixel ratio changes at runtime", async () => {
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1 });
    const frames = installAnimationFrameController();
    const resolutionListeners = new Set<(event: MediaQueryListEvent) => void>();
    vi.mocked(window.matchMedia).mockImplementation(
      (query) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
            resolutionListeners.add(listener);
          }),
          removeListener: vi.fn((listener: (event: MediaQueryListEvent) => void) => {
            resolutionListeners.delete(listener);
          }),
          addEventListener: vi.fn((_type: string, listener: EventListenerOrEventListenerObject) => {
            if (typeof listener === "function") {
              resolutionListeners.add(listener as (event: MediaQueryListEvent) => void);
            }
          }),
          removeEventListener: vi.fn(
            (_type: string, listener: EventListenerOrEventListenerObject) => {
              if (typeof listener === "function") {
                resolutionListeners.delete(listener as (event: MediaQueryListEvent) => void);
              }
            },
          ),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 80,
      width: 100,
      height: 80,
      toJSON: () => ({}),
    });
    const options = { hueSteps: 6, lightnessSteps: 5, searchIterations: 6 } as const;
    const wrapper = mount(ColorPlane, {
      attachTo: document.body,
      props: {
        modelValue: parseCssColor("oklch(62% 0.2 248)"),
        plane: OKLCH_LIGHTNESS_CHROMA_PLANE,
        srgbTable: getCachedGamutBoundaryTable("srgb", options),
        displayP3Table: getCachedGamutBoundaryTable("display-p3", options),
        boundaryProjectionColor: null,
        boundaryProjectionLabel: "sRGB target boundary projection",
        warningVisible: false,
        warningLabel: "",
      },
    });
    await flushPromises();

    const canvas = wrapper.get("canvas").element as HTMLCanvasElement;
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(80);

    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2.5 });
    for (const listener of resolutionListeners) {
      listener({ matches: false, media: "(resolution: 1dppx)" } as MediaQueryListEvent);
    }
    await flushPromises();
    expect(frames.pendingCount).toBe(1);
    frames.flush();

    expect(canvas.width).toBe(250);
    expect(canvas.height).toBe(200);
    wrapper.unmount();
  });
});
