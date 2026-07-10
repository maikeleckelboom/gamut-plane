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
});
