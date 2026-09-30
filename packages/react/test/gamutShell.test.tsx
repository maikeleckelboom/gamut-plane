import { act } from "react";
import { vi } from "vitest";
import { GamutPlane, type GamutPlaneState } from "../src/index.js";
import { gamutContract } from "./gamutContract.js";
import { mount } from "./helpers.js";

gamutContract(async (value, initial, options) => {
  const requests: GamutPlaneState[] = [];
  const changes = vi.fn();
  const render = (state: GamutPlaneState) => (
    <GamutPlane
      value={value}
      onValueChange={changes}
      onValueCommit={changes}
      state={state}
      {...(options?.readOnly ? {} : { onStateChange: (next) => requests.push(next) })}
    />
  );
  const host = await mount(render(initial));
  return {
    element: host.element,
    requests: () => requests,
    update: (state) => host.render(render(state)),
    interact: async (action) => {
      await act(async () => action());
    },
    changes: () => changes.mock.calls.length,
    dispose: host.unmount,
  };
});
