import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import type { GamutPlaneState } from "../src/index.js";
import {
  gamutContextMenuContract,
  gamutContextMenuMarkupContract,
} from "../../react/test/gamutContextMenuContract.js";
import GamutPlane from "../src/components/GamutPlane.vue";
import GamutContextMenu from "../src/components/GamutContextMenu.vue";

gamutContextMenuContract(async (value, state, options) => {
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

gamutContextMenuMarkupContract(async (props) => {
  const host = mount(
    defineComponent({
      render: () =>
        h("section", { "data-gp-root": "" }, [
          h("div", { "data-gp-part": "field" }, [
            h("div", { "data-gp-part": "surface", tabindex: 0 }),
            h(GamutContextMenu, { ...props, id: "menu-facts", readOnly: false }),
          ]),
        ]),
    }),
    { attachTo: document.body },
  );
  return { element: host.element, dispose: async () => host.unmount() };
});
