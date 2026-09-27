import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { afterEach, vi } from "vitest";
import type { ColorValue, PickerPlaneId } from "@gamut-plane/core";
import { currentCompositionContract } from "../../ui/test/currentCompositionContract.js";
import GamutPlane from "../src/components/GamutPlane.vue";
import { installAnimationFrameController } from "./interactionHelpers.js";

afterEach(() => vi.restoreAllMocks());
currentCompositionContract(async (initial, initialView) => {
  const clock = installAnimationFrameController();
  const color = ref(initial);
  const view = ref<PickerPlaneId>(initialView);
  const changes: ColorValue[] = [];
  const commits: ColorValue[] = [];
  const order: string[] = [];
  const wrapper = mount(
    defineComponent({
      setup: () => () =>
        h(GamutPlane, {
          modelValue: color.value,
          plane: view.value,
          "onUpdate:modelValue": (next: ColorValue) => {
            changes.push(next);
            order.push("update");
            color.value = next;
          },
          onCommit: (next: ColorValue) => {
            commits.push(next);
            order.push("commit");
          },
        }),
    }),
    { attachTo: document.body },
  );
  await flushPromises();
  return {
    element: wrapper.element,
    changes,
    commits,
    order,
    run: async (action) => {
      action();
      await flushPromises();
    },
    switchView: async (next) => {
      view.value = next;
      await flushPromises();
    },
    flushFrames: async () => {
      clock.flush();
      await flushPromises();
    },
    dispose: async () => {
      wrapper.unmount();
    },
  };
});
