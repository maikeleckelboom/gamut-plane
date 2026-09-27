import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, shallowReactive } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import {
  createColorValue,
  type ColorValue,
  type PickerPlaneId,
  type DisplayGamut,
} from "@gamut-plane/core";
import { mountPlaneGesture } from "@gamut-plane/ui";
import {
  acceptedRevisionContract,
  type RevisionHost,
} from "../../react/test/acceptedRevisionContract.js";
import { resolveAcceptedRevision } from "../src/model/acceptedResolution.js";
import GamutPlane from "../src/components/GamutPlane.vue";
import { installAnimationFrameController } from "./interactionHelpers.js";

vi.mock("../src/model/acceptedResolution.js", { spy: true });
vi.mock("@gamut-plane/ui", { spy: true });
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

acceptedRevisionContract(async (value, view) => {
  vi.mocked(resolveAcceptedRevision).mockClear();
  vi.mocked(mountPlaneGesture).mockClear();
  const clock = installAnimationFrameController();
  let acceptColor = true;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 320, 320),
  );
  const changes: ColorValue[] = [],
    commits: ColorValue[] = [],
    cancels: string[] = [],
    requests: PickerPlaneId[] = [];
  const props = shallowReactive({
    value,
    view,
    showSrgbBoundary: true,
    showDisplayP3Boundary: true,
    boundaryTarget: "srgb" as DisplayGamut,
  });
  const host = mount(
    defineComponent({
      setup: () => () =>
        h(GamutPlane, {
          modelValue: props.value,
          plane: props.view,
          showSrgbBoundary: props.showSrgbBoundary,
          showDisplayP3Boundary: props.showDisplayP3Boundary,
          boundaryTarget: props.boundaryTarget,
          "onUpdate:modelValue": (next: ColorValue) => {
            changes.push(next);
            if (acceptColor) props.value = next;
          },
          "onUpdate:plane": (next: PickerPlaneId) => requests.push(next), // Bound v-model event, intentionally unaccepted.
          onCommit: (next: ColorValue) => commits.push(next),
          onCancel: () => cancels.push("cancel"),
        }),
    }),
    { attachTo: document.body },
  );
  await flushPromises();
  const result: RevisionHost = {
    element: host.element,
    changes,
    commits,
    cancels,
    requests,
    acceptColors: (accept) => {
      acceptColor = accept;
    },
    revisions: () =>
      vi
        .mocked(resolveAcceptedRevision)
        .mock.results.filter((row) => row.type === "return")
        .map((row) => row.value),
    context: () => vi.mocked(mountPlaneGesture).mock.calls.at(-1)![1]().viewKey,
    run: async (action) => {
      action();
      await flushPromises();
    },
    update: async (next) => {
      Object.assign(props, next);
      await flushPromises();
    },
    flush: async () => {
      clock.flush();
      await flushPromises();
    },
    dispose: async () => {
      host.unmount();
      await flushPromises();
    },
  };
  return result;
});

it("retains Vue defineModel local acceptance when the parent does not bind its update event", async () => {
  const source = createColorValue({ space: "oklch", channels: [0.5, 0.1, 40], alpha: 1 });
  if (!source.ok) throw new Error("Invalid fixture");
  const host = mount(GamutPlane, { props: { modelValue: source.value, plane: "oklch" } });
  try {
    await host.get('[data-plane-option="oklab"]').trigger("click");
    expect(host.attributes("data-active-plane")).toBe("oklab");
    expect(
      vi.mocked(resolveAcceptedRevision).mock.results.at(-1)?.value.state.selection.editorId,
    ).toBe("oklab-ab");
    await host.setProps({ plane: "oklab" });
    await host.setProps({ plane: "oklch" });
    expect(host.attributes("data-active-plane")).toBe("oklch");
    expect(
      vi.mocked(resolveAcceptedRevision).mock.results.at(-1)?.value.state.selection.editorId,
    ).toBe("oklch-lc");
    expect(host.emitted("update:modelValue")).toBeUndefined();
    expect(host.emitted("commit")).toBeUndefined();
  } finally {
    host.unmount();
  }
});
