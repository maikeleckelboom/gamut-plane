import { act, StrictMode } from "react";
import { vi } from "vitest";
import { type ColorValue, type PickerPlaneId } from "@gamut-plane/core";
import { mountPlaneGesture } from "@gamut-plane/ui";
import { acceptedRevisionContract, type RevisionHost } from "./acceptedRevisionContract.js";
import { resolveAcceptedRevision } from "../src/model/acceptedResolution.js";
import { GamutPlane, type GamutPlaneProps } from "../src/index.js";
import { frames, mount } from "./helpers.js";

vi.mock("../src/model/acceptedResolution.js", { spy: true });
vi.mock("@gamut-plane/ui", { spy: true });

acceptedRevisionContract(async (value, view) => {
  vi.mocked(resolveAcceptedRevision).mockClear();
  vi.mocked(mountPlaneGesture).mockClear();
  const clock = frames();
  let acceptColor = true;
  const changes: ColorValue[] = [],
    commits: ColorValue[] = [],
    cancels: string[] = [],
    requests: PickerPlaneId[] = [];
  let props: GamutPlaneProps = {
    value,
    view,
    onValueChange: (next) => {
      changes.push(next);
      if (acceptColor) props.value = next;
    },
    onValueCommit: (next) => commits.push(next),
    onCancel: () => cancels.push("cancel"),
    onViewChange: (next) => requests.push(next), // Parent deliberately rejects selector requests.
  };
  const render = () => (
    <StrictMode>
      <GamutPlane {...props} />
    </StrictMode>
  );
  const host = await mount(render());
  let disposed = false;
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
      await act(async () => action());
      if (!disposed) await host.render(render());
    },
    update: async (next) => {
      props = { ...props, ...next };
      await host.render(render());
    },
    flush: async () => {
      await clock.flush();
      if (!disposed) await host.render(render());
    },
    dispose: async () => {
      disposed = true;
      await host.unmount();
    },
  };
  return result;
});
