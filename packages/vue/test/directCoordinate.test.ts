import { mount } from "@vue/test-utils";
import { h, ref, nextTick } from "vue";
import {
  directCoordinateContract,
  directState,
} from "../../react/test/directCoordinateContract.js";
import GamutPlane from "../src/components/GamutPlane.vue";

directCoordinateContract(async (initial) => {
  const value = ref(initial);
  const state = ref(directState);
  let changes = 0,
    commits = 0;
  const ui = mount({
    setup: () => () =>
      h(GamutPlane, {
        modelValue: value.value,
        state: state.value,
        "onUpdate:state": (next) => {
          state.value = next;
        },
        "onUpdate:modelValue": (next) => {
          value.value = next;
          changes++;
        },
        onCommit: () => {
          commits++;
        },
      }),
  });
  return {
    element: ui.element,
    current: () => value.value,
    changes: () => changes,
    commits: () => commits,
    replace: async (next) => {
      value.value = next;
      await nextTick();
    },
    state: async (next) => {
      state.value = next;
      await nextTick();
    },
    interact: async (action) => {
      action();
      await nextTick();
    },
    dispose: async () => ui.unmount(),
  };
});
