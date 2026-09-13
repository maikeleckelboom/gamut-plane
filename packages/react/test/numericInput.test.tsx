import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { NumericInput } from "../src/components/NumericInput.js";
import { event, get, host, input, mount } from "./helpers.js";

async function numeric() {
  const complete = vi.fn(),
    cancel = vi.fn();
  const props = {
    value: 0.2,
    min: -0.4,
    max: 0.4,
    step: 0.001,
    precision: 4,
    onComplete: complete,
    onCancel: cancel,
  };
  const ui = await mount(<NumericInput {...props} />);
  return { ...ui, complete, cancel, props, input: get<HTMLInputElement>(ui.element, "input") };
}
describe("numeric draft lifecycle", () => {
  it.each(["Enter", "change", "blur"])(
    "typing is local and %s completes once across subsequent native events",
    async (completion) => {
      const ui = await host();
      const field = get<HTMLInputElement>(ui.element, '[aria-label="Chroma numeric value"]');
      await input(field, "0.12345");
      expect(ui.changes).not.toHaveBeenCalled();
      expect(ui.commits).not.toHaveBeenCalled();
      await event(field, completion === "Enter" ? "keydown" : completion, { key: "Enter" });
      await event(field, "change");
      await event(field, "blur");
      expect(ui.changes).toHaveBeenCalledOnce();
      expect(ui.commits).toHaveBeenCalledOnce();
      expect(ui.order).toEqual(["change", "commit"]);
      expect(ui.commits.mock.calls[0]![0].c).toBe(0.12345);
      expect(ui.commits.mock.calls[0]![0].alpha).toBe(0.37);
      await input(field, "0.3");
      await event(field, "change");
      expect(ui.commits).toHaveBeenCalledTimes(2);
    },
  );
  it.each(["", "-", "invalid"])("restores invalid draft %s without editing", async (draft) => {
    const ui = await numeric();
    await input(ui.input, draft);
    await event(ui.input, "blur");
    expect(ui.input.value).toBe("0.2000");
    expect(ui.complete).not.toHaveBeenCalled();
    expect(ui.cancel).not.toHaveBeenCalled();
  });
  it("dirty Escape cancels locally, while idle Escape bubbles", async () => {
    const ui = await numeric();
    const escaped = vi.fn();
    ui.element.addEventListener("keydown", escaped);
    await input(ui.input, "-0.12");
    await event(ui.input, "keydown", { key: "Escape" });
    expect(ui.input.value).toBe("0.2000");
    expect(ui.cancel).toHaveBeenCalledOnce();
    expect(escaped).not.toHaveBeenCalled();
    expect(ui.complete).not.toHaveBeenCalled();
    await event(ui.input, "keydown", { key: "Escape" });
    expect(escaped).toHaveBeenCalledOnce();
    expect(ui.cancel).toHaveBeenCalledOnce();
  });
  it("external authored value resets a stale draft silently", async () => {
    const ui = await numeric();
    await input(ui.input, "-0.17");
    await ui.render(<NumericInput {...ui.props} value={0.3} />);
    expect(ui.input.value).toBe("0.3000");
    await event(ui.input, "blur");
    expect(ui.complete).not.toHaveBeenCalled();
  });
  it.each([
    ["-0.25", -0.25],
    ["-1", -0.4],
    ["1", 0.4],
  ] as const)("completes %s with numeric bounds", async (draft, expected) => {
    const ui = await numeric();
    await input(ui.input, draft);
    await event(ui.input, "keydown", { key: "Enter" });
    expect(ui.complete).toHaveBeenCalledExactlyOnceWith(expected);
  });
  it("preserves chroma overflow as authored value", async () => {
    const ui = await host();
    const field = get<HTMLInputElement>(ui.element, '[aria-label="Chroma numeric value"]');
    await input(field, "0.72");
    await event(field, "change");
    expect(ui.commits.mock.calls[0]![0].c).toBe(0.72);
    expect(field.value).toBe("0.7200");
    expect(
      get<HTMLInputElement>(ui.element, '[data-picker-control="c"] [type="range"]').value,
    ).toBe("0.4");
    expect(ui.element.textContent).toContain("exceeds the 0.4000 view");
  });
  it("does not intercept Enter or Escape during IME composition", async () => {
    const ui = await numeric();
    await event(ui.input, "compositionstart");
    await input(ui.input, "-0.3");
    await event(ui.input, "keydown", { key: "Enter", isComposing: true });
    await event(ui.input, "keydown", { key: "Escape" });
    await event(ui.input, "change");
    expect(ui.complete).not.toHaveBeenCalled();
    expect(ui.cancel).not.toHaveBeenCalled();
    await event(ui.input, "compositionend");
    await event(ui.input, "keydown", { key: "Enter" });
    expect(ui.complete).toHaveBeenCalledExactlyOnceWith(-0.3);
  });
  it("unmount discards dirty input and queued restoration silently", async () => {
    const ui = await numeric();
    await input(ui.input, "0.1");
    await ui.unmount();
    await act(async () => {
      ui.input.dispatchEvent(new Event("change"));
    });
    expect(ui.complete).not.toHaveBeenCalled();
    expect(ui.cancel).not.toHaveBeenCalled();
  });
});
