import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import type { GamutPlaneState } from "../src/index.js";
import { gamutContract } from "../../react/test/gamutContract.js";
import GamutPlane from "../src/components/GamutPlane.vue";

gamutContract(async (value, state, options) => {
  const requests: GamutPlaneState[] = [];
  const host = mount(GamutPlane, {
    attachTo: document.body,
    props: {
      modelValue: value,
      state,
      ...(options?.readOnly
        ? {}
        : { "onUpdate:state": (next: GamutPlaneState) => requests.push(next) }),
    },
  });
  return {
    element: host.element,
    requests: () => requests,
    update: (next) => host.setProps({ state: next }),
    interact: async (action) => {
      action();
      await nextTick();
    },
    changes: () =>
      (host.emitted("update:modelValue")?.length ?? 0) + (host.emitted("commit")?.length ?? 0),
    dispose: async () => host.unmount(),
  };
});
