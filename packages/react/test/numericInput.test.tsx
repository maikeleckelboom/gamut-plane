import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { definitionOf, projectColorToPlane, OKLAB_AB_PLANE } from "@gamut-plane/core";
import { NumericInput } from "../src/components/NumericInput.js";
import { color, editingState, event, get, host, input, mount } from "./helpers.js";

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
  // Exhaustive bad-input, clamping and composition rules belong to UI numericInteraction tests.
  it("delivers native completions once through the authored-color callback without remounting", async () => {
    const ui = await host();
    const field = get<HTMLInputElement>(ui.element, '[aria-label="Chroma numeric value"]');
    for (const [index, completion] of ["Enter", "change", "blur"].entries()) {
      const value = 0.12345 + index * 0.01;
      await input(field, String(value));
      expect(ui.commits).toHaveBeenCalledTimes(index);
      await event(field, completion === "Enter" ? "keydown" : completion, { key: "Enter" });
      await event(field, "change");
      await event(field, "blur");
      expect(ui.changes).toHaveBeenCalledTimes(index + 1);
      expect(ui.commits).toHaveBeenCalledTimes(index + 1);
      expect(ui.order).toEqual(
        Array.from({ length: index + 1 }, () => ["change", "commit"]).flat(),
      );
      expect(definitionOf(ui.commits.mock.calls.at(-1)![0]).channels[1]).toBe(value);
      expect(definitionOf(ui.commits.mock.calls.at(-1)![0]).alpha).toBe(0.37);
      expect(get(ui.element, '[aria-label="Chroma numeric value"]')).toBe(field);
    }
    await input(field, "0.3");
    await event(field, "change");
    expect(ui.commits).toHaveBeenCalledTimes(4);
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
  it("resets a dirty draft on precision-only change", async () => {
    const ui = await numeric();
    await input(ui.input, "-0.17");
    await ui.render(<NumericInput {...ui.props} precision={2} />);
    expect(ui.input.value).toBe("0.20");
    await event(ui.input, "blur");
    expect(ui.complete).not.toHaveBeenCalled();
    expect(ui.cancel).not.toHaveBeenCalled();
  });
  it("keeps a native draft across bound-only changes", async () => {
    const ui = await numeric();
    await input(ui.input, "0.3");
    await ui.render(<NumericInput {...ui.props} min={-0.2} max={0.3} step={0.01} />);
    expect(ui.input.value).toBe("0.3");
    expect(ui.complete).not.toHaveBeenCalled();
  });
  it("does not let queued restoration overwrite a newer draft", async () => {
    const ui = await numeric();
    await input(ui.input, "0.3");
    await act(async () => {
      ui.input.dispatchEvent(new Event("change", { bubbles: true }));
      ui.input.value = "0.1";
      ui.input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(ui.input.value).toBe("0.1");
  });
  it("preserves chroma overflow as authored value", async () => {
    const ui = await host();
    const field = get<HTMLInputElement>(ui.element, '[aria-label="Chroma numeric value"]');
    await input(field, "0.72");
    await event(field, "change");
    expect(definitionOf(ui.commits.mock.calls[0]![0]).channels[1]).toBe(0.72);
    expect(field.value).toBe("0.7200");
    expect(
      get<HTMLInputElement>(ui.element, '[data-picker-control="c"] [type="range"]').value,
    ).toBe("0.4");
    expect(ui.element.textContent).toContain("outside the visible editing range");
  });
  it("uses plane-domain membership for exact-edge and genuine-overflow help", async () => {
    const nearEdge = color(0.62, 0.4000000000000001, 210, 0.7);
    const outside = color(0.62, 0.52, 210, 0.7);
    const oklch = await host({ value: nearEdge });
    const oklab = await host({ value: nearEdge, defaultState: editingState("oklab") });

    expect(oklch.element.textContent).not.toContain("outside the visible editing range");
    expect(oklab.element.textContent).not.toContain("outside the OKLab editing disc");

    await oklch.replace(outside);
    await oklab.replace(outside);
    expect(oklch.element.textContent).toContain(
      "Selected chroma is outside the visible editing range. Use the numeric field to edit the full value.",
    );
    expect(oklab.element.textContent).toContain(
      "Selected color is outside the OKLab editing disc. The marker is shown at the edge; the color is preserved.",
    );
    expect(definitionOf(outside).channels[1]).toBe(0.52);
    expect(oklch.changes).not.toHaveBeenCalled();
    expect(oklab.changes).not.toHaveBeenCalled();
  });
  it("keeps direct OKLab coordinate edits on the disc without overflow help", async () => {
    const ui = await host({ defaultState: editingState("oklab") });
    const coordinate = get<HTMLInputElement>(ui.element, '[aria-label="OKLab a numeric value"]');
    await input(coordinate, "0.8");
    await event(coordinate, "change");

    const edited = ui.changes.mock.calls.at(-1)?.[0];
    expect(edited).toBeDefined();
    const projection = projectColorToPlane(edited!, "oklab");
    if (!projection.ok) throw new Error("Invalid edited projection");
    expect(OKLAB_AB_PLANE.isPointInInstrumentDomain(projection.value.point)).toBe(true);
    expect(ui.element.textContent).not.toContain("outside the OKLab editing disc");
  });
  it("unmount disposes an active composition without callbacks", async () => {
    const ui = await numeric();
    await event(ui.input, "compositionstart");
    await input(ui.input, "0.1");
    await ui.unmount();
    await act(async () => {
      ui.input.dispatchEvent(new Event("change"));
      ui.input.dispatchEvent(new Event("compositionend"));
      ui.input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(ui.complete).not.toHaveBeenCalled();
    expect(ui.cancel).not.toHaveBeenCalled();
  });
});
