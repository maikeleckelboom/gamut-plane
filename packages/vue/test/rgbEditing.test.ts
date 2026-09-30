import { mount } from "@vue/test-utils";
import { createSSRApp, h, nextTick, ref } from "vue";
import { renderToString } from "vue/server-renderer";
import { expect, it, vi } from "vitest";
import { installAnimationFrameController } from "./interactionHelpers";
import GamutPlane from "../src/components/GamutPlane.vue";
import { rgb, rgbState, rgbEditingContract } from "../../react/test/rgbEditingContract.js";
import type { GamutPlaneState } from "../src/index.js";

rgbEditingContract(async (initial, initialState, options = {}) => {
  const callbacks = new Set<ResizeObserverCallback>();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        callbacks.add(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const value = ref(initial),
    state = ref(initialState);
  let changes = 0,
    commits = 0;
  const requests: GamutPlaneState[] = [];
  const ui = mount(
    {
      setup: () => () =>
        h(GamutPlane, {
          modelValue: value.value,
          state: state.value,
          "onUpdate:modelValue": (next) => {
            changes++;
            if (options.acceptColor !== false) value.value = next;
          },
          onCommit: () => {
            commits++;
          },
          ...(!options.readOnlyState && {
            "onUpdate:state": (next: GamutPlaneState) => {
              requests.push(next);
              if (options.acceptState !== false) state.value = next;
            },
          }),
        }),
    },
    { attachTo: document.body },
  );
  await nextTick();
  const surface = ui.element.querySelector<HTMLElement>("[role=application]")!;
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 320, 320));
  return {
    element: ui.element,
    current: () => value.value,
    changes: () => changes,
    commits: () => commits,
    requests: () => requests,
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
    resize: async () => {
      for (const callback of callbacks) callback([], {} as ResizeObserver);
      await nextTick();
    },
    dispose: async () => {
      ui.unmount();
      vi.unstubAllGlobals();
    },
  };
});

it("server markup retains raw RGB marker placement and opaque native CSS", async () => {
  const html = await renderToString(
    createSSRApp({ render: () => h(GamutPlane, { modelValue: rgb(), state: rgbState("srgb") }) }),
  );
  expect(html).toContain(
    "left:120.00000000%;top:60.00000000%;--marker-color:color(srgb 1.2 0.4 -0.1)",
  );
  expect(html).toContain('data-geometry-id="srgb-rg-rectangle"');
  expect(html).toContain("R / G · fixed B");
});

it("invalidates the native field only for Area and fixed coordinate, then disposes scheduled work", async () => {
  const clock = installAnimationFrameController();
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 320, 320),
  );
  const context = document.createElement("canvas").getContext("2d")!;
  vi.mocked(context.clearRect).mockClear();
  const ui = mount(GamutPlane, { props: { modelValue: rgb(), state: rgbState("srgb") } });
  await nextTick();
  clock.flush();
  const draws = vi.mocked(context.clearRect).mock.calls.length;
  expect(draws).toBeGreaterThan(0);
  await ui.setProps({
    modelValue: rgb("srgb", [1.4, 0.5, -0.1]),
    state: { ...rgbState("srgb"), checkedGamuts: [], visibleGuides: [], referenceGamutId: null },
  });
  clock.flush();
  expect(context.clearRect).toHaveBeenCalledTimes(draws);
  await ui.setProps({ modelValue: rgb("srgb", [1.4, 0.5, 1.1]) });
  clock.flush();
  expect(context.clearRect).toHaveBeenCalledTimes(draws + 1);
  await ui.setProps({
    state: { ...rgbState("srgb"), selection: { representationId: "srgb", editorId: "srgb-rb" } },
  });
  clock.flush();
  expect(context.clearRect).toHaveBeenCalledTimes(draws + 2);
  expect(parseFloat((ui.get("[data-active-marker]").element as HTMLElement).style.top)).toBeCloseTo(
    -10,
  );
  await ui.setProps({ modelValue: rgb("srgb", [1.4, 0.6, 1.1]) });
  ui.unmount();
  clock.flush();
  expect(context.clearRect).toHaveBeenCalledTimes(draws + 2);
  vi.restoreAllMocks();
});
