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
  referenceGamutId: null,
  visibleGuides: [],
};

describe("Vue public generalized instrument", () => {
  it("starts with both statuses, both boundaries and sRGB Reference when state is omitted", async () => {
    const html = await renderToString(
      createSSRApp({ render: () => h(GamutPlane, { modelValue: value }) }),
    );
    expect(html).toContain('data-gamut-boundary="srgb"');
    expect(html).toContain('data-gamut-boundary="display-p3"');
    expect(html.match(/data-gp-part="exact-result"/g)).toHaveLength(2);
    expect(html).toContain('data-gp-marker="reference"');
  });

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
    await wrapper.get('[role="combobox"]').trigger("click");
    await wrapper.get('[role="option"][data-value="oklch"]').trigger("click");
    expect(requests).toHaveBeenCalledOnce();
    expect(requests.mock.calls[0]?.[0].selection).toEqual({
      representationId: "oklch",
      editorId: "oklch-lc",
    });
    expect(Object.isFrozen(requests.mock.calls[0]?.[0])).toBe(true);
    expect(wrapper.find("[data-picker-plane]").exists()).toBe(false);
    await wrapper.setProps({ state: observed });
    expect(wrapper.get('[role="combobox"]').text()).toContain("sRGB");
    expect(definitionOf(value)).toEqual(before);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    wrapper.unmount();
  });

  it("owns local default only once and restores a guide without exact analysis", async () => {
    const wrapper = mount(GamutPlane, { props: { modelValue: value, defaultState: observed } });
    await wrapper.get("[data-gp-part='gamut-trigger']").trigger("click");
    await wrapper.get("[data-gp-part='guide-preference'] input").setValue(true);
    // Local ownership accepts immediately; the restored native input follows the accepted render.
    expect(
      (wrapper.get("[data-gp-part='guide-preference'] input").element as HTMLInputElement).checked,
    ).toBe(true);
    expect(wrapper.emitted("update:state")?.at(-1)?.[0]).toMatchObject({
      checkedGamuts: [],
      referenceGamutId: null,
      visibleGuides: ["srgb-boundary"],
    });
    expect(wrapper.find("[data-picker-plane]").exists()).toBe(false);
    expect(wrapper.get("[data-gp-part='guide-preference'] [data-gp-visually-hidden]").text()).toBe(
      "Paused: Requested boundary appears when editing a color space.",
    );
    await wrapper.get('[role="combobox"]').trigger("click");
    await wrapper.get('[role="option"][data-value="oklch"]').trigger("click");
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
    expect((wrapper.get('[role="combobox"]').element as HTMLButtonElement).disabled).toBe(true);
    expect(
      (wrapper.get("[data-gp-part='gamut-trigger']").element as HTMLButtonElement).disabled,
    ).toBe(false);
    const inputs = wrapper.findAll("[data-gp-part='gamut-popup'] input");
    expect(inputs).toHaveLength(7);
    expect(inputs.every((input) => (input.element as HTMLInputElement).disabled)).toBe(true);
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
            referenceGamutId: null,
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

  it("accepts host observation and re-enters OKLab through Coordinates without authoring", async () => {
    const state: GamutPlaneState = {
      selection: { representationId: "oklab", editorId: "oklab-ab" },
      checkedGamuts: [],
      referenceGamutId: null,
      visibleGuides: [],
    };
    const wrapper = mount(GamutPlane, {
      props: { modelValue: value, state, "onUpdate:state": vi.fn() },
    });
    await wrapper.setProps({
      state: { ...state, selection: { representationId: "oklab", editorId: null } },
    });
    expect(wrapper.find("[data-picker-plane]").exists()).toBe(false);
    await wrapper.get('[role="combobox"]').trigger("click");
    await wrapper.get('[data-value="oklab"]').trigger("click");
    expect(wrapper.emitted("update:state")?.at(-1)?.[0]).toMatchObject({
      selection: state.selection,
    });
    await wrapper.setProps({ state });
    expect(wrapper.find("[data-picker-plane]").exists()).toBe(true);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    wrapper.unmount();
  });

  it("preserves an active draft on rejected and comparison-only state, then disposes it on accepted inspection", async () => {
    const requests = vi.fn();
    const state: GamutPlaneState = {
      selection: { representationId: "oklch", editorId: "oklch-lc" },
      checkedGamuts: [],
      referenceGamutId: null,
      visibleGuides: [],
    };
    const wrapper = mount(GamutPlane, {
      props: { modelValue: value, state, "onUpdate:state": requests },
    });
    const number = wrapper.get<HTMLInputElement>('[aria-label="Lightness numeric value"]');
    number.element.value = "0.8";
    await number.trigger("input");
    await wrapper.get('[role="combobox"]').trigger("click");
    await wrapper.get('[role="option"][data-value="srgb"]').trigger("click");
    expect(requests.mock.lastCall?.[0].selection).toEqual({
      representationId: "srgb",
      editorId: "srgb-rg",
    });
    await wrapper.setProps({ state });
    expect(wrapper.get('[aria-label="Lightness numeric value"]').element).toBe(number.element);
    expect(number.element.value).toBe("0.8");
    const comparison: GamutPlaneState = {
      ...state,
      checkedGamuts: ["srgb-gamut"],
      referenceGamutId: "display-p3-gamut",
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
      referenceGamutId: null,
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
    expect(
      wrapper.findAll("[data-gp-part='exact-result'][data-gp-status='unavailable']"),
    ).toHaveLength(2);
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
        referenceGamutId: null,
        visibleGuides: ["srgb-boundary"],
      },
    });
    expect(wrapper.find("[data-picker-plane]").exists()).toBe(false);
    expect(wrapper.text()).toContain("Editing plane unavailable");
    expect(wrapper.find(".gp-mode").exists()).toBe(false);
    expect(wrapper.get("[data-gp-part='inspection-readout']").text()).toContain("Alpha");
    expect(wrapper.findAll("[data-gp-part='exact-result']")).toHaveLength(1);
    expect(wrapper.get("[data-gp-part='guide-preference'] [data-gp-visually-hidden]").text()).toBe(
      "Paused: Requested boundary cannot be drawn here.",
    );
    wrapper.unmount();
  });
});
