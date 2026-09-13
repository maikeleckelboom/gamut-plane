import { installAnimationFrameController } from "./interactionHelpers";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";

import {
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  getCachedGamutBoundaryTable,
  type OklchColor,
  type PickerPlaneContract,
} from "@gamut-plane/core";
import ColorPlane from "../src/components/ColorPlane.vue";
import PlaneInstrument from "../src/components/GamutPlane.vue";

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

    createLinearGradient.mockClear();
    await wrapper.setProps({ modelValue: { l: 0.74, c: 0.12, h: 235.0001, alpha: 1 } });
    frames.flush();
    expect(createLinearGradient).toHaveBeenCalled();

    wrapper.unmount();
  });

  it("uses 192 reusable horizontal samples only for the active field preview", async () => {
    const frames = installAnimationFrameController();
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 520,
      bottom: 520,
      width: 520,
      height: 520,
      toJSON: () => ({}),
    });
    const context = document.createElement("canvas").getContext("2d")!;
    const createLinearGradient = vi.mocked(context.createLinearGradient);
    const getContext = vi.mocked(HTMLCanvasElement.prototype.getContext);
    const options = { hueSteps: 6, lightnessSteps: 5, searchIterations: 6 } as const;
    const wrapper = mount(ColorPlane, {
      attachTo: document.body,
      props: {
        modelValue: { l: 0.62, c: 0.2, h: 210, alpha: 1 },
        plane: OKLCH_LIGHTNESS_CHROMA_PLANE,
        srgbTable: getCachedGamutBoundaryTable("srgb", options),
        displayP3Table: getCachedGamutBoundaryTable("display-p3", options),
        srgbBoundaryGuideColor: null,
        warningVisible: false,
        warningLabel: "",
      },
    });
    await flushPromises();
    frames.flush();
    expect(wrapper.attributes("data-field-quality")).toBe("full");

    createLinearGradient.mockClear();
    getContext.mockClear();
    await wrapper.setProps({ interactionPreview: true });
    await flushPromises();
    expect(frames.pendingCount).toBe(1);
    expect(wrapper.attributes("data-field-quality")).toBe("full");
    frames.flush();
    await flushPromises();
    expect(wrapper.attributes("data-field-quality")).toBe("preview");
    expect(createLinearGradient).toHaveBeenCalledTimes(192);
    expect(getContext).toHaveBeenCalledTimes(1);

    createLinearGradient.mockClear();
    await wrapper.setProps({ interactionPreview: false });
    await flushPromises();
    expect(frames.pendingCount).toBe(1);
    expect(wrapper.attributes("data-field-quality")).toBe("preview");
    frames.flush();
    await flushPromises();
    expect(wrapper.attributes("data-field-quality")).toBe("full");
    expect(createLinearGradient).toHaveBeenCalledTimes(520);

    createLinearGradient.mockClear();
    await wrapper.setProps({ interactionPreview: true });
    await flushPromises();
    frames.flush();
    expect(createLinearGradient).toHaveBeenCalledTimes(192);
    expect(getContext).toHaveBeenCalledTimes(1);

    await wrapper.setProps({ interactionPreview: false });
    await flushPromises();
    frames.flush();
    await flushPromises();
    expect(wrapper.attributes("data-field-quality")).toBe("full");

    wrapper.unmount();
  });

  it("keeps narrow column fields at actual full quality when preview is requested", async () => {
    const frames = installAnimationFrameController();
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 192,
      bottom: 240,
      width: 192,
      height: 240,
      toJSON: () => ({}),
    });
    const context = document.createElement("canvas").getContext("2d")!;
    const createLinearGradient = vi.mocked(context.createLinearGradient);
    const options = { hueSteps: 6, lightnessSteps: 5, searchIterations: 6 } as const;
    const wrapper = mount(ColorPlane, {
      attachTo: document.body,
      props: {
        modelValue: { l: 0.62, c: 0.2, h: 210, alpha: 1 },
        plane: OKLCH_LIGHTNESS_CHROMA_PLANE,
        srgbTable: getCachedGamutBoundaryTable("srgb", options),
        displayP3Table: getCachedGamutBoundaryTable("display-p3", options),
        srgbBoundaryGuideColor: null,
        warningVisible: false,
        warningLabel: "",
      },
    });
    await flushPromises();
    frames.flush();
    await flushPromises();
    expect(wrapper.attributes("data-field-quality")).toBe("full");

    createLinearGradient.mockClear();
    await wrapper.setProps({ interactionPreview: true });
    await flushPromises();
    expect(frames.pendingCount).toBe(1);
    expect(wrapper.attributes("data-field-quality")).toBe("full");
    frames.flush();
    await flushPromises();

    expect(wrapper.attributes("data-field-quality")).toBe("full");
    expect(createLinearGradient).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("paints at full quality without changing capability when its preview buffer is unavailable", async () => {
    const frames = installAnimationFrameController();
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 520,
      bottom: 520,
      width: 520,
      height: 520,
      toJSON: () => ({}),
    });
    const context = document.createElement("canvas").getContext("2d")!;
    const getContext = vi.mocked(HTMLCanvasElement.prototype.getContext);
    const options = { hueSteps: 6, lightnessSteps: 5, searchIterations: 6 } as const;
    const wrapper = mount(ColorPlane, {
      attachTo: document.body,
      props: {
        modelValue: { l: 0.62, c: 0.2, h: 210, alpha: 1 },
        plane: OKLCH_LIGHTNESS_CHROMA_PLANE,
        srgbTable: getCachedGamutBoundaryTable("srgb", options),
        displayP3Table: getCachedGamutBoundaryTable("display-p3", options),
        srgbBoundaryGuideColor: null,
        warningVisible: false,
        warningLabel: "",
      },
    });
    await flushPromises();
    frames.flush();
    await flushPromises();

    vi.mocked(context.fillRect).mockClear();
    getContext.mockImplementation(() => null);
    try {
      await wrapper.setProps({
        interactionPreview: true,
        modelValue: { l: 0.62, c: 0.2, h: 211, alpha: 1 },
      });
      await flushPromises();
      frames.flush();
      await flushPromises();

      expect(wrapper.attributes("data-field-quality")).toBe("full");
      expect(context.fillRect).toHaveBeenCalled();
      expect(wrapper.find('[role="application"]').attributes("data-render-color-space")).toBe(
        "srgb",
      );
    } finally {
      getContext.mockImplementation(() => context);
      wrapper.unmount();
    }
  });

  it("coalesces rapid hue range input before fixed-axis contours and field redraw", async () => {
    const frames = installAnimationFrameController();
    const context = document.createElement("canvas").getContext("2d")!;
    const createLinearGradient = vi.mocked(context.createLinearGradient);
    createLinearGradient.mockClear();
    const model = ref({ l: 0.62, c: 0.2, h: 210, alpha: 1 });
    const publications: number[] = [];
    const commits: number[] = [];
    const Host = defineComponent({
      setup() {
        return () =>
          h(PlaneInstrument, {
            modelValue: model.value,
            "onUpdate:modelValue": (color: OklchColor) => {
              publications.push(color.h);
              model.value = color;
            },
            onCommit: (color: OklchColor) => commits.push(color.h),
          });
      },
    });
    const wrapper = mount(Host, { attachTo: document.body });
    await flushPromises();
    frames.flush();

    const range = wrapper.get('[data-picker-control="h"] input[type="range"]');
    const boundary = wrapper.get('[data-gamut-boundary="srgb"]');
    const initialPath = boundary.attributes("d");
    const initialGradientBuilds = createLinearGradient.mock.calls.length;

    for (const value of [220, 245, 270]) {
      (range.element as HTMLInputElement).value = String(value);
      await range.trigger("input");
    }

    expect(frames.pendingCount).toBe(1);
    expect(publications).toEqual([]);
    expect(boundary.attributes("d")).toBe(initialPath);

    frames.flush();
    await flushPromises();

    expect(publications).toEqual([270]);
    expect(model.value.h).toBe(270);
    expect(boundary.attributes("d")).not.toBe(initialPath);
    expect(frames.pendingCount).toBe(1);
    expect(createLinearGradient).toHaveBeenCalledTimes(initialGradientBuilds);

    frames.flush();
    expect(createLinearGradient.mock.calls.length).toBeGreaterThan(initialGradientBuilds);

    (range.element as HTMLInputElement).value = "290";
    await range.trigger("input");
    (range.element as HTMLInputElement).value = "300";
    await range.trigger("change");
    await flushPromises();

    expect(publications).toEqual([270, 300]);
    expect(commits).toEqual([300]);
    expect(model.value.h).toBe(300);
    expect(frames.pendingCount).toBe(1);
    frames.flush();

    wrapper.unmount();
  });
});
