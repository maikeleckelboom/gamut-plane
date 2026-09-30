import { act, StrictMode, useState } from "react";
import { expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import type { ColorValue } from "@gamut-plane/core";
import { GamutPlane, type GamutPlaneState } from "../src/index.js";
import { frames, mount } from "./helpers.js";
import { canvasContext, observers } from "./setup.js";
import { rgb, rgbState, rgbEditingContract } from "./rgbEditingContract.js";

rgbEditingContract(async (initial, initialState, options = {}) => {
  let value = initial;
  let changes = 0,
    commits = 0;
  const requests: GamutPlaneState[] = [];
  let replace!: (value: ColorValue) => void;
  let acceptState!: (state: GamutPlaneState) => void;
  function Host() {
    const [current, setValue] = useState(initial);
    const [state, setState] = useState(initialState);
    value = current;
    replace = setValue;
    acceptState = setState;
    return (
      <GamutPlane
        value={current}
        state={state}
        onValueChange={(next) => {
          changes++;
          if (options.acceptColor !== false) setValue(next);
        }}
        onValueCommit={() => {
          commits++;
        }}
        {...(!options.readOnlyState && {
          onStateChange: (next: GamutPlaneState) => {
            requests.push(next);
            if (options.acceptState !== false) setState(next);
          },
        })}
      />
    );
  }
  const ui = await mount(<Host />);
  return {
    element: ui.element,
    current: () => value,
    changes: () => changes,
    commits: () => commits,
    requests: () => requests,
    replace: async (next) => {
      await act(async () => replace(next));
    },
    state: async (next) => {
      await act(async () => acceptState(next));
    },
    interact: async (action) => {
      await act(async () => action());
    },
    resize: async () => {
      await act(async () => {
        for (const callback of observers) callback([], {} as ResizeObserver);
      });
    },
    dispose: ui.unmount,
  };
});

it("server markup retains raw RGB marker placement and opaque native CSS", () => {
  const html = renderToString(
    <GamutPlane value={rgb()} state={rgbState("srgb")} onValueChange={() => {}} />,
  );
  expect(html).toContain(
    "left:120.00000000%;top:60.00000000%;--marker-color:color(srgb 1.2 0.4 -0.1)",
  );
  expect(html).toContain('data-geometry-id="srgb-rg-rectangle"');
  expect(html).toContain("R / G · fixed B");
});

it("keeps native slice invalidation and raw placement through Strict Mode replay and remount", async () => {
  const clock = frames();
  const originalObservers = observers.size;
  const changes = vi.fn(),
    capability = vi.fn();
  const render = (value: ColorValue, state = rgbState("display-p3")) => (
    <StrictMode>
      <GamutPlane
        value={value}
        state={state}
        onValueChange={changes}
        onCanvasColorSpaceChange={capability}
      />
    </StrictMode>
  );
  const ui = await mount(render(rgb("display-p3")));
  await clock.flush();
  const context = canvasContext(ui.element.querySelector("canvas")!);
  const draws = context.clearRect.mock.calls.length;
  expect(draws).toBeGreaterThan(0);
  expect(capability).toHaveBeenCalledExactlyOnceWith("srgb");
  await ui.render(
    render(rgb("display-p3", [1.4, 0.5, -0.1]), {
      ...rgbState("display-p3"),
      checkedGamuts: [],
      visibleGuides: [],
      referenceGamutId: null,
    }),
  );
  await clock.flush();
  expect(context.clearRect).toHaveBeenCalledTimes(draws);
  expect(ui.element.querySelector<HTMLElement>("[data-active-marker]")!.style.left).toBe("140%");
  await ui.render(render(rgb("display-p3", [1.4, 0.5, 1.1])));
  await clock.flush();
  expect(context.clearRect).toHaveBeenCalledTimes(draws + 1);
  await ui.render(
    render(rgb("display-p3", [1.4, 0.5, 1.1]), {
      ...rgbState("display-p3"),
      selection: { representationId: "display-p3", editorId: "display-p3-rb" },
    }),
  );
  await clock.flush();
  expect(context.clearRect).toHaveBeenCalledTimes(draws + 2);
  expect(
    parseFloat(ui.element.querySelector<HTMLElement>("[data-active-marker]")!.style.top),
  ).toBeCloseTo(-10);
  await ui.render(null);
  expect(observers.size).toBe(originalObservers);
  await clock.flush();
  expect(context.clearRect).toHaveBeenCalledTimes(draws + 2);
  await ui.render(render(rgb("display-p3")));
  await clock.flush();
  expect(ui.element.querySelector<HTMLElement>("[data-active-marker]")!.style.left).toBe("120%");
  expect(changes).not.toHaveBeenCalled();
  await ui.unmount();
  expect(observers.size).toBe(originalObservers);
});
