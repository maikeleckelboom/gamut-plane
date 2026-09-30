import { act, startTransition, Suspense } from "react";
import { expect, it, vi } from "vitest";
import { GamutPlane, type GamutPlaneState } from "../src/index.js";
import {
  gamutContextMenuContract,
  gamutContextMenuMarkupContract,
} from "./gamutContextMenuContract.js";
import { GamutContextMenu } from "../src/components/GamutContextMenu.js";
import { initial, mount } from "./helpers.js";

gamutContextMenuContract(async (value, initial, options) => {
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

gamutContextMenuMarkupContract(async (props) => {
  const host = await mount(
    <section data-gp-root="">
      <div data-gp-part="field">
        <div data-gp-part="surface" tabIndex={0} />
        <GamutContextMenu {...props} id="menu-facts" readOnly={false} request={() => {}} />
      </div>
    </section>,
  );
  return { element: host.element, dispose: host.unmount };
});

it("a suspended React render cannot replace the menu's committed facts or callback", async () => {
  const accepted: GamutPlaneState = {
    selection: { representationId: "oklch", editorId: "oklch-lc" },
    checkedGamuts: [],
    visibleGuides: [],
    referenceGamutId: null,
  };
  const rejected: GamutPlaneState = {
    ...accepted,
    checkedGamuts: ["srgb-gamut"],
    referenceGamutId: "srgb-gamut",
  };
  const currentRequest = vi.fn();
  const abandonedRequest = vi.fn();
  let attempted = false;
  const pending = new Promise<void>(() => {});
  function Gate({ blocked }: { blocked: boolean }) {
    if (blocked) {
      attempted = true;
      throw pending;
    }
    return null;
  }
  const render = (state: GamutPlaneState, blocked = false) => (
    <Suspense fallback={<p>Pending parent</p>}>
      <GamutPlane
        value={initial}
        onValueChange={() => {}}
        state={state}
        onStateChange={blocked ? abandonedRequest : currentRequest}
      />
      <Gate blocked={blocked} />
    </Suspense>
  );
  const host = await mount(render(accepted));
  const surface = host.element.querySelector<HTMLElement>('[data-gp-part="surface"]')!;
  await act(async () => {
    startTransition(() => host.schedule(render(rejected, true)));
  });
  expect(attempted).toBe(true);
  expect(surface.isConnected).toBe(true);
  await act(async () =>
    surface.dispatchEvent(
      new MouseEvent("contextmenu", {
        button: 2,
        clientX: 40,
        clientY: 50,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  const item = host.element.querySelector<HTMLButtonElement>(
    '[data-gp-command="status-srgb-gamut"]',
  )!;
  expect(item.getAttribute("aria-checked")).toBe("false");
  await act(async () => item.click());
  expect(currentRequest).toHaveBeenCalledExactlyOnceWith({
    ...accepted,
    checkedGamuts: ["srgb-gamut"],
  });
  expect(abandonedRequest).not.toHaveBeenCalled();
  await host.unmount();
});
