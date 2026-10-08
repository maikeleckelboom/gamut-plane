import { representationDefinitions } from "@gamut-plane/core/internal/capabilities";
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { createColorValue } from "@gamut-plane/core";
import { coordinatesOptions, shellSelectionFacts } from "@gamut-plane/ui";
import * as resolution from "../src/model/acceptedResolution.js";
import GamutPlane from "../src/components/GamutPlane.vue";
import SelectionContext from "../src/components/SelectionContext.vue";

const result = createColorValue({ space: "oklch", channels: [0.62, 0.2, 45], alpha: 0.37 });
if (!result.ok) throw Error("fixture");
const value = result.value;
const state = {
  selection: { representationId: "oklch", editorId: "oklch-lc" },
  checkedGamuts: ["srgb-gamut"],
  visibleGuides: [],
  referenceGamutId: null,
} as const;
describe("Vue Coordinates shell", () => {
  it("keeps unavailable Coordinates selectable and state read-only independent of color editing", async () => {
    const ui = mount(GamutPlane, { props: { modelValue: value, state } });
    expect((ui.get('[role="combobox"]').element as HTMLButtonElement).disabled).toBe(true);
    const input = ui.get('[aria-label="Chroma numeric value"]');
    (input.element as HTMLInputElement).value = "0.25";
    await input.trigger("input");
    await input.trigger("keydown", { key: "Enter" });
    expect(ui.emitted("commit")).toHaveLength(1);
    const huge = createColorValue({ space: "srgb", channels: [1e308, 0, 0], alpha: 1 });
    if (!huge.ok) throw Error("fixture");
    const request = vi.fn();
    await ui.setProps({
      modelValue: huge.value,
      state: { ...state, checkedGamuts: ["display-p3-gamut"] },
      "onUpdate:state": request,
    });
    expect(ui.get('[data-value="display-p3"]').attributes("aria-label")).toBe(
      "Display P3, gamut status Unavailable",
    );
    await ui.get('[role="combobox"]').trigger("click");
    await ui.get('[data-value="display-p3"]').trigger("click");
    expect(request).toHaveBeenCalledOnce();
    ui.unmount();
  });
  it("keeps highlight below resolution and rejects representation and mode without remounts", async () => {
    const resolve = vi.spyOn(resolution, "resolveAcceptedRevision");
    const request = vi.fn();
    const ui = mount(GamutPlane, {
      props: { modelValue: value, state, "onUpdate:state": request },
    });
    const plane = ui.get('[data-gp-part="surface"]').element;
    const trigger = ui.get('[role="combobox"]');
    const calls = resolve.mock.calls.length;
    await trigger.trigger("keydown", { key: "Enter" });
    await trigger.trigger("keydown", { key: "ArrowDown" });
    expect(ui.get("[data-highlighted]").attributes("data-value")).toBe("oklab");
    expect(ui.get('[aria-selected="true"]').attributes("data-value")).toBe("oklch");
    await trigger.trigger("keydown", { key: "Escape" });
    expect(resolve).toHaveBeenCalledTimes(calls);
    expect(request).not.toHaveBeenCalled();
    await trigger.trigger("click");
    await ui.get('[data-value="srgb"]').trigger("click");
    expect(request).toHaveBeenCalledTimes(1);
    expect(trigger.text()).toContain("OKLCH");
    expect(ui.find(".gp-mode").exists()).toBe(false);
    expect(ui.get('[data-gp-part="surface"]').element).toBe(plane);
    expect(ui.emitted("update:modelValue")).toBeUndefined();
    ui.unmount();
    resolve.mockRestore();
  });
  it("current Coordinates requests an editor and preserves rejected observation with live badges", async () => {
    const request = vi.fn();
    const inspect = { ...state, selection: { representationId: "oklch", editorId: null } } as const;
    const ui = mount(GamutPlane, {
      props: { modelValue: value, state: inspect, "onUpdate:state": request },
    });
    await ui.get('[role="combobox"]').trigger("click");
    await ui.get('[data-value="oklch"]').trigger("click");
    expect(request.mock.lastCall?.[0].selection).toEqual({
      representationId: "oklch",
      editorId: "oklch-lc",
    });
    expect(ui.find('[data-gp-part="inspection-readout"]').exists()).toBe(true);
    expect(ui.find('[data-gp-part="surface"]').exists()).toBe(false);
    expect(ui.findAll(".gp-selector-status[data-gp-status]")).toHaveLength(1);
    await ui.setProps({ state: { ...inspect, checkedGamuts: [] } });
    expect(ui.findAll(".gp-selector-status[data-gp-status]")).toHaveLength(0);
    ui.unmount();
  });
  it("renders admitted alternate Area and returns from Inspect to preferred", async () => {
    const alternate = { id: "test-hc", representationId: "oklch", label: "Hue / Chroma" } as const;
    const facts = {
      ...shellSelectionFacts,
      admittedEditors: [...shellSelectionFacts.admittedEditors, alternate],
      knownEditors: [...shellSelectionFacts.knownEditors, alternate],
    };
    const ui = mount(SelectionContext, {
      props: {
        id: "test",
        selection: { representationId: "oklch", editorId: "test-hc" },
        options: coordinatesOptions([], [], representationDefinitions),
        disabled: false,
        facts,
      },
    });
    expect(ui.get("#test-area").text()).toBe("Hue / Chroma▾");
    await ui.get("#test-area").trigger("click");
    await ui.get('#test-area-list [data-value="oklch-lc"]').trigger("click");
    expect(ui.emitted("request")?.[0]?.[0]).toEqual({
      representationId: "oklch",
      editorId: "oklch-lc",
    });
    expect(ui.get("#test-area").text()).toBe("Hue / Chroma▾");
    await ui.setProps({ selection: { representationId: "oklch", editorId: null } });
    expect(ui.find("#test-area").exists()).toBe(false);
    await ui.get("#test-representation").trigger("click");
    await ui.get('#test-representation-list [data-value="oklch"]').trigger("click");
    expect(ui.emitted("request")?.at(-1)?.[0]).toEqual({
      representationId: "oklch",
      editorId: "oklch-lc",
    });
    ui.unmount();
  });
});
