import { vi } from "vitest";
import { act } from "react";
import { GamutPlane, type GamutPlaneState } from "../src/index.js";
import { mount } from "./helpers.js";
import { referenceContract } from "./referenceContract.js";

referenceContract(async (value, initial) => {
  const changed = vi.fn();
  const render = (state: GamutPlaneState) => (
    <GamutPlane value={value} onValueChange={changed} state={state} onStateChange={vi.fn()} />
  );
  const host = await mount(render(initial));
  return {
    element: host.element,
    update: (state) => host.render(render(state)),
    dispose: host.unmount,
    changes: () => changed.mock.calls.length,
    interact: async (action) => {
      await act(async () => action());
    },
  };
});
