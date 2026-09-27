import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createColorValue,
  definitionOf,
  definingEquals,
  projectColorToPlane,
  type ColorValue,
  type PickerPlaneFieldSampler,
  type PickerPlaneGeometry,
} from "@gamut-plane/core";
import { OKLAB_AB_PLANE, OKLCH_LIGHTNESS_CHROMA_PLANE } from "@gamut-plane/core";
import { createPickerPresentation, PICKER_GAMUT_TABLES } from "@gamut-plane/render";
import ColorPlane from "../src/components/ColorPlane.vue";
import { color } from "./colorValue";
import { dispatchPointer, installAnimationFrameController } from "./interactionHelpers";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function presentation(value: ColorValue, plane: PickerPlaneGeometry) {
  const model = createPickerPresentation(value, plane.id, "srgb", {
    srgb: true,
    displayP3: true,
  });
  return { fieldHue: model.fieldHue, markerCss: model.markerCss };
}

function mountPlane(value: ColorValue, plane: PickerPlaneGeometry & PickerPlaneFieldSampler) {
  const wrapper = mount(ColorPlane, {
    attachTo: document.body,
    props: {
      modelValue: value,
      ...presentation(value, plane),
      plane,
      srgbTable: PICKER_GAMUT_TABLES.srgb,
      displayP3Table: PICKER_GAMUT_TABLES.displayP3,
      targetGuidePoint: null,
      targetGuideCss: "",
      targetGuideLabel: "sRGB sampled target guide",
      warningVisible: false,
      warningLabel: "",
    },
  });
  const surface = wrapper.get('[role="application"]').element;
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 320, 320));
  const captured = new Set<number>();
  Object.defineProperties(surface, {
    setPointerCapture: { configurable: true, value: (id: number) => captured.add(id) },
    hasPointerCapture: { configurable: true, value: (id: number) => captured.has(id) },
    releasePointerCapture: { configurable: true, value: (id: number) => captured.delete(id) },
  });
  return { wrapper, surface };
}

function emitted(wrapper: VueWrapper, event: "update:modelValue" | "commit"): ColorValue[] {
  return (wrapper.emitted(event) ?? []).map(([value]) => value as ColorValue);
}

async function feedback(wrapper: VueWrapper, value: ColorValue) {
  await wrapper.setProps({
    modelValue: value,
    ...presentation(value, wrapper.props("plane")),
  });
}

describe("Vue plane interaction", () => {
  it.each([OKLCH_LIGHTNESS_CHROMA_PLANE, OKLAB_AB_PLANE])(
    "authors pointer and keyboard edits in $id",
    async (plane) => {
      const frames = installAnimationFrameController();
      const { wrapper, surface } = mountPlane(color(0.6, 0.12, 210, 0.7), plane);
      await flushPromises();
      frames.flush();
      dispatchPointer(surface, "pointerdown", { pointerId: 1, clientX: 80, clientY: 100 });
      dispatchPointer(surface, "pointermove", { pointerId: 1, clientX: 100, clientY: 110 });
      expect(emitted(wrapper, "update:modelValue")).toHaveLength(0);
      frames.flush();
      const live = emitted(wrapper, "update:modelValue").at(-1)!;
      expect(definitionOf(live).space).toBe(plane.id);
      await feedback(wrapper, live);
      dispatchPointer(surface, "pointerup", { pointerId: 1, clientX: 200, clientY: 210 });
      const final = emitted(wrapper, "commit").at(-1)!;
      expect(emitted(wrapper, "update:modelValue").at(-1)).toBe(final);
      expect(definitionOf(final).space).toBe(plane.id);
      const projection = projectColorToPlane(final, plane.id);
      if (!projection.ok) throw new Error("Invalid final projection");
      expect(projection.value.point.x).toBeCloseTo(200 / 320, 10);
      await feedback(wrapper, final);
      await wrapper.get('[role="application"]').trigger("keydown", { key: "ArrowLeft" });
      expect(definitionOf(emitted(wrapper, "commit").at(-1)!).space).toBe(plane.id);
      wrapper.unmount();
    },
  );

  it("accepts separately constructed defining-equal controlled feedback", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, surface } = mountPlane(color(0.6, 0.12, 210), OKLCH_LIGHTNESS_CHROMA_PLANE);
    await flushPromises();
    frames.flush();
    dispatchPointer(surface, "pointerdown", { pointerId: 1, clientX: 80, clientY: 100 });
    frames.flush();
    const live = emitted(wrapper, "update:modelValue").at(-1)!;
    const rebuilt = createColorValue(definitionOf(live));
    if (!rebuilt.ok) throw new Error("Invalid controlled feedback");
    expect(rebuilt.value).not.toBe(live);
    expect(definingEquals(rebuilt.value, live)).toBe(true);
    await feedback(wrapper, rebuilt.value);
    dispatchPointer(surface, "pointermove", { pointerId: 1, clientX: 200, clientY: 200 });
    frames.flush();
    expect(emitted(wrapper, "update:modelValue")).toHaveLength(2);
    expect(wrapper.emitted("cancel")).toBeUndefined();
    wrapper.unmount();
  });

  it("interrupts a gesture for a different defining value", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, surface } = mountPlane(color(0.6, 0.12, 210), OKLCH_LIGHTNESS_CHROMA_PLANE);
    await flushPromises();
    frames.flush();
    dispatchPointer(surface, "pointerdown", { pointerId: 1, clientX: 80, clientY: 100 });
    frames.flush();
    const replacement = createColorValue({ space: "oklab", channels: [0.6, -0, 0.12], alpha: 1 });
    if (!replacement.ok) throw new Error("Invalid replacement");
    await feedback(wrapper, replacement.value);
    dispatchPointer(surface, "pointerup", { pointerId: 1, clientX: 200, clientY: 200 });
    expect(wrapper.emitted("cancel")).toEqual([[]]);
    expect(emitted(wrapper, "commit")).toHaveLength(0);
    wrapper.unmount();
  });

  it.each(["Escape", "pointercancel"])("%s rolls back the exact origin", async (reason) => {
    const origin = createColorValue({ space: "oklab", channels: [0.5, -0, 0.1], alpha: 0.63 });
    if (!origin.ok) throw new Error("Invalid origin");
    const frames = installAnimationFrameController();
    const { wrapper, surface } = mountPlane(origin.value, OKLAB_AB_PLANE);
    await flushPromises();
    frames.flush();
    dispatchPointer(surface, "pointerdown", { pointerId: 1, clientX: 80, clientY: 100 });
    frames.flush();
    if (reason === "Escape")
      await wrapper.get('[role="application"]').trigger("keydown", { key: "Escape" });
    else dispatchPointer(surface, reason, { pointerId: 1 });
    expect(emitted(wrapper, "update:modelValue").at(-1)).toBe(origin.value);
    expect(wrapper.emitted("cancel")).toEqual([[]]);
    expect(emitted(wrapper, "commit")).toHaveLength(0);
    wrapper.unmount();
  });
});
