import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createColorValue, definitionOf, type ColorValue } from "@gamut-plane/core";
import GamutPlane from "../src/components/GamutPlane.vue";
import { color } from "./colorValue";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function emitted(
  wrapper: ReturnType<typeof mount<typeof GamutPlane>>,
  event: "update:modelValue" | "commit",
) {
  return (wrapper.emitted(event) ?? []).map(([value]) => value as ColorValue);
}

describe("Vue ColorValue instrument", () => {
  it("accepts a non-OKLCH definition and switches view without authoring", async () => {
    const value = createColorValue({ space: "display-p3", channels: [0.7, 0.3, 0.2], alpha: 0.7 });
    if (!value.ok) throw new Error("Invalid test color");
    const wrapper = mount(GamutPlane, {
      attachTo: document.body,
      props: { modelValue: value.value },
    });
    await flushPromises();
    await wrapper.get('[data-plane-option="oklab"]').trigger("click");
    expect(wrapper.get("[data-plane-instrument]").attributes("data-active-plane")).toBe("oklab");
    expect(emitted(wrapper, "update:modelValue")).toHaveLength(0);
    expect(emitted(wrapper, "commit")).toHaveLength(0);
    expect(definitionOf(value.value).space).toBe("display-p3");
    wrapper.unmount();
  });

  it("authors OKLCH and OKLab numeric edits in the edited plane", async () => {
    const wrapper = mount(GamutPlane, {
      attachTo: document.body,
      props: { modelValue: color(0.62, 0.2, 210, 0.7) },
    });
    await flushPromises();
    const chroma = wrapper.get('[aria-label="Chroma numeric value"]');
    (chroma.element as HTMLInputElement).value = "0.25";
    await chroma.trigger("input");
    await chroma.trigger("keydown", { key: "Enter" });
    const oklch = emitted(wrapper, "commit").at(-1)!;
    expect(definitionOf(oklch).space).toBe("oklch");
    expect(definitionOf(oklch).channels[1]).toBe(0.25);
    await wrapper.setProps({ modelValue: oklch });
    await wrapper.get('[data-plane-option="oklab"]').trigger("click");
    const coordinate = wrapper.get('[data-oklab-coordinate="a"]');
    (coordinate.element as HTMLInputElement).value = "-0.13";
    await coordinate.trigger("input");
    await coordinate.trigger("keydown", { key: "Enter" });
    const oklab = emitted(wrapper, "commit").at(-1)!;
    expect(definitionOf(oklab).space).toBe("oklab");
    expect(definitionOf(oklab).channels[1]).toBeCloseTo(-0.13, 10);
    wrapper.unmount();
  });

  it("requires a real Hue edit before chromatic work on a hue-less neutral", async () => {
    const wrapper = mount(GamutPlane, {
      attachTo: document.body,
      props: { modelValue: color(0.5, 0, null) },
    });
    await flushPromises();
    expect(wrapper.text()).toContain("Set Hue before increasing chroma.");
    await wrapper.get('[role="application"]').trigger("keydown", { key: "ArrowRight" });
    expect(emitted(wrapper, "update:modelValue")).toHaveLength(0);
    const hue = wrapper.get('[aria-label="Hue numeric value"]');
    (hue.element as HTMLInputElement).value = "210";
    await hue.trigger("input");
    await hue.trigger("keydown", { key: "Enter" });
    const directed = emitted(wrapper, "commit").at(-1)!;
    expect(definitionOf(directed).channels).toEqual([0.5, 0, 210]);
    await wrapper.setProps({ modelValue: directed });
    await wrapper.get('[role="application"]').trigger("keydown", { key: "ArrowRight" });
    expect(definitionOf(emitted(wrapper, "commit").at(-1)!).channels[1]).toBeGreaterThan(0);
    const count = emitted(wrapper, "update:modelValue").length;
    await wrapper.setProps({ modelValue: color(0.6, 0, null) });
    await wrapper.get('[role="application"]').trigger("keydown", { key: "ArrowRight" });
    expect(emitted(wrapper, "update:modelValue")).toHaveLength(count);
    wrapper.unmount();
  });

  it("keeps target and guide visibility observational", async () => {
    const wrapper = mount(GamutPlane, {
      attachTo: document.body,
      props: { modelValue: color(0.62, 0.42, 30) },
    });
    await flushPromises();
    expect(wrapper.findAll("[data-gamut-boundary]")).toHaveLength(2);
    await wrapper.setProps({
      boundaryTarget: "display-p3",
      showSrgbBoundary: false,
      showDisplayP3Boundary: false,
    });
    expect(wrapper.findAll("[data-gamut-boundary]")).toHaveLength(0);
    expect(wrapper.get("[data-boundary-target-result]").attributes("data-boundary-target")).toBe(
      "display-p3",
    );
    expect(emitted(wrapper, "update:modelValue")).toHaveLength(0);
    wrapper.unmount();
  });
});
