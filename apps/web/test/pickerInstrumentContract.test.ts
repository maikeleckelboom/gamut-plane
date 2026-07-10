import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import { parseUserColor, type ChromavertColor } from "@chromavert/color";
import PickerInstrument from "@/components/chromavert/PickerInstrument.vue";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("PickerInstrument edit contract", () => {
  it("forwards linear live and committed values as complete canonical colors", async () => {
    const canonical = parseUserColor("oklch(62% 0.2 210)");
    const wrapper = mount(PickerInstrument, {
      attachTo: document.body,
      props: { modelValue: canonical },
    });
    await flushPromises();
    const hue = wrapper.get('[data-picker-control="h"] input[type="range"]');

    (hue.element as HTMLInputElement).value = "292.7";
    await hue.trigger("input");

    const live = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as ChromavertColor;
    expect(live.l).toBe(canonical.l);
    expect(live.c).toBe(canonical.c);
    expect(live.h).toBeCloseTo(292.7, 12);
    expect(live.alpha).toBe(canonical.alpha);
    expect(wrapper.emitted("commit")).toBeUndefined();

    await hue.trigger("change");

    const committed = wrapper.emitted("commit")?.at(-1)?.[0] as ChromavertColor;
    expect(committed).toEqual(live);

    wrapper.unmount();
  });

  it("switches coordinate view without a color edit and separates fixed-L live and commit", async () => {
    const canonical = parseUserColor("oklch(62% 0.2 210 / 0.7)");
    const canonicalSnapshot = structuredClone(canonical);
    const wrapper = mount(PickerInstrument, {
      attachTo: document.body,
      props: { modelValue: canonical, plane: "oklch" },
    });
    await flushPromises();

    await wrapper.get('[data-plane-option="oklab"]').trigger("click");
    expect(wrapper.emitted("update:plane")).toEqual([["oklab"]]);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.emitted("commit")).toBeUndefined();
    expect(canonical).toEqual(canonicalSnapshot);

    await wrapper.setProps({ plane: "oklab" });
    await flushPromises();
    const plane = wrapper.get('[data-picker-plane][data-plane-id="oklab"]');
    expect(plane.get('[data-instrument-domain="disc"]').exists()).toBe(true);
    expect(plane.get("[data-neutral-center]").exists()).toBe(true);
    expect(plane.attributes("data-field-resolution")).toBe("80x24");
    for (const boundary of plane.findAll("[data-gamut-boundary]")) {
      expect(boundary.attributes("d")).toMatch(/ Z$/);
    }

    const fixedLightness = wrapper.get('[data-picker-control="l"] input[type="range"]');
    (fixedLightness.element as HTMLInputElement).value = "0.72";
    await fixedLightness.trigger("input");

    const live = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as ChromavertColor;
    expect(live.l).toBeCloseTo(0.72, 11);
    expect(live.c).toBeCloseTo(canonical.c, 10);
    expect(live.h).toBeCloseTo(canonical.h, 8);
    expect(live.alpha).toBe(canonical.alpha);
    expect(wrapper.emitted("commit")).toBeUndefined();

    await fixedLightness.trigger("change");
    const committed = wrapper.emitted("commit")?.at(-1)?.[0] as ChromavertColor;
    expect(committed.l).toBeCloseTo(live.l, 12);
    expect(committed.c).toBeCloseTo(live.c, 10);
    expect(committed.h).toBeCloseTo(live.h, 8);
    expect(committed.alpha).toBe(live.alpha);

    wrapper.unmount();
  });

  it.each([
    [292.7, "right"],
    [359, "left"],
  ] as const)("preserves the verified Hue %s warning placement", async (hue, side) => {
    const wrapper = mount(PickerInstrument, {
      attachTo: document.body,
      props: { modelValue: parseUserColor(`oklch(50% 0.5 ${hue})`) },
    });
    await flushPromises();

    const warning = wrapper.get('[data-picker-control="h"] [data-gamut-warning="linear"]');
    expect(warning.attributes("data-visible")).toBe("true");
    expect(warning.attributes("data-warning-side")).toBe(side);

    wrapper.unmount();
  });
});
