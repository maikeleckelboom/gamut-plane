import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { definitionOf, type ColorValue } from "@gamut-plane/core";
import type { GamutPlaneState } from "../src/index.js";
import { color } from "./colorValue.js";
import { dispatchPointer, installAnimationFrameController } from "./interactionHelpers.js";
import { referenceContract } from "../../react/test/referenceContract.js";
import GamutPlane from "../src/components/GamutPlane.vue";

referenceContract(async (value, state) => {
  const host = mount(GamutPlane, {
    props: { modelValue: value, state, "onUpdate:state": () => {} },
  });
  return {
    element: host.element,
    update: (state) => host.setProps({ state }),
    dispose: async () => host.unmount(),
    changes: () => host.emitted("update:modelValue")?.length ?? 0,
    interact: async (action) => {
      action();
      await nextTick();
    },
  };
});

afterEach(() => vi.restoreAllMocks());
const initial: GamutPlaneState = {
  selection: { representationId: "oklch", editorId: "oklch-lc" },
  checkedGamuts: [],
  visibleGuides: [],
  referenceGamutId: "srgb-gamut",
};

it.each([false, true])(
  "Reference-only changes preserve the plane gesture, published=%s",
  async (published) => {
    const frames = installAnimationFrameController();
    const source = color(0.62, 0.2, 45, 0.37);
    const wrapper = mount(GamutPlane, { props: { modelValue: source, state: initial } });
    const surface = wrapper.get('[role="application"]').element;
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 320, 320));
    const captured = new Set<number>();
    Object.defineProperties(surface, {
      setPointerCapture: { value: (id: number) => captured.add(id) },
      hasPointerCapture: { value: (id: number) => captured.has(id) },
      releasePointerCapture: { value: (id: number) => captured.delete(id) },
    });
    frames.flush();
    dispatchPointer(surface, "pointerdown", { pointerId: 1, clientX: 80, clientY: 100 });
    if (published) {
      frames.flush();
      await wrapper.setProps({
        modelValue: wrapper.emitted("update:modelValue")!.at(-1)![0] as ColorValue,
      });
    }
    dispatchPointer(surface, "pointermove", { pointerId: 1, clientX: 120, clientY: 140 });
    const before = wrapper.emitted("update:modelValue")?.length ?? 0;
    await wrapper.setProps({ state: { ...initial, referenceGamutId: "display-p3-gamut" } });
    expect(wrapper.get('[role="application"]').element).toBe(surface);
    expect(captured.has(1)).toBe(true);
    expect(wrapper.emitted("update:modelValue")?.length ?? 0).toBe(before);
    dispatchPointer(surface, "pointerup", { pointerId: 1, clientX: 200, clientY: 210 });
    const final = wrapper.emitted("commit")?.[0]?.[0] as ColorValue;
    expect(definitionOf(final)).toMatchObject({ space: "oklch", alpha: 0.37 });
    expect(definitionOf(final).channels[1]).toBeCloseTo(0.25, 10);
    expect(wrapper.emitted("cancel")).toBeUndefined();
    wrapper.unmount();
  },
);

it("Reference-only changes preserve a pending Hue range edit and hue reference", async () => {
  const frames = installAnimationFrameController();
  const wrapper = mount(GamutPlane, {
    props: { modelValue: color(0.62, 0.2, 45, 0.37), state: initial },
  });
  const range = wrapper.get<HTMLInputElement>('[data-gp-channel="h"] input[type="range"]');
  frames.flush();
  dispatchPointer(range.element, "pointerdown", { pointerId: 1 });
  range.element.value = "360";
  await range.trigger("input");
  await wrapper.setProps({ state: { ...initial, referenceGamutId: "display-p3-gamut" } });
  expect(wrapper.get('[data-gp-channel="h"] input[type="range"]').element).toBe(range.element);
  expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  frames.flush();
  const next = wrapper.emitted("update:modelValue")!.at(-1)![0] as ColorValue;
  expect(definitionOf(next).channels[2]).toBe(0);
  await wrapper.setProps({ modelValue: next });
  expect(range.element.value).toBe("360");
  expect(wrapper.findAll('[data-gamut-warning="linear"]')).toHaveLength(0);
  await range.trigger("change");
  expect(wrapper.emitted("commit")).toHaveLength(1);
  expect(wrapper.emitted("cancel")).toBeUndefined();
  wrapper.unmount();
});
