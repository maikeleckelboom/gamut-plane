import { installAnimationFrameController, dispatchPointer } from "./interactionHelpers";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { normalizeHue } from "@gamut-plane/core";

import ColorChannelControl, {
  type LinearControlInterval,
} from "../src/components/ColorChannelControl.vue";

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

function mountSelectedControl(initialValue = 180, normalizeValue = (value: number) => value) {
  const model = ref(initialValue);
  const updates: number[] = [];
  const commits: number[] = [];
  const Host = defineComponent({
    setup() {
      return () =>
        h(ColorChannelControl, {
          id: "selected-control",
          label: "Hue",
          channel: "H",
          modelValue: model.value,
          min: 0,
          max: 360,
          step: 1,
          normalizeValue,
          gradient: "linear-gradient(90deg, black, white)",
          "onUpdate:modelValue": (value: number) => {
            updates.push(value);
            model.value = normalizeValue(value);
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
  it("keeps the right Hue endpoint visible when authored feedback normalizes 360 to zero", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, model, commits } = mountSelectedControl(252, normalizeHue);
    const range = wrapper.get('input[type="range"]').element as HTMLInputElement;

    range.value = "360";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    frames.flush();
    await nextTick();
    expect(model.value).toBe(0);
    expect(range.getAttribute("aria-label")).toBe("Hue");
    expect(range.value).toBe("360");

    range.dispatchEvent(new Event("change", { bubbles: true }));
    await nextTick();
    expect(commits).toEqual([360]);
    expect(range.value).toBe("360");

    model.value = 180;
    await nextTick();
    expect(range.value).toBe("180");
    wrapper.unmount();
  });

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

  it("restores the committed native value when pending pointer input is cancelled", () => {
    const frames = installAnimationFrameController();
    const { wrapper, model, updates, commits } = mountSelectedControl();
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
    const { wrapper, model, updates, commits } = mountSelectedControl();
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
    const { wrapper, model, updates, commits } = mountSelectedControl();
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
    const { wrapper, model, updates, commits } = mountSelectedControl();
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
    const { wrapper, model, updates, commits } = mountSelectedControl();
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

  it("lets differing parent feedback replace pending Hue without publication or commit", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, model, updates, commits } = mountSelectedControl();
    const control = wrapper.getComponent(ColorChannelControl);
    const range = wrapper.get('input[type="range"]').element as HTMLInputElement;
    dispatchPointer(range, "pointerdown", 31);
    range.value = "120";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    model.value = 270;
    await nextTick();
    frames.flush();
    expect(model.value).toBe(270);
    expect(range.value).toBe("270");
    expect(updates).toEqual([]);
    expect(commits).toEqual([]);
    expect(control.emitted("range-interaction")).toEqual([[true], [false]]);
    wrapper.unmount();
  });

  it("ends active preview once when differing parent feedback replaces a published Hue", async () => {
    const frames = installAnimationFrameController();
    const { wrapper, model, updates, commits } = mountSelectedControl();
    const control = wrapper.getComponent(ColorChannelControl);
    const range = wrapper.get('input[type="range"]').element as HTMLInputElement;
    dispatchPointer(range, "pointerdown", 32);
    range.value = "210";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    frames.flush();
    await nextTick();
    expect(updates).toEqual([210]);
    model.value = 270;
    await nextTick();
    dispatchPointer(range, "pointerup", 32);
    dispatchPointer(range, "lostpointercapture", 32);
    range.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    frames.flush();
    expect(model.value).toBe(270);
    expect(range.value).toBe("270");
    expect(updates).toEqual([210]);
    expect(commits).toEqual([]);
    expect(control.emitted("range-interaction")).toEqual([[true], [false]]);
    wrapper.unmount();
  });

  it("disposes an active published preview without an interaction-end callback", async () => {
    const frames = installAnimationFrameController();
    const interaction = vi.fn();
    const wrapper = mountControl({ modelValue: 180, onRangeInteraction: interaction });
    const control = wrapper.getComponent(ColorChannelControl);
    const range = wrapper.get('input[type="range"]').element as HTMLInputElement;
    dispatchPointer(range, "pointerdown", 33);
    range.value = "210";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    frames.flush();
    expect(control.emitted("range-interaction")).toEqual([[true]]);
    wrapper.unmount();
    dispatchPointer(range, "lostpointercapture", 33);
    range.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    expect(interaction.mock.calls).toEqual([[true]]);
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

  it("pins Chroma overflow visuals without changing the authored numeric value", async () => {
    const wrapper = mountControl({
      id: "chroma-control",
      label: "Chroma",
      channel: "C",
      modelValue: 0.5,
      min: 0,
      max: 0.4,
      step: 0.001,
      precision: 4,
      numericBounds: { min: 0 },
    });

    expect(wrapper.attributes("data-instrument-overflow")).toBe("true");
    expect((wrapper.get('input[type="number"]').element as HTMLInputElement).value).toBe("0.5000");
    expect((wrapper.get('input[type="range"]').element as HTMLInputElement).value).toBe("0.4");

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
