import { act } from "react";
import { host } from "./helpers.js";
import { directCoordinateContract, directState } from "./directCoordinateContract.js";

directCoordinateContract(async (value) => {
  const ui = await host({ value, state: directState }, true);
  return {
    element: ui.element,
    current: ui.current,
    changes: () => ui.changes.mock.calls.length,
    commits: () => ui.commits.mock.calls.length,
    replace: ui.replace,
    state: ui.acceptState,
    interact: async (action) => {
      await act(async () => action());
    },
    dispose: ui.unmount,
  };
});
