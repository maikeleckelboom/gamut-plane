import { representationDefinitions } from "@gamut-plane/core/internal/capabilities";
import { act } from "react";
import { createColorValue } from "@gamut-plane/core";
import { describe, expect, it, vi } from "vitest";
import { coordinatesOptions, shellSelectionFacts } from "@gamut-plane/ui";
import * as resolution from "../src/model/acceptedResolution.js";
import { GamutPlane } from "../src/index.js";
import { SelectionContext } from "../src/components/SelectionContext.js";
import { editingState, event, get, initial, mount, selectRepresentation } from "./helpers.js";

describe("React Coordinates shell", () => {
  it("keeps unavailable Coordinates selectable and state read-only independent of color editing", async () => {
    const commit = vi.fn();
    const ui = await mount(
      <GamutPlane
        value={initial}
        state={editingState("oklch")}
        onValueChange={vi.fn()}
        onValueCommit={commit}
      />,
    );
    expect(get<HTMLButtonElement>(ui.element, '[role="combobox"]').disabled).toBe(true);
    const input = get<HTMLInputElement>(ui.element, '[aria-label="Chroma numeric value"]');
    await act(async () => {
      input.value = "0.25";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await event(input, "keydown", { key: "Enter" });
    expect(commit).toHaveBeenCalledOnce();
    const huge = createColorValue({ space: "srgb", channels: [1e308, 0, 0], alpha: 1 });
    if (!huge.ok) throw Error("fixture");
    const request = vi.fn();
    await ui.render(
      <GamutPlane
        value={huge.value}
        state={editingState("oklch")}
        onValueChange={vi.fn()}
        onStateChange={request}
      />,
    );
    expect(get(ui.element, '[data-value="display-p3"]').getAttribute("aria-label")).toBe(
      "Display P3, gamut status Unavailable",
    );
    await selectRepresentation(ui.element, "display-p3");
    expect(request).toHaveBeenCalledOnce();
  });
  it("keeps highlight below resolution and never promotes rejected selection/mode", async () => {
    const resolve = vi.spyOn(resolution, "resolveAcceptedRevision");
    const request = vi.fn();
    const color = vi.fn();
    const ui = await mount(
      <GamutPlane
        value={initial}
        state={editingState("oklch")}
        onStateChange={request}
        onValueChange={color}
      />,
    );
    const plane = get(ui.element, '[data-gp-part="surface"]');
    const trigger = get<HTMLButtonElement>(ui.element, '[role="combobox"]');
    const calls = resolve.mock.calls.length;
    await event(trigger, "keydown", { key: "Enter" });
    await event(trigger, "keydown", { key: "ArrowDown" });
    expect(get(ui.element, "[data-highlighted]").getAttribute("data-value")).toBe("oklab");
    expect(get(ui.element, '[aria-selected="true"]').getAttribute("data-value")).toBe("oklch");
    await event(trigger, "keydown", { key: "Escape" });
    expect(resolve).toHaveBeenCalledTimes(calls);
    expect(request).not.toHaveBeenCalled();
    await selectRepresentation(ui.element, "srgb");
    expect(request).toHaveBeenCalledTimes(1);
    expect(trigger.textContent).toContain("OKLCH");
    expect(ui.element.querySelector(".gp-mode")).toBeNull();
    expect(get(ui.element, '[data-gp-part="surface"]')).toBe(plane);
    expect(color).not.toHaveBeenCalled();
  });
  it("current Coordinates requests an editor and preserves rejected observation with live badges", async () => {
    const request = vi.fn();
    const color = vi.fn();
    const state = {
      ...editingState("oklch"),
      selection: { representationId: "oklch", editorId: null },
    } as const;
    const ui = await mount(
      <GamutPlane value={initial} state={state} onStateChange={request} onValueChange={color} />,
    );
    await selectRepresentation(ui.element, "oklch");
    expect(request.mock.lastCall?.[0].selection).toEqual({
      representationId: "oklch",
      editorId: "oklch-lc",
    });
    expect(ui.element.querySelector('[data-gp-part="inspection-readout"]')).not.toBeNull();
    expect(ui.element.querySelector('[data-gp-part="surface"]')).toBeNull();
    expect(ui.element.querySelectorAll(".gp-selector-status[data-gp-status]")).toHaveLength(2);
    await ui.render(
      <GamutPlane
        value={initial}
        state={{ ...state, checkedGamuts: [] }}
        onStateChange={request}
        onValueChange={color}
      />,
    );
    expect(ui.element.querySelectorAll(".gp-selector-status[data-gp-status]")).toHaveLength(0);
  });
  it("renders admitted alternate Area without promoting a controlled request", async () => {
    const alternate = { id: "test-hc", representationId: "oklch", label: "Hue / Chroma" } as const;
    const facts = {
      ...shellSelectionFacts,
      admittedEditors: [...shellSelectionFacts.admittedEditors, alternate],
      knownEditors: [...shellSelectionFacts.knownEditors, alternate],
    };
    const request = vi.fn();
    const options = coordinatesOptions([], [], representationDefinitions);
    const selection = { representationId: "oklch", editorId: "test-hc" } as const;
    const ui = await mount(
      <SelectionContext
        id="test"
        selection={selection}
        options={options}
        disabled={false}
        request={request}
        facts={facts}
      />,
    );
    expect(get(ui.element, "#test-area").textContent).toBe("Hue / Chroma▾");
    await act(async () => get<HTMLButtonElement>(ui.element, "#test-area").click());
    await act(async () =>
      get<HTMLElement>(ui.element, '#test-area-list [data-value="oklch-lc"]').click(),
    );
    expect(request).toHaveBeenCalledExactlyOnceWith({
      representationId: "oklch",
      editorId: "oklch-lc",
    });
    expect(get(ui.element, "#test-area").textContent).toBe("Hue / Chroma▾");
    await ui.render(
      <SelectionContext
        id="test"
        selection={{ representationId: "oklch", editorId: null }}
        options={options}
        disabled={false}
        request={request}
        facts={facts}
      />,
    );
    expect(ui.element.querySelector("#test-area")).toBeNull();
    await selectRepresentation(ui.element, "oklch");
    expect(request.mock.lastCall?.[0]).toEqual({ representationId: "oklch", editorId: "oklch-lc" });
  });
});
