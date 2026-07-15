import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import OklchLinearControl, {
  type LinearControlInterval,
} from "@/components/chromavert/OklchLinearControl.vue";
import {
  PICKER_SLIDER_TRACK_HEIGHT,
  PICKER_SLIDER_THUMB_TOP,
  PICKER_SLIDER_WARNING_SIDE_GAP,
  PICKER_SLIDER_WARNING_TOP,
  PICKER_WARNING_GLYPH_SIZE,
} from "@/components/chromavert/pickerInstrumentStyle";

const WARNING_LABEL = "Outside primary Display P3. Canonical OKLCH is preserved.";

function mountControl(overrides: Partial<InstanceType<typeof OklchLinearControl>["$props"]> = {}) {
  return mount(OklchLinearControl, {
    attachTo: document.body,
    props: {
      id: "test-control",
      label: "Hue",
      channel: "H",
      modelValue: 0,
      min: 0,
      max: 360,
      step: 1,
      gradient: "linear-gradient(90deg, black, white)",
      ...overrides,
    },
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("OklchLinearControl gamut annotations", () => {
  it("separates live range input from commit without repeated layout reads", async () => {
    const wrapper = mountControl({ modelValue: 180 });
    const track = wrapper.get(".oklch-linear-control__track").element as HTMLElement;
    const measure = vi.spyOn(track, "getBoundingClientRect");
    const range = wrapper.get('input[type="range"]');

    (range.element as HTMLInputElement).value = "210";
    await range.trigger("input");
    (range.element as HTMLInputElement).value = "220";
    await range.trigger("input");

    expect(wrapper.emitted("update:modelValue")).toEqual([[210], [220]]);
    expect(wrapper.emitted("commit")).toBeUndefined();
    expect(measure).not.toHaveBeenCalled();

    await range.trigger("change");
    expect(wrapper.emitted("commit")).toEqual([[220]]);
    expect(measure).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("clamps a supplementary warning across native thumb travel and describes both inputs", async () => {
    const wrapper = mountControl({
      help: "Table-derived visual interval.",
      warningVisible: true,
      warningLabel: WARNING_LABEL,
      warningPosition: 0,
    });
    const warning = wrapper.get('[data-gamut-warning="linear"]');
    const controlStyle = (wrapper.element as HTMLElement).style;

    expect(warning.attributes("aria-hidden")).toBe("true");
    expect(warning.attributes("data-warning-channel")).toBe("h");
    expect(warning.attributes("data-warning-side")).toBe("right");
    expect(warning.attributes("data-visible")).toBe("true");
    expect(
      (warning.element as HTMLElement).style.getPropertyValue("--picker-slider-warning-position"),
    ).toBe("0.0000%");
    expect(
      (warning.element as HTMLElement).style.getPropertyValue(
        "--picker-slider-warning-thumb-offset",
      ),
    ).toBe("5.0000px");
    expect(
      (warning.element as HTMLElement).style.getPropertyValue("--picker-slider-warning-edge"),
    ).toBe("9px");
    expect(
      (warning.element as HTMLElement).style.getPropertyValue(
        "--picker-slider-warning-side-offset",
      ),
    ).toBe("14px");
    expect(controlStyle.getPropertyValue("--picker-slider-warning-top")).toBe("9px");
    expect(controlStyle.getPropertyValue("--picker-slider-track-height")).toBe("32px");
    expect(controlStyle.getPropertyValue("--picker-slider-thumb-top")).toBe(
      `${PICKER_SLIDER_THUMB_TOP}px`,
    );
    expect(PICKER_SLIDER_WARNING_TOP).toBe(
      (PICKER_SLIDER_TRACK_HEIGHT - PICKER_WARNING_GLYPH_SIZE) / 2,
    );
    expect(PICKER_SLIDER_WARNING_SIDE_GAP).toBe(2);
    expect(wrapper.get("#test-control-gamut-warning").text()).toBe(WARNING_LABEL);
    expect(wrapper.get('input[type="range"]').attributes("aria-describedby")).toBe(
      "test-control-help test-control-gamut-warning",
    );
    expect(wrapper.get('input[type="number"]').attributes("aria-describedby")).toBe(
      "test-control-help test-control-gamut-warning",
    );

    await wrapper.setProps({ warningPosition: 1 });
    expect(
      (warning.element as HTMLElement).style.getPropertyValue("--picker-slider-warning-position"),
    ).toBe("100.0000%");
    expect(
      (warning.element as HTMLElement).style.getPropertyValue(
        "--picker-slider-warning-thumb-offset",
      ),
    ).toBe("-5.0000px");
    expect(warning.attributes("data-warning-side")).toBe("left");
    expect(
      (warning.element as HTMLElement).style.getPropertyValue(
        "--picker-slider-warning-side-offset",
      ),
    ).toBe("-14px");

    wrapper.unmount();
  });

  it("keeps the warning visually absent when the supplied exact status is clear", () => {
    const wrapper = mountControl({
      help: "Table-derived visual interval.",
      warningVisible: false,
      warningLabel: WARNING_LABEL,
      warningPosition: 0.5,
    });
    const warning = wrapper.get('[data-gamut-warning="linear"]');

    expect(warning.attributes("data-visible")).toBe("false");
    expect((warning.element as HTMLElement).style.display).toBe("none");
    expect(wrapper.find("#test-control-gamut-warning").exists()).toBe(false);
    expect(wrapper.get('input[type="range"]').attributes("aria-describedby")).toBe(
      "test-control-help",
    );

    wrapper.unmount();
  });

  it("flips only when a gamut marker or threshold occupies the preferred side", async () => {
    const wrapper = mountControl({
      warningVisible: true,
      warningLabel: WARNING_LABEL,
      warningPosition: 0.5,
      markers: [
        {
          id: "nearby-boundary",
          label: "Nearby gamut boundary",
          position: 174 / 320,
          tone: "display-p3",
        },
      ],
    });
    const warning = wrapper.get('[data-gamut-warning="linear"]');

    expect(warning.attributes("data-warning-side")).toBe("left");
    expect(warning.attributes("data-warning-obstacle-count")).toBe("1");

    await wrapper.setProps({
      markers: [
        {
          id: "opposite-boundary",
          label: "Opposite gamut boundary",
          position: 146 / 320,
          tone: "display-p3",
        },
      ],
    });
    expect(warning.attributes("data-warning-side")).toBe("right");

    await wrapper.setProps({
      markers: [],
      intervals: [{ start: 169 / 310, end: 0.9, tone: "display-p3" }],
    });
    expect(warning.attributes("data-warning-side")).toBe("left");
    expect(warning.attributes("data-warning-obstacle-count")).toBe("2");

    wrapper.unmount();
  });

  it("keeps the warning on the out-of-gamut side through small slider movements", async () => {
    const wrapper = mountControl({
      modelValue: 0.349,
      min: 0,
      max: 1,
      step: 0.001,
      warningVisible: true,
      warningLabel: WARNING_LABEL,
      warningPosition: 0.349,
      intervals: [{ start: 0.38, end: 0.66, tone: "display-p3" }],
    });
    const warning = wrapper.get('[data-gamut-warning="linear"]');

    expect(warning.attributes("data-warning-side")).toBe("left");

    await wrapper.setProps({ modelValue: 0.341, warningPosition: 0.341 });
    expect(warning.attributes("data-warning-side")).toBe("left");

    await wrapper.setProps({ modelValue: 0.7, warningPosition: 0.7 });
    expect(warning.attributes("data-warning-side")).toBe("right");

    wrapper.unmount();
  });

  it("pins Chroma overflow visuals without changing the canonical numeric value", async () => {
    const wrapper = mountControl({
      id: "chroma-control",
      label: "Chroma",
      channel: "C",
      modelValue: 0.5,
      min: 0,
      max: 0.4,
      step: 0.001,
      precision: 4,
      overflowMax: true,
      warningVisible: true,
      warningLabel: WARNING_LABEL,
      warningPosition: 1,
    });

    expect(wrapper.attributes("data-instrument-overflow")).toBe("true");
    expect((wrapper.get('input[type="number"]').element as HTMLInputElement).value).toBe("0.5000");
    expect((wrapper.get('input[type="range"]').element as HTMLInputElement).value).toBe("0.4");
    expect(wrapper.get('[data-gamut-warning="linear"]').attributes("data-warning-position")).toBe(
      "1",
    );

    const number = wrapper.get('input[type="number"]');
    (number.element as HTMLInputElement).value = "0.55";
    await number.trigger("change");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([0.55]);
    expect(wrapper.emitted("commit")?.at(-1)).toEqual([0.55]);
    expect((wrapper.get('input[type="range"]').element as HTMLInputElement).value).toBe("0.4");

    (number.element as HTMLInputElement).value = "0.56";
    await number.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([0.56]);
    expect(wrapper.emitted("commit")?.at(-1)).toEqual([0.56]);

    const updateCount = wrapper.emitted("update:modelValue")?.length;
    const commitCount = wrapper.emitted("commit")?.length;
    (number.element as HTMLInputElement).value = "";
    await number.trigger("change");
    expect(wrapper.emitted("update:modelValue")).toHaveLength(updateCount ?? 0);
    expect(wrapper.emitted("commit")).toHaveLength(commitCount ?? 0);

    wrapper.unmount();
  });

  it("does not turn instrument-domain overflow into a gamut warning", () => {
    const wrapper = mountControl({
      id: "overflow-only-control",
      label: "Chroma",
      channel: "C",
      modelValue: 0.5,
      min: 0,
      max: 0.4,
      step: 0.001,
      overflowMax: true,
      warningVisible: false,
      warningLabel: WARNING_LABEL,
      warningPosition: 1,
    });

    expect(wrapper.attributes("data-instrument-overflow")).toBe("true");
    expect(wrapper.attributes("data-warning-visible")).toBe("false");
    expect(
      (wrapper.get('[data-gamut-warning="linear"]').element as HTMLElement).style.display,
    ).toBe("none");
    expect(wrapper.find("#overflow-only-control-gamut-warning").exists()).toBe(false);

    wrapper.unmount();
  });

  it("marks in-gamut ranges without veiling the sampled field and reveals nearby crossings", async () => {
    const intervals: LinearControlInterval[] = [
      { start: 0, end: 0.12, tone: "display-p3" },
      { start: 0.78, end: 1, tone: "display-p3" },
      { start: 0.05, end: 0.62, tone: "srgb" },
      { start: 0.4, end: 0.4, tone: "srgb" },
    ];
    const wrapper = mountControl({ intervals });
    const p3Ranges = wrapper.findAll('[data-gamut-range="display-p3"]');
    const srgbRanges = wrapper.findAll('[data-gamut-range="srgb"]');

    expect(p3Ranges).toHaveLength(2);
    expect(p3Ranges[0]?.attributes("data-range-start")).toBe("0");
    expect(p3Ranges[0]?.attributes("data-range-end")).toBe("0.12");
    expect(p3Ranges[1]?.attributes("data-range-start")).toBe("0.78");
    expect(p3Ranges[1]?.attributes("data-range-end")).toBe("1");
    expect(srgbRanges).toHaveLength(1);
    expect(srgbRanges[0]?.attributes("data-range-start")).toBe("0.05");
    expect(srgbRanges[0]?.attributes("data-range-end")).toBe("0.62");
    expect(wrapper.find("[data-gamut-veil]").exists()).toBe(false);
    expect(wrapper.find("[data-gamut-threshold]").exists()).toBe(false);
    expect(wrapper.get(".oklch-linear-control__field").attributes("style")).toContain(
      "linear-gradient(90deg, black, white)",
    );
    expect(wrapper.find("[data-contextual-gamut-label]").exists()).toBe(false);

    const track = wrapper.get(".oklch-linear-control__track");
    track.element.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, clientX: 0.12 * 320 }),
    );
    await nextTick();
    expect(wrapper.get('[data-contextual-gamut-label="← Inside Display P3 gamut"]').text()).toBe(
      "← Inside Display P3 gamut",
    );

    track.element.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, clientX: 0.05 * 320 }),
    );
    await nextTick();
    expect(wrapper.get('[data-contextual-gamut-label="Inside sRGB gamut →"]').text()).toBe(
      "Inside sRGB gamut →",
    );

    await track.trigger("pointerleave");
    expect(wrapper.find("[data-contextual-gamut-label]").exists()).toBe(false);

    wrapper.unmount();
  });
});
