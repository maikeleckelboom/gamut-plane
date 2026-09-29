import { mount } from "@vue/test-utils";
import { createSSRApp, h, nextTick } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it, vi } from "vitest";
import { createColorValue, definitionOf } from "@gamut-plane/core";
import type { GamutPlaneState } from "../src/index.js";
import GamutPlane from "../src/components/GamutPlane.vue";

const valueResult = createColorValue({ space: "oklch", channels: [0.62, 0.2, 45], alpha: 0.37 });
if (!valueResult.ok) throw new Error("Invalid fixture");
const value = valueResult.value;
const observed: GamutPlaneState = {
  selection: { representationId: "srgb", editorId: null },
  checkedGamuts: [],
  visibleGuides: [],
};

describe("Vue public generalized instrument", () => {
  it("renders server observation and rejects a controlled request without reauthoring", async () => {
    const requests = vi.fn();
    const html = await renderToString(
      createSSRApp({ render: () => h(GamutPlane, { modelValue: value, state: observed }) }),
    );
    expect(html).toContain("sRGB coordinates");
    expect(html).toContain("Alpha");
    expect(html).not.toContain("data-picker-plane");
    const before = definitionOf(value);
    const wrapper = mount(GamutPlane, {
      props: { modelValue: value, state: observed, "onUpdate:state": requests },
    });
    expect(wrapper.find("[data-picker-plane]").exists()).toBe(false);
    await wrapper.get("select").setValue("oklch");
    expect(requests).toHaveBeenCalledOnce();
    expect(requests.mock.calls[0]?.[0].selection).toEqual({
      representationId: "oklch",
      editorId: "oklch-lc",
    });
    expect(Object.isFrozen(requests.mock.calls[0]?.[0])).toBe(true);
    expect(wrapper.find("[data-picker-plane]").exists()).toBe(false);
    await wrapper.setProps({ state: observed });
    expect((wrapper.get("select").element as HTMLSelectElement).value).toBe("srgb");
    expect(definitionOf(value)).toEqual(before);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    wrapper.unmount();
  });

  it("owns local default only once and restores a guide without exact analysis", async () => {
    const wrapper = mount(GamutPlane, { props: { modelValue: value, defaultState: observed } });
    const details = wrapper.get("details").element as HTMLDetailsElement;
    details.open = true;
    await wrapper.get("[data-gp-part='guide-preference'] input").setValue(true);
    expect(wrapper.emitted("update:state")?.at(-1)?.[0]).toMatchObject({
      checkedGamuts: [],
      visibleGuides: ["srgb-boundary"],
    });
    expect(wrapper.find("[data-picker-plane]").exists()).toBe(false);
    expect(wrapper.text()).toContain("Requested guides will appear");
    await wrapper.get("select").setValue("oklch");
    await nextTick();
    expect(wrapper.find("[data-picker-plane]").exists()).toBe(true);
    expect(wrapper.find("[data-gamut-boundary='srgb']").exists()).toBe(true);
    expect(wrapper.find("[data-boundary-target-result]").exists()).toBe(false);
    await wrapper.setProps({ defaultState: observed });
    expect(wrapper.find("[data-picker-plane]").exists()).toBe(true);
    wrapper.unmount();
  });

  it("keeps controlled state read-only and rejects invalid state", () => {
    const wrapper = mount(GamutPlane, { props: { modelValue: value, state: observed } });
    expect((wrapper.get("select").element as HTMLSelectElement).disabled).toBe(true);
    expect(
      wrapper
        .findAll("details input")
        .every((input) => (input.element as HTMLInputElement).disabled),
    ).toBe(true);
    wrapper.unmount();
    expect(() =>
      mount(GamutPlane, {
        props: { modelValue: value, state: { ...observed, visibleGuides: ["unknown"] } },
      }),
    ).toThrow("unknown-guide");
  });

  it.each(["oklch", "oklab", "srgb", "display-p3"] as const)(
    "renders %s observation without a fake editor",
    (representationId) => {
      const wrapper = mount(GamutPlane, {
        props: {
          modelValue: value,
          state: {
            selection: { representationId, editorId: null },
            checkedGamuts: [],
            visibleGuides: [],
          },
        },
      });
      expect(wrapper.find("[data-picker-plane]").exists()).toBe(false);
      expect(wrapper.findAll("[data-gp-part='inspection-readout'] dt")).toHaveLength(4);
      expect(wrapper.find("[data-boundary-target-result]").exists()).toBe(false);
      wrapper.unmount();
    },
  );

  it("toggles OKLab editing and inspection without authoring", async () => {
    const state: GamutPlaneState = {
      selection: { representationId: "oklab", editorId: "oklab-ab" },
      checkedGamuts: [],
      visibleGuides: [],
    };
    const wrapper = mount(GamutPlane, { props: { modelValue: value, defaultState: state } });
    await wrapper.get(".gp-generalized-edit-toggle input").setValue(false);
    expect(wrapper.find("[data-picker-plane]").exists()).toBe(false);
    await wrapper.get(".gp-generalized-edit-toggle input").setValue(true);
    expect(wrapper.find("[data-picker-plane]").exists()).toBe(true);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    wrapper.unmount();
  });

  it("preserves an active draft on rejected and comparison-only state, then disposes it on accepted inspection", async () => {
    const requests = vi.fn();
    const state: GamutPlaneState = {
      selection: { representationId: "oklch", editorId: "oklch-lc" },
      checkedGamuts: [],
      visibleGuides: [],
    };
    const wrapper = mount(GamutPlane, {
      props: { modelValue: value, state, "onUpdate:state": requests },
    });
    const number = wrapper.get<HTMLInputElement>('[aria-label="Lightness numeric value"]');
    number.element.value = "0.8";
    await number.trigger("input");
    await wrapper.get("select").setValue("srgb");
    expect(requests.mock.lastCall?.[0].selection).toEqual({
      representationId: "srgb",
      editorId: null,
    });
    await wrapper.setProps({ state });
    expect(wrapper.get('[aria-label="Lightness numeric value"]').element).toBe(number.element);
    expect(number.element.value).toBe("0.8");
    const comparison: GamutPlaneState = {
      ...state,
      checkedGamuts: ["srgb-gamut"],
      visibleGuides: ["srgb-boundary"],
    };
    await wrapper.setProps({ state: comparison });
    expect(wrapper.get('[aria-label="Lightness numeric value"]').element).toBe(number.element);
    expect(number.element.value).toBe("0.8");
    await wrapper.setProps({
      state: { ...comparison, selection: { representationId: "oklch", editorId: null } },
    });
    expect(number.element.isConnected).toBe(false);
    expect(wrapper.find("[data-picker-plane]").exists()).toBe(false);
    await wrapper.setProps({ state: comparison });
    expect(wrapper.get('[aria-label="Lightness numeric value"]').element).not.toBe(number.element);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    wrapper.unmount();
  });

  it("keeps null Hue, tolerance and scoped failures visible", async () => {
    const neutral = createColorValue({ space: "oklch", channels: [0.5, -0, null], alpha: 0.4 });
    const tolerance = createColorValue({ space: "srgb", channels: [-1e-10, 0.5, 0.5], alpha: 1 });
    const huge = createColorValue({ space: "srgb", channels: [1e308, 0, 0], alpha: 0.4 });
    if (!neutral.ok || !tolerance.ok || !huge.ok) throw new Error("Invalid fixtures");
    const state: GamutPlaneState = {
      selection: { representationId: "oklch", editorId: null },
      checkedGamuts: [],
      visibleGuides: [],
    };
    const wrapper = mount(GamutPlane, { props: { modelValue: neutral.value, state } });
    expect(wrapper.text()).toContain("missing");
    expect(wrapper.text()).toContain("-0");
    await wrapper.setProps({
      modelValue: tolerance.value,
      state: {
        ...state,
        selection: { representationId: "srgb", editorId: null },
        checkedGamuts: ["srgb-gamut"],
      },
    });
    expect(wrapper.text()).toContain("Within tolerance");
    await wrapper.setProps({
      modelValue: huge.value,
      state: {
        ...state,
        selection: { representationId: "srgb", editorId: null },
        checkedGamuts: ["srgb-gamut", "display-p3-gamut"],
      },
    });
    expect(wrapper.findAll("[data-gp-status='unavailable']")).toHaveLength(2);
    expect(wrapper.text()).toContain("Alpha");
    await wrapper.setProps({
      modelValue: huge.value,
      state: { ...state, selection: { representationId: "display-p3", editorId: null } },
    });
    expect(wrapper.text()).toContain("Coordinates unavailable");
    expect(wrapper.text()).toContain("Alpha");
    const outOfField = createColorValue({ space: "oklch", channels: [1.2, 0.1, 40], alpha: 0.4 });
    if (!outOfField.ok) throw new Error("Invalid field fixture");
    await wrapper.setProps({
      modelValue: outOfField.value,
      state: {
        ...state,
        selection: { representationId: "oklab", editorId: "oklab-ab" },
        checkedGamuts: ["srgb-gamut"],
        visibleGuides: ["srgb-boundary"],
      },
    });
    expect(wrapper.find("[data-picker-plane]").exists()).toBe(false);
    expect(wrapper.text()).toContain("Editing plane unavailable");
    expect(wrapper.get("[data-gp-part='inspection-readout']").text()).toContain("Alpha");
    expect(wrapper.findAll("[data-gp-part='exact-result']")).toHaveLength(1);
    expect(wrapper.text()).toContain("Some requested guides cannot be shown");
    wrapper.unmount();
  });
});
