import { installAnimationFrameController, dispatchPointer } from "./interactionHelpers";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";

import ColorChannelControl, {
  type LinearControlInterval,
} from "../src/components/ColorChannelControl.vue";
import {
  PICKER_SLIDER_TRACK_HEIGHT,
  PICKER_SLIDER_THUMB_TOP,
  PICKER_SLIDER_WARNING_SIDE_GAP,
  PICKER_SLIDER_WARNING_TOP,
  PICKER_WARNING_GLYPH_SIZE,
} from "@gamut-plane/render";

const WARNING_LABEL = "Outside primary Display P3. Canonical OKLCH is preserved.";

function mountControl(overrides: Partial<InstanceType<typeof ColorChannelControl>["$props"]> = {}) {
  return mount(ColorChannelControl, {
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

function mountCanonicalControl(initialValue = 180) {
  const model = ref(initialValue);
  const updates: number[] = [];
  const commits: number[] = [];
  const Host = defineComponent({
    setup() {
      return () =>
        h(ColorChannelControl, {
          id: "canonical-control",
          label: "Hue",
          channel: "H",
          modelValue: model.value,
          min: 0,
          max: 360,
          step: 1,
          gradient: "linear-gradient(90deg, black, white)",
          "onUpdate:modelValue": (value: number) => {
            updates.push(value);
            model.value = value;
          },
          onCommit: (value: number) => commits.push(value),
        });
    },
  });

  return {
    wrapper: mount(Host, { attachTo: document.body }),
    model,
    updates,
    commits,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("ColorChannelControl gamut annotations", () => {
  it("publishes only the latest live range value once per animation frame", async () => {
    const frames = installAnimationFrameController();
    const wrapper = mountControl({ modelValue: 180 });
    const track = wrapper.get(".channel-control__track").element as HTMLElement;
    const measure = vi.spyOn(track, "getBoundingClientRect");
    const range = wrapper.get('input[type="range"]');

    (range.element as HTMLInputElement).value = "210";
    await range.trigger("input");
    (range.element as HTMLInputElement).value = "220";
    await range.trigger("input");

    expect(frames.pendingCount).toBe(1);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.emitted("commit")).toBeUndefined();
    expect(measure).not.toHaveBeenCalled();

    frames.flush();
    expect(wrapper.emitted("update:modelValue")).toEqual([[220]]);

    (range.element as HTMLInputElement).value = "230";
    await range.trigger("input");
    expect(frames.pendingCount).toBe(1);
    frames.flush();
    expect(wrapper.emitted("update:modelValue")).toEqual([[220], [230]]);
    expect(measure).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("cancels a pending live frame and synchronously publishes the committed range value first", async () => {
    const frames = installAnimationFrameController();
    const order: string[] = [];
    const wrapper = mountControl({
      modelValue: 180,
      "onUpdate:modelValue": (value: number) => order.push(`update:${value}`),
      onCommit: (value: number) => order.push(`commit:${value}`),
    });
    const range = wrapper.get('input[type="range"]');

    (range.element as HTMLInputElement).value = "210";
    await range.trigger("input");
    (range.element as HTMLInputElement).value = "220";
    await range.trigger("input");
    expect(frames.pendingCount).toBe(1);

    (range.element as HTMLInputElement).value = "225";
    await range.trigger("change");

    expect(frames.pendingCount).toBe(0);
    expect(frames.cancellationCount).toBe(1);
    expect(order).toEqual(["update:225", "commit:225"]);
    expect(wrapper.emitted("update:modelValue")).toEqual([[225]]);
    expect(wrapper.emitted("commit")).toEqual([[225]]);

    frames.flush();
    expect(order).toEqual(["update:225", "commit:225"]);

    wrapper.unmount();
  });

  it("restores the canonical native value when pending pointer input is cancelled", () => {
    const frames = installAnimationFrameController();
    const { wrapper, model, updates, commits } = mountCanonicalControl();
    const control = wrapper.getComponent(ColorChannelControl);
    const range = wrapper.get('input[type="range"]').element as HTMLInputElement;

    dispatchPointer(range, "pointerdown", 17);
    range.value = "220";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    expect(range.value).toBe("220");
    expect(frames.pendingCount).toBe(1);

    dispatchPointer(range, "pointercancel", 17);

    expect(frames.pendingCount).toBe(0);
    expect(range.value).toBe("180");
    expect(model.value).toBe(180);
    expect(updates).toEqual([]);
    expect(commits).toEqual([]);
    expect(control.emitted("range-interaction")).toEqual([[true], [false]]);
    frames.flush();
    expect(updates).toEqual([]);

    wrapper.unmount();
  });

  it("restores the latest published value and cannot publish a later cancelled value", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, model, updates, commits } = mountCanonicalControl();
    const range = wrapper.get('input[type="range"]').element as HTMLInputElement;

    dispatchPointer(range, "pointerdown", 18);
    range.value = "210";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    frames.flush();
    await nextTick();
    expect(model.value).toBe(210);
    expect(range.value).toBe("210");

    range.value = "240";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    expect(frames.pendingCount).toBe(1);
    dispatchPointer(range, "lostpointercapture", 18);

    expect(range.value).toBe("210");
    expect(model.value).toBe(210);
    expect(updates).toEqual([210]);
    expect(commits).toEqual([]);
    frames.flush();
    expect(updates).toEqual([210]);

    wrapper.unmount();
  });

  it("keeps a normally completed value through later blur and capture loss", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, model, updates, commits } = mountCanonicalControl();
    const control = wrapper.getComponent(ColorChannelControl);
    const range = wrapper.get('input[type="range"]').element as HTMLInputElement;

    dispatchPointer(range, "pointerdown", 19);
    range.value = "220";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.value = "225";
    range.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();

    range.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    dispatchPointer(range, "lostpointercapture", 19);

    expect(frames.pendingCount).toBe(0);
    expect(model.value).toBe(225);
    expect(range.value).toBe("225");
    expect(updates).toEqual([225]);
    expect(commits).toEqual([225]);
    expect(control.emitted("range-interaction")).toEqual([[true], [false]]);
    frames.flush();
    expect(updates).toEqual([225]);

    wrapper.unmount();
  });

  it("does not emit or roll back when cancellation has no pending range value", () => {
    const frames = installAnimationFrameController();
    const { wrapper, model, updates, commits } = mountCanonicalControl();
    const control = wrapper.getComponent(ColorChannelControl);
    const range = wrapper.get('input[type="range"]').element as HTMLInputElement;

    dispatchPointer(range, "pointerdown", 20);
    dispatchPointer(range, "pointercancel", 20);
    range.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

    expect(frames.pendingCount).toBe(0);
    expect(model.value).toBe(180);
    expect(range.value).toBe("180");
    expect(updates).toEqual([]);
    expect(commits).toEqual([]);
    expect(control.emitted("range-interaction")).toBeUndefined();

    wrapper.unmount();
  });

  it("restores pending native input on blur without reporting a pointer interaction", () => {
    const frames = installAnimationFrameController();
    const { wrapper, model, updates, commits } = mountCanonicalControl();
    const control = wrapper.getComponent(ColorChannelControl);
    const range = wrapper.get('input[type="range"]').element as HTMLInputElement;

    range.value = "200";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    expect(frames.pendingCount).toBe(1);
    range.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

    expect(frames.pendingCount).toBe(0);
    expect(range.value).toBe("180");
    expect(model.value).toBe(180);
    expect(updates).toEqual([]);
    expect(commits).toEqual([]);
    expect(control.emitted("range-interaction")).toBeUndefined();
    frames.flush();
    expect(updates).toEqual([]);

    wrapper.unmount();
  });

  it("cancels pending range work on unmount without a stale emission", async () => {
    const frames = installAnimationFrameController();
    const wrapper = mountControl({ modelValue: 180 });
    const range = wrapper.get('input[type="range"]');

    (range.element as HTMLInputElement).value = "240";
    await range.trigger("input");
    expect(frames.pendingCount).toBe(1);

    wrapper.unmount();
    expect(frames.pendingCount).toBe(0);
    expect(frames.cancellationCount).toBe(1);
    frames.flush();
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("preserves native range clamping and keyboard input commit behavior", () => {
    const frames = installAnimationFrameController();
    const order: string[] = [];
    const wrapper = mountControl({
      modelValue: 180,
      "onUpdate:modelValue": (value: number) => order.push(`update:${value}`),
      onCommit: (value: number) => order.push(`commit:${value}`),
    });
    const range = wrapper.get('input[type="range"]').element as HTMLInputElement;

    range.value = "999";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    expect(frames.pendingCount).toBe(1);
    frames.flush();
    expect(order).toEqual(["update:360"]);

    range.focus();
    range.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowLeft" }));
    range.value = "359";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.dispatchEvent(new Event("change", { bubbles: true }));

    expect(frames.pendingCount).toBe(0);
    expect(order).toEqual(["update:360", "update:359", "commit:359"]);

    wrapper.unmount();
  });

  it("reports pointer interaction only after input and exactly once per active pointer", () => {
    const frames = installAnimationFrameController();
    const wrapper = mountControl({ modelValue: 180 });
    const range = wrapper.get('input[type="range"]').element as HTMLInputElement;

    dispatchPointer(range, "pointerdown", 7);
    expect(wrapper.emitted("range-interaction")).toBeUndefined();
    dispatchPointer(range, "pointerup", 7);
    expect(wrapper.emitted("range-interaction")).toBeUndefined();

    dispatchPointer(range, "pointerdown", 8);
    range.value = "220";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    range.value = "225";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    expect(frames.pendingCount).toBe(1);
    expect(wrapper.emitted("range-interaction")).toEqual([[true]]);
    dispatchPointer(range, "pointerup", 8);
    expect(wrapper.emitted("range-interaction")).toEqual([[true], [false]]);

    dispatchPointer(range, "pointerdown", 9);
    range.value = "230";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    dispatchPointer(range, "pointercancel", 9);
    dispatchPointer(range, "lostpointercapture", 9);
    expect(wrapper.emitted("range-interaction")).toEqual([[true], [false], [true], [false]]);
    expect(frames.pendingCount).toBe(0);

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
    await number.trigger("input");
    await number.trigger("change");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([0.55]);
    expect(wrapper.emitted("commit")?.at(-1)).toEqual([0.55]);
    expect((wrapper.get('input[type="range"]').element as HTMLInputElement).value).toBe("0.4");

    (number.element as HTMLInputElement).value = "0.56";
    await number.trigger("input");
    await number.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([0.56]);
    expect(wrapper.emitted("commit")?.at(-1)).toEqual([0.56]);

    const updateCount = wrapper.emitted("update:modelValue")?.length;
    const commitCount = wrapper.emitted("commit")?.length;
    (number.element as HTMLInputElement).value = "";
    await number.trigger("input");
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

  it("marks in-gamut ranges without a transient threshold hint", async () => {
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
    expect(wrapper.get(".channel-control__field").attributes("style")).toContain(
      "linear-gradient(90deg, black, white)",
    );
    expect(wrapper.find("[data-contextual-gamut-label]").exists()).toBe(false);

    const track = wrapper.get(".channel-control__track");
    track.element.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, clientX: 0.12 * 320 }),
    );
    await nextTick();
    expect(wrapper.find("[data-contextual-gamut-label]").exists()).toBe(false);

    track.element.dispatchEvent(
      new MouseEvent("pointermove", { bubbles: true, clientX: 0.05 * 320 }),
    );
    await nextTick();
    expect(wrapper.find("[data-contextual-gamut-label]").exists()).toBe(false);

    wrapper.unmount();
  });
});
