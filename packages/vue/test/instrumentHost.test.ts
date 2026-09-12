import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import type { OklchColor, PickerPlaneId } from "@gamut-plane/core";
import { GamutPlane as PlaneInstrument } from "../src/index";
import { dispatchPointer, installAnimationFrameController } from "./interactionHelpers";

const origin: OklchColor = { l: 0.5, c: 0.2, h: 0.5, alpha: 0.7 };
function mountHost(controlled = false) {
  const model = ref({ ...origin });
  const plane = ref<PickerPlaneId>("oklch");
  const commits = vi.fn();
  const cancel = vi.fn();
  const updates = vi.fn((color: OklchColor) => {
    model.value = { ...color };
  });
  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(PlaneInstrument, {
          modelValue: model.value,
          "onUpdate:modelValue": updates,
          ...(controlled
            ? {
                plane: plane.value,
                "onUpdate:plane": (value: PickerPlaneId) => {
                  plane.value = value;
                },
              }
            : {}),
          onCommit: commits,
          onCancel: cancel,
        }),
    }),
    { attachTo: document.body },
  );
  const surface = wrapper.get("[data-render-color-space]").element;
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 200, 200));
  const pointer = (type: string, pointerId = 1, clientX = 150, clientY = 80) =>
    dispatchPointer(surface, type, { pointerId, clientX, clientY });
  return { wrapper, model, plane, commits, cancel, updates, pointer };
}
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("reactive instrument host", () => {
  it.each(["pointercancel", "lostpointercapture", "Escape"])(
    "rolls back %s after parent feedback and discards queued work",
    async (reason) => {
      const frames = installAnimationFrameController();
      const host = mountHost();
      await flushPromises();
      host.pointer("pointerdown");
      frames.flush();
      await flushPromises();
      expect(host.model.value).not.toEqual(origin);
      host.pointer("pointermove", 1, 180, 30);
      if (reason === "Escape")
        await host.wrapper.get("[data-render-color-space]").trigger("keydown", { key: "Escape" });
      else host.pointer(reason);
      frames.flush();
      await flushPromises();
      expect(host.model.value).toEqual(origin);
      expect(host.commits).not.toHaveBeenCalled();
      expect(host.cancel).toHaveBeenCalledTimes(1);
      host.wrapper.unmount();
    },
  );

  it("external replacement ends ownership without overwriting the new color", async () => {
    const frames = installAnimationFrameController();
    const host = mountHost();
    await flushPromises();
    host.pointer("pointerdown");
    frames.flush();
    await flushPromises();
    host.pointer("pointermove");
    const preset = { l: 0.7, c: 0.52, h: 270, alpha: 0.3 };
    host.model.value = preset;
    await flushPromises();
    frames.flush();
    await flushPromises();
    expect(host.model.value).toEqual(preset);
    host.pointer("pointercancel");
    host.pointer("pointerup");
    frames.flush();
    await flushPromises();
    expect(host.model.value).toEqual(preset);
    expect(host.commits).not.toHaveBeenCalled();
    host.wrapper.unmount();
  });

  it("rejects another pointer and delivers the final pending value once", async () => {
    const frames = installAnimationFrameController();
    const host = mountHost();
    await flushPromises();
    host.pointer("pointerdown");
    host.pointer("pointerdown", 2, 20, 20);
    for (const event of ["pointermove", "pointerup", "pointercancel", "lostpointercapture"])
      host.pointer(event, 2, 20, 20);
    host.pointer("pointerup", 1, 110, 120);
    host.pointer("lostpointercapture");
    frames.flush();
    await flushPromises();
    expect(host.model.value).toEqual(origin);
    expect(host.commits).toHaveBeenCalledExactlyOnceWith(origin);
    expect(host.cancel).not.toHaveBeenCalled();
    host.wrapper.unmount();
  });

  it.each([false, true])(
    "changes view with controlled=%s, invalidates equal fixed axes and discards old points",
    async (controlled) => {
      const frames = installAnimationFrameController();
      const host = mountHost(controlled);
      await flushPromises();
      frames.flush();
      const context = document.createElement("canvas").getContext("2d")!;
      vi.mocked(context.drawImage).mockClear();
      host.pointer("pointerdown");
      await host.wrapper.get('[data-plane-option="oklab"]').trigger("click");
      frames.flush();
      await flushPromises();
      expect(host.wrapper.get("[data-picker-plane]").attributes("data-plane-id")).toBe("oklab");
      expect(context.drawImage).toHaveBeenCalled();
      expect(host.model.value).toEqual(origin);
      expect(host.commits).not.toHaveBeenCalled();
      host.wrapper.unmount();
    },
  );

  it("unmount discards all callbacks and sends no late updates", async () => {
    const frames = installAnimationFrameController();
    const host = mountHost();
    await flushPromises();
    host.pointer("pointerdown");
    host.wrapper.unmount();
    frames.flush();
    await flushPromises();
    expect(host.updates).not.toHaveBeenCalled();
    expect(host.commits).not.toHaveBeenCalled();
    expect(frames.pendingCount).toBe(0);
  });

  it("changing view after a live edit keeps the published color and discards the old pending point", async () => {
    const frames = installAnimationFrameController();
    const host = mountHost();
    await flushPromises();
    host.pointer("pointerdown");
    frames.flush();
    await flushPromises();
    const published = { ...host.model.value };
    host.pointer("pointermove", 1, 190, 40);
    await host.wrapper.get('[data-plane-option="oklab"]').trigger("click");
    frames.flush();
    await flushPromises();
    host.pointer("pointerup");
    expect(host.model.value).toEqual(published);
    expect(host.commits).not.toHaveBeenCalled();
    host.wrapper.unmount();
  });
});
