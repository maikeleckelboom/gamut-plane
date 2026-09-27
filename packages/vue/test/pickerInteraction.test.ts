import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createColorValue,
  definitionOf,
  definingEquals,
  projectColorToPlane,
  represent,
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
  const order: ("change" | "commit" | "cancel")[] = [];
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
      "onUpdate:modelValue": () => order.push("change"),
      onCommit: () => order.push("commit"),
      onCancel: () => order.push("cancel"),
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
  return { wrapper, surface, captured, order };
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
    const { wrapper, surface, order } = mountPlane(origin.value, OKLAB_AB_PLANE);
    await flushPromises();
    frames.flush();
    dispatchPointer(surface, "pointerdown", { pointerId: 1, clientX: 80, clientY: 100 });
    frames.flush();
    if (reason === "Escape")
      await wrapper.get('[role="application"]').trigger("keydown", { key: "Escape" });
    else dispatchPointer(surface, reason, { pointerId: 1 });
    expect(emitted(wrapper, "update:modelValue").at(-1)).toBe(origin.value);
    expect(order).toEqual(["change", "change", "cancel"]);
    expect(wrapper.emitted("cancel")).toEqual([[]]);
    expect(emitted(wrapper, "commit")).toHaveLength(0);
    wrapper.unmount();
  });

  it("keeps one pointer, previews immediately, then publishes the final point before commit", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, surface, captured, order } = mountPlane(
      color(0.6, 0.12, 210),
      OKLCH_LIGHTNESS_CHROMA_PLANE,
    );
    await flushPromises();
    frames.flush();
    dispatchPointer(surface, "pointerdown", { pointerId: 8, button: 2, clientX: 80, clientY: 100 });
    expect(captured.size).toBe(0);
    dispatchPointer(surface, "pointerdown", { pointerId: 1, clientX: 80, clientY: 100 });
    expect(captured.has(1)).toBe(true);
    expect(document.activeElement).toBe(surface);
    expect(surface.hasAttribute("data-gp-pointer-focus")).toBe(true);
    dispatchPointer(surface, "pointerdown", { pointerId: 2, clientX: 20, clientY: 20 });
    dispatchPointer(surface, "pointermove", { pointerId: 2, clientX: 20, clientY: 20 });
    dispatchPointer(surface, "pointermove", { pointerId: 1, clientX: 100, clientY: 110 });
    expect((wrapper.get("[data-active-marker]").element as HTMLElement).style.left).toBe("31.25%");
    expect(order).toEqual([]);
    frames.flush();
    expect(order).toEqual(["change"]);
    dispatchPointer(surface, "pointermove", { pointerId: 1, clientX: 120, clientY: 130 });
    dispatchPointer(surface, "pointerup", { pointerId: 2, clientX: 10, clientY: 10 });
    dispatchPointer(surface, "pointerup", { pointerId: 1, clientX: 200, clientY: 210 });
    expect(captured.size).toBe(0);
    expect(order).toEqual(["change", "change", "commit"]);
    expect(emitted(wrapper, "update:modelValue").at(-1)).toBe(emitted(wrapper, "commit")[0]);
    frames.flush();
    dispatchPointer(surface, "lostpointercapture", { pointerId: 1 });
    expect(order).toEqual(["change", "change", "commit"]);
    wrapper.unmount();
  });

  it.each([false, true])(
    "authoritative replacement with a queued point afterPublication=%s cancels without rollback",
    async (afterPublication) => {
      const frames = installAnimationFrameController();
      const origin = color(0.6, 0.12, 210);
      const { wrapper, surface, captured, order } = mountPlane(
        origin,
        OKLCH_LIGHTNESS_CHROMA_PLANE,
      );
      await flushPromises();
      frames.flush();
      dispatchPointer(surface, "pointerdown", { pointerId: 1, clientX: 80, clientY: 100 });
      if (afterPublication) {
        frames.flush();
        await feedback(wrapper, emitted(wrapper, "update:modelValue").at(-1)!);
        dispatchPointer(surface, "pointermove", { pointerId: 1, clientX: 150, clientY: 150 });
      }
      const replacement = color(0.7, 0.2, 270, 0.3);
      await feedback(wrapper, replacement);
      expect(captured.size).toBe(0);
      frames.flush();
      dispatchPointer(surface, "pointerup", { pointerId: 1, clientX: 200, clientY: 200 });
      expect(order).toEqual(afterPublication ? ["change", "cancel"] : ["cancel"]);
      expect(emitted(wrapper, "update:modelValue")).not.toContain(origin);
      expect(emitted(wrapper, "commit")).toHaveLength(0);
      expect(wrapper.props("modelValue")).toBe(replacement);
      wrapper.unmount();
    },
  );

  it.each([false, true])(
    "pointerup uses queued or latest point when geometry is lost queued=%s",
    async (queued) => {
      const frames = installAnimationFrameController();
      const { wrapper, surface, order } = mountPlane(
        color(0.6, 0.12, 210),
        OKLCH_LIGHTNESS_CHROMA_PLANE,
      );
      await flushPromises();
      frames.flush();
      dispatchPointer(surface, "pointerdown", { pointerId: 1, clientX: 80, clientY: 100 });
      if (!queued) frames.flush();
      vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 0, 0));
      window.dispatchEvent(new Event("scroll"));
      dispatchPointer(surface, "pointerup", { pointerId: 1, clientX: 300, clientY: 300 });
      expect(order).toEqual(queued ? ["change", "commit"] : ["change", "change", "commit"]);
      const final = emitted(wrapper, "commit")[0]!;
      const projected = projectColorToPlane(final, "oklch");
      if (!projected.ok) throw new Error("Final color cannot be projected");
      expect(projected.value.point.x).toBeCloseTo(0.25, 10);
      wrapper.unmount();
    },
  );

  it("stale feedback from an earlier publication ends the gesture once", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, surface, order } = mountPlane(
      color(0.6, 0.12, 210),
      OKLCH_LIGHTNESS_CHROMA_PLANE,
    );
    await flushPromises();
    frames.flush();
    dispatchPointer(surface, "pointerdown", { pointerId: 1, clientX: 80, clientY: 100 });
    frames.flush();
    const first = emitted(wrapper, "update:modelValue")[0]!;
    await feedback(wrapper, first);
    dispatchPointer(surface, "pointermove", { pointerId: 1, clientX: 160, clientY: 160 });
    frames.flush();
    await feedback(wrapper, emitted(wrapper, "update:modelValue")[1]!);
    await feedback(wrapper, first);
    dispatchPointer(surface, "pointerup", { pointerId: 1, clientX: 200, clientY: 200 });
    expect(order).toEqual(["change", "change", "cancel"]);
    expect(emitted(wrapper, "commit")).toHaveLength(0);
    wrapper.unmount();
  });

  it("treats an observed-equivalent new definition as authoritative replacement", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, surface, order } = mountPlane(
      color(0.6, 0.12, 210),
      OKLCH_LIGHTNESS_CHROMA_PLANE,
    );
    await flushPromises();
    frames.flush();
    dispatchPointer(surface, "pointerdown", { pointerId: 1, clientX: 80, clientY: 100 });
    frames.flush();
    const live = emitted(wrapper, "update:modelValue")[0]!;
    await feedback(wrapper, live);
    const observed = represent(live, "oklab");
    if (!observed.ok) throw new Error("Selected color cannot be observed");
    const replacement = createColorValue(observed.value);
    if (!replacement.ok) throw new Error("Invalid replacement");
    expect(definingEquals(replacement.value, live)).toBe(false);
    await feedback(wrapper, replacement.value);
    dispatchPointer(surface, "pointerup", { pointerId: 1, clientX: 200, clientY: 200 });
    expect(order).toEqual(["change", "cancel"]);
    expect(emitted(wrapper, "commit")).toHaveLength(0);
    expect(wrapper.props("modelValue")).toBe(replacement.value);
    wrapper.unmount();
  });
});
