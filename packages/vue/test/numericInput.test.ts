import { mount } from "@vue/test-utils";
import { createSSRApp, nextTick } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";
import NumericInput from "../src/components/NumericInput.vue";

function numeric() {
  const order: string[] = [];
  const wrapper = mount(NumericInput, {
    props: {
      modelValue: 0.2,
      min: -0.4,
      max: 0.4,
      step: 0.001,
      precision: 4,
      "onUpdate:modelValue": () => order.push("update"),
      onCommit: () => order.push("commit"),
    },
    attachTo: document.body,
  });
  const element = wrapper.element as HTMLInputElement;
  const edit = (value: string) => {
    element.value = value;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const dispatch = (type: string, key?: string, isComposing = false) =>
    element.dispatchEvent(
      type === "keydown"
        ? new KeyboardEvent(type, { key, isComposing, bubbles: true, cancelable: true })
        : new Event(type, { bubbles: true, cancelable: true }),
    );
  return { wrapper, element, edit, dispatch, order };
}

describe("Vue numeric draft lifecycle", () => {
  it("server-renders the authoritative native number value", async () => {
    const html = await renderToString(
      createSSRApp(NumericInput, {
        modelValue: 0.2,
        min: -0.4,
        max: 0.4,
        step: 0.001,
        precision: 4,
      }),
    );
    expect(html).toContain('type="number"');
    expect(html).toContain('value="0.2000"');
  });
  it.each(["Enter", "change", "blur"])(
    "keeps typing local and completes once via %s",
    async (action) => {
      const ui = numeric();
      ui.edit("0.3");
      expect(ui.element.value).toBe("0.3");
      expect(ui.wrapper.emitted("update:modelValue")).toBeUndefined();
      ui.dispatch(action === "Enter" ? "keydown" : action, "Enter");
      ui.dispatch("change");
      ui.dispatch("blur");
      expect(ui.wrapper.emitted("update:modelValue")).toEqual([[0.3]]);
      expect(ui.wrapper.emitted("commit")).toEqual([[0.3]]);
      expect(ui.order).toEqual(["update", "commit"]);
      ui.wrapper.unmount();
    },
  );
  it.each(["", "-", "invalid"])("restores invalid draft %s", async (draft) => {
    const ui = numeric();
    ui.edit(draft);
    ui.dispatch("blur");
    await nextTick();
    expect(ui.element.value).toBe("0.2000");
    expect(ui.wrapper.emitted("commit")).toBeUndefined();
    expect(ui.wrapper.emitted("cancel")).toBeUndefined();
    ui.wrapper.unmount();
  });
  it.each([
    ["-1", -0.4],
    ["1", 0.4],
  ])("clamps %s only on completion", (draft, expected) => {
    const ui = numeric();
    ui.edit(String(draft));
    expect(ui.wrapper.emitted("commit")).toBeUndefined();
    ui.dispatch("change");
    expect(ui.wrapper.emitted("commit")).toEqual([[expected]]);
    ui.wrapper.unmount();
  });
  it("stops dirty Escape and lets idle Escape bubble", () => {
    const ui = numeric();
    let bubbled = 0;
    const onKey = () => bubbled++;
    document.body.addEventListener("keydown", onKey);
    ui.edit("0.3");
    ui.dispatch("keydown", "Escape");
    expect(ui.element.value).toBe("0.2000");
    expect(ui.wrapper.emitted("cancel")).toEqual([[]]);
    expect(bubbled).toBe(0);
    ui.dispatch("keydown", "Escape");
    expect(bubbled).toBe(1);
    document.body.removeEventListener("keydown", onKey);
    ui.wrapper.unmount();
  });
  it("replaces a dirty draft on authored value change", async () => {
    const ui = numeric();
    ui.edit("0.3");
    await ui.wrapper.setProps({ modelValue: 0.1 });
    expect(ui.element.value).toBe("0.1000");
    ui.dispatch("blur");
    expect(ui.wrapper.emitted("commit")).toBeUndefined();
    ui.wrapper.unmount();
  });
  it("keeps a native draft across bound-only changes", async () => {
    const ui = numeric();
    ui.edit("0.3");
    await ui.wrapper.setProps({ min: -0.2, max: 0.3, step: 0.01 });
    expect(ui.element.value).toBe("0.3");
    expect(ui.wrapper.emitted("commit")).toBeUndefined();
    ui.wrapper.unmount();
  });
  it("does not let queued restoration overwrite a newer draft", async () => {
    const ui = numeric();
    ui.edit("0.3");
    ui.dispatch("change");
    ui.edit("0.1");
    await nextTick();
    expect(ui.element.value).toBe("0.1");
    ui.wrapper.unmount();
  });
  it("resets a dirty draft on precision-only change", async () => {
    const ui = numeric();
    ui.edit("0.3");
    await ui.wrapper.setProps({ precision: 2 });
    expect(ui.element.value).toBe("0.20");
    ui.dispatch("blur");
    expect(ui.wrapper.emitted("commit")).toBeUndefined();
    expect(ui.wrapper.emitted("cancel")).toBeUndefined();
    ui.wrapper.unmount();
  });
  it.each(["change", "blur"])("retains an active composition through %s", (action) => {
    const ui = numeric();
    ui.dispatch("compositionstart");
    ui.edit("0.3");
    ui.dispatch("keydown", "Enter", true);
    ui.dispatch("keydown", "Enter");
    ui.dispatch("keydown", "Escape");
    expect(ui.wrapper.emitted("commit")).toBeUndefined();
    expect(ui.wrapper.emitted("cancel")).toBeUndefined();
    ui.dispatch(action);
    expect(ui.element.value).toBe("0.3");
    expect(ui.wrapper.emitted("commit")).toBeUndefined();
    ui.dispatch("compositionend");
    expect(ui.wrapper.emitted("commit")).toBeUndefined();
    ui.dispatch(action);
    expect(ui.wrapper.emitted("commit")).toEqual([[0.3]]);
    ui.dispatch("blur");
    expect(ui.wrapper.emitted("commit")).toEqual([[0.3]]);
    ui.wrapper.unmount();
  });
  it("cancels dirty input normally after compositionend", () => {
    const ui = numeric();
    ui.dispatch("compositionstart");
    ui.edit("0.3");
    ui.dispatch("compositionend");
    ui.dispatch("keydown", "Escape");
    expect(ui.element.value).toBe("0.2000");
    expect(ui.wrapper.emitted("cancel")).toEqual([[]]);
    expect(ui.wrapper.emitted("commit")).toBeUndefined();
    ui.wrapper.unmount();
  });
  it.each([false, true])(
    "disposes a dirty draft without callbacks (composing: %s)",
    (composing) => {
      const ui = numeric();
      if (composing) ui.dispatch("compositionstart");
      ui.edit("0.3");
      ui.wrapper.unmount();
      ui.dispatch("change");
      ui.dispatch("compositionend");
      ui.dispatch("keydown", "Escape");
      expect(ui.wrapper.emitted("commit")).toBeUndefined();
      expect(ui.wrapper.emitted("cancel")).toBeUndefined();
    },
  );
});
