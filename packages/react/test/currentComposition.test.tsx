import { act } from "react";
import type { ColorValue, PickerPlaneId } from "@gamut-plane/core";
import { currentCompositionContract } from "../../ui/test/currentCompositionContract.js";
import { GamutPlane } from "../src/index.js";
import { frames, mount } from "./helpers.js";

currentCompositionContract(async (initial, initialView) => {
  const clock = frames();
  let color = initial;
  let view: PickerPlaneId = initialView;
  const changes: ColorValue[] = [];
  const commits: ColorValue[] = [];
  const order: string[] = [];
  const render = () => (
    <GamutPlane
      value={color}
      view={view}
      onValueChange={(next) => {
        color = next;
        changes.push(next);
        order.push("update");
      }}
      onValueCommit={(next) => {
        commits.push(next);
        order.push("commit");
      }}
    />
  );
  const host = await mount(render());
  return {
    element: host.element,
    changes,
    commits,
    order,
    run: async (action) => {
      await act(async () => action());
      await host.render(render());
    },
    switchView: async (next) => {
      view = next;
      await host.render(render());
    },
    flushFrames: clock.flush,
    dispose: host.unmount,
  };
});
