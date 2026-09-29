import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createColorValue, definitionOf, type ColorValue } from "@gamut-plane/core";
import GamutPlane from "../src/components/GamutPlane.vue";
import { color } from "./colorValue";
import { dispatchPointer, installAnimationFrameController } from "./interactionHelpers";

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
  it.each([false, true])(
    "editor change clears %s Hue preview work without stale range callbacks",
    async (published) => {
      const frames = installAnimationFrameController();
      vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 320,
        bottom: 320,
        width: 320,
        height: 320,
        toJSON: () => ({}),
      });
      const wrapper = mount(GamutPlane, {
        attachTo: document.body,
        props: { modelValue: color(0.62, 0.2, 180) },
      });
      await flushPromises();
      frames.flush();
      const range = wrapper.get('[data-picker-control="h"] input[type="range"]')
        .element as HTMLInputElement;
      dispatchPointer(range, "pointerdown", 44);
      range.value = "210";
      range.dispatchEvent(new Event("input", { bubbles: true }));
      if (published) {
        frames.flush();
        await flushPromises();
        frames.flush();
        await flushPromises();
        expect(wrapper.get("[data-picker-plane]").attributes("data-field-quality")).toBe("preview");
      }
      await wrapper.get("select").setValue("oklab");
      frames.flush();
      await flushPromises();
      expect(wrapper.get("[data-picker-plane]").attributes("data-field-quality")).toBe("full");
      expect(emitted(wrapper, "update:modelValue")).toHaveLength(published ? 1 : 0);
      expect(emitted(wrapper, "commit")).toHaveLength(0);
      await wrapper.get("select").setValue("oklch");
      frames.flush();
      await flushPromises();
      expect(wrapper.get("[data-picker-plane]").attributes("data-field-quality")).toBe("full");
      wrapper.unmount();
    },
  );
  it("accepts a non-OKLCH definition and switches view without authoring", async () => {
    const value = createColorValue({ space: "display-p3", channels: [0.7, 0.3, 0.2], alpha: 0.7 });
    if (!value.ok) throw new Error("Invalid test color");
    const wrapper = mount(GamutPlane, {
      attachTo: document.body,
      props: { modelValue: value.value },
    });
    await flushPromises();
    await wrapper.get("select").setValue("oklab");
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
    await wrapper.get("select").setValue("oklab");
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

  it("keeps check and guide preferences observational", async () => {
    const wrapper = mount(GamutPlane, {
      attachTo: document.body,
      props: {
        modelValue: color(0.62, 0.42, 30),
        state: {
          selection: { representationId: "oklch", editorId: "oklch-lc" },
          checkedGamuts: ["display-p3-gamut", "srgb-gamut"],
          referenceGamutId: null,
          visibleGuides: ["display-p3-boundary", "srgb-boundary"],
        },
      },
    });
    await flushPromises();
    expect(wrapper.findAll("[data-gamut-boundary]")).toHaveLength(2);
    await wrapper.setProps({
      state: {
        selection: { representationId: "oklch", editorId: "oklch-lc" },
        checkedGamuts: [],
        referenceGamutId: null,
        visibleGuides: [],
      },
    });
    expect(wrapper.findAll("[data-gamut-boundary]")).toHaveLength(0);
    expect(wrapper.findAll("[data-gp-part='exact-result']")).toHaveLength(0);
    expect(emitted(wrapper, "update:modelValue")).toHaveLength(0);
    wrapper.unmount();
  });
});
