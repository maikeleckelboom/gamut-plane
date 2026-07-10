import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

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

  it("flips only when a gamut marker or bracket cap occupies the preferred side", async () => {
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
    expect((wrapper.get('input[type="range"]').element as HTMLInputElement).value).toBe("0.4");

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

  it("renders solid P3 and dashed sRGB brackets with wrapped intervals as edge segments", () => {
    const intervals: LinearControlInterval[] = [
      { start: 0, end: 0.12, tone: "display-p3" },
      { start: 0.78, end: 1, tone: "display-p3" },
      { start: 0.05, end: 0.62, tone: "srgb" },
      { start: 0.4, end: 0.4, tone: "srgb" },
    ];
    const wrapper = mountControl({ intervals });
    const p3Brackets = wrapper.findAll('[data-gamut-bracket="display-p3"]');
    const srgbBrackets = wrapper.findAll('[data-gamut-bracket="srgb"]');

    expect(p3Brackets).toHaveLength(2);
    expect(p3Brackets[0]?.attributes("data-bracket-start")).toBe("0");
    expect(p3Brackets[1]?.attributes("data-bracket-end")).toBe("1");
    expect(p3Brackets[0]?.get('[data-bracket-line="solid"]').exists()).toBe(true);
    for (const bracket of [...p3Brackets, ...srgbBrackets]) {
      const caps = bracket.get("[data-bracket-caps]");
      expect(caps.attributes("d")).toMatch(/^M 0 .+ M 1000 /);
    }
    expect(srgbBrackets).toHaveLength(1);
    expect(srgbBrackets[0]?.get('[data-bracket-line="dashed"]').exists()).toBe(true);

    wrapper.unmount();
  });
});
