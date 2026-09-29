import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { definitionOf, normalizeHue } from "@gamut-plane/core";
import { ColorChannelControl } from "../src/components/ColorChannelControl.js";
import {
  color,
  editingState,
  event,
  frames,
  get,
  host,
  input,
  mount,
  selectRepresentation,
} from "./helpers.js";

async function range() {
  const clock = frames(),
    live = vi.fn(),
    complete = vi.fn(),
    interaction = vi.fn(),
    cancel = vi.fn();
  const ui = await mount(
    <ColorChannelControl
      id="range"
      channel="H"
      label="Hue"
      value={100}
      min={0}
      max={360}
      step={0.1}
      precision={1}
      gradient="linear-gradient(90deg, black, white)"
      intervals={[]}
      onInput={live}
      onComplete={complete}
      onInteraction={interaction}
      onCancel={cancel}
    />,
  );
  return {
    ...ui,
    clock,
    live,
    complete,
    interaction,
    cancel,
    range: get<HTMLInputElement>(ui.element, '[type="range"]'),
  };
}
describe("native range lifecycle", () => {
  it("keeps the right Hue endpoint visible when authored feedback normalizes 360 to zero", async () => {
    const clock = frames(),
      ui = await host();
    await clock.flush();
    const range = get<HTMLInputElement>(ui.element, '[data-picker-control="h"] [type="range"]');

    await input(range, "360");
    await clock.flush();
    expect(definitionOf(ui.changes.mock.calls.at(-1)![0]).channels[2]).toBe(0);
    expect(range.getAttribute("aria-label")).toBe("Hue");
    expect(range.value).toBe("360");
    expect(range.parentElement!.style.getPropertyValue("--gp-range-warning-position")).toContain(
      "100.00000000%",
    );

    await event(range, "change");
    expect(range.value).toBe("360");
    expect(ui.commits).toHaveBeenCalledOnce();

    await ui.replace(color(0.62, 0.2, 180, 0.37));
    expect(range.value).toBe("180");
    expect(range.parentElement!.style.getPropertyValue("--gp-range-warning-position")).toContain(
      "50.00000000%",
    );
  });

  it.each([false, true])(
    "keeps pending Hue work through Reference changes (also comparison=%s)",
    async (comparison) => {
      const clock = frames(),
        ui = await host({ defaultState: editingState("oklch") });
      await clock.flush();
      const range = get<HTMLInputElement>(ui.element, '[data-picker-control="h"] [type="range"]');
      await event(range, "pointerdown");
      await input(range, "360");
      const details = get<HTMLDetailsElement>(ui.element, "details");
      details.open = true;
      if (comparison) {
        const checks = get<HTMLElement>(ui.element, "fieldset");
        await act(async () => get<HTMLInputElement>(checks, "input").click());
        await act(async () =>
          get<HTMLInputElement>(ui.element, '[aria-label="sRGB Boundary"]').click(),
        );
      }
      await act(async () =>
        get<HTMLInputElement>(ui.element, '[aria-label="Use Display P3 as Reference"]').click(),
      );
      expect(get(ui.element, '[data-picker-control="h"] [type="range"]')).toBe(range);
      await clock.flush();
      expect(ui.changes).toHaveBeenCalledOnce();
      expect(definitionOf(ui.changes.mock.calls[0]![0]).channels[2]).toBe(0);
      expect(range.value).toBe("360");
      await event(range, "change");
      expect(ui.commits).toHaveBeenCalledOnce();
      expect(ui.cancels).not.toHaveBeenCalled();
    },
  );

  it.each([87.1, 360])("retains Hue preview through normalized feedback for %s", async (hue) => {
    const clock = frames(),
      ui = await host();
    await clock.flush();
    const range = get<HTMLInputElement>(ui.element, '[data-picker-control="h"] [type="range"]');
    const field = get(ui.element, "[data-picker-plane]");
    await event(range, "pointerdown");
    for (const next of [hue, 90.1]) {
      await input(range, String(next));
      await clock.flush();
      await clock.flush();
      expect(definitionOf(ui.changes.mock.calls.at(-1)![0]).channels[2]).toBe(normalizeHue(next));
      expect(field.dataset.fieldQuality).toBe("preview");
    }
    await event(range, "change");
    await clock.flush();
    expect(field.dataset.fieldQuality).toBe("full");
    expect(ui.commits).toHaveBeenCalledOnce();
    expect(ui.commits.mock.calls[0]![0]).toEqual(ui.changes.mock.calls.at(-1)![0]);
    expect(ui.cancels).not.toHaveBeenCalled();
  });

  it("different external Hue still interrupts normalized feedback and discards pending input", async () => {
    const clock = frames(),
      ui = await host();
    await clock.flush();
    const range = get<HTMLInputElement>(ui.element, '[data-picker-control="h"] [type="range"]');
    await event(range, "pointerdown");
    await input(range, "87.1");
    await clock.flush();
    await clock.flush();
    await input(range, "90.1");
    await ui.replace(color(0.62, 0.2, 180, 0.37));
    await clock.flush();
    expect(range.value).toBe("180");
    expect(get(ui.element, "[data-picker-plane]").dataset.fieldQuality).toBe("full");
    expect(ui.changes).toHaveBeenCalledOnce();
    expect(ui.commits).not.toHaveBeenCalled();
    expect(ui.cancels).not.toHaveBeenCalled();
  });

  it("lets differing parent feedback replace pending Hue without publication or commit", async () => {
    const clock = frames(),
      ui = await host();
    await clock.flush();
    const range = get<HTMLInputElement>(ui.element, '[data-picker-control="h"] [type="range"]');
    await event(range, "pointerdown");
    await input(range, "120");
    await ui.replace(color(0.62, 0.2, 270, 0.37));
    await clock.flush();
    expect(range.value).toBe("270");
    expect(ui.changes).not.toHaveBeenCalled();
    expect(ui.commits).not.toHaveBeenCalled();
    expect(ui.cancels).not.toHaveBeenCalled();
    expect(get(ui.element, "[data-picker-plane]").dataset.fieldQuality).toBe("full");
  });

  it("ends active preview once when differing parent feedback replaces a published Hue", async () => {
    const clock = frames(),
      ui = await host();
    await clock.flush();
    const range = get<HTMLInputElement>(ui.element, '[data-picker-control="h"] [type="range"]');
    await event(range, "pointerdown");
    await input(range, "210");
    await clock.flush();
    await clock.flush();
    expect(get(ui.element, "[data-picker-plane]").dataset.fieldQuality).toBe("preview");
    await ui.replace(color(0.62, 0.2, 270, 0.37));
    await event(range, "pointerup");
    await event(range, "lostpointercapture");
    await event(range, "blur");
    await clock.flush();
    expect(range.value).toBe("270");
    expect(ui.changes).toHaveBeenCalledOnce();
    expect(ui.commits).not.toHaveBeenCalled();
    expect(ui.cancels).not.toHaveBeenCalled();
    expect(get(ui.element, "[data-picker-plane]").dataset.fieldQuality).toBe("full");
  });

  it("coalesces to one latest live publication without committing", async () => {
    const ui = await range();
    for (const value of [110, 120, 130]) await input(ui.range, String(value));
    expect(ui.clock.size).toBe(1);
    expect(ui.live).not.toHaveBeenCalled();
    expect(ui.complete).not.toHaveBeenCalled();
    await ui.clock.flush();
    expect(ui.live).toHaveBeenCalledExactlyOnceWith(130);
    expect(ui.complete).not.toHaveBeenCalled();
    expect(ui.interaction).not.toHaveBeenCalled();
  });
  it("native change cancels pending work and publishes the actual final value before committing", async () => {
    const clock = frames(),
      ui = await host();
    await clock.flush();
    const range = get<HTMLInputElement>(ui.element, '[data-picker-control="h"] [type="range"]');
    await input(range, "120");
    range.value = "180";
    await event(range, "change");
    expect(ui.order).toEqual(["change", "commit"]);
    expect(ui.commits.mock.calls[0]![0]).toEqual(ui.changes.mock.calls[0]![0]);
    expect(definitionOf(ui.commits.mock.calls[0]![0]).channels[2]).toBe(180);
    await clock.flush();
    expect(ui.changes).toHaveBeenCalledOnce();
  });
  it.each(["pointercancel", "lostpointercapture", "blur"])(
    "%s discards unpublished input and ends preview exactly once",
    async (interruption) => {
      const ui = await range();
      await event(ui.range, "pointerdown");
      expect(ui.interaction).not.toHaveBeenCalled();
      await input(ui.range, "120");
      await ui.clock.flush();
      await input(ui.range, "180");
      await event(ui.range, interruption);
      await ui.clock.flush();
      await event(ui.range, "blur");
      expect(ui.live).toHaveBeenCalledExactlyOnceWith(120);
      expect(ui.range.value).toBe("120");
      expect(ui.complete).not.toHaveBeenCalled();
      expect(ui.interaction.mock.calls).toEqual([[true], [false]]);
      expect(ui.cancel).not.toHaveBeenCalled();
    },
  );
  it("idle cancellation and ordinary completion never invent cancel events", async () => {
    const ui = await range();
    await event(ui.range, "pointerdown");
    await event(ui.range, "pointercancel");
    expect(ui.interaction).not.toHaveBeenCalled();
    expect(ui.cancel).not.toHaveBeenCalled();
    await event(ui.range, "pointerdown");
    await input(ui.range, "180");
    await event(ui.range, "change");
    await event(ui.range, "lostpointercapture");
    await event(ui.range, "blur");
    expect(ui.range.value).toBe("180");
    expect(ui.complete).toHaveBeenCalledExactlyOnceWith(180);
    expect(ui.interaction.mock.calls).toEqual([[true], [false]]);
  });
  it("unmount cancels frames and listeners without consumer callbacks", async () => {
    const ui = await range();
    await event(ui.range, "pointerdown");
    await input(ui.range, "180");
    await ui.unmount();
    await ui.clock.flush();
    expect(ui.clock.size).toBe(0);
    expect(ui.live).not.toHaveBeenCalled();
    expect(ui.complete).not.toHaveBeenCalled();
    expect(ui.cancel).not.toHaveBeenCalled();
    expect(ui.interaction.mock.calls).toEqual([[true]]);
  });
  it("disposes an active published preview without an interaction-end callback", async () => {
    const ui = await range();
    await event(ui.range, "pointerdown");
    await input(ui.range, "180");
    await ui.clock.flush();
    expect(ui.interaction.mock.calls).toEqual([[true]]);
    await ui.unmount();
    await event(ui.range, "lostpointercapture");
    await event(ui.range, "blur");
    expect(ui.live).toHaveBeenCalledExactlyOnceWith(180);
    expect(ui.complete).not.toHaveBeenCalled();
    expect(ui.cancel).not.toHaveBeenCalled();
    expect(ui.interaction.mock.calls).toEqual([[true]]);
  });
  it.each(["h", "l", "c", "oklab"])("%s has the correct field preview policy", async (channel) => {
    const clock = frames(),
      ui = await host({ defaultState: editingState(channel === "oklab" ? "oklab" : "oklch") });
    await clock.flush();
    const range = get<HTMLInputElement>(
      ui.element,
      `[data-picker-control="${channel === "oklab" ? "l" : channel}"] [type="range"]`,
    );
    const field = get(ui.element, "[data-picker-plane]");
    await event(range, "pointerdown");
    await clock.flush();
    expect(field.dataset.fieldQuality).toBe("full");
    await input(range, channel === "h" ? "120" : "0.3");
    await clock.flush();
    await clock.flush();
    expect(field.dataset.fieldQuality).toBe(channel === "h" ? "preview" : "full");
    await event(range, "pointercancel");
    await clock.flush();
    expect(field.dataset.fieldQuality).toBe("full");
  });
  it("editor change ends Hue preview and queued range publications", async () => {
    const clock = frames(),
      ui = await host();
    await clock.flush();
    const range = get<HTMLInputElement>(ui.element, '[data-picker-control="h"] [type="range"]');
    await event(range, "pointerdown");
    await input(range, "180");
    await selectRepresentation(ui.element, "oklab");
    await clock.flush();
    expect(ui.changes).not.toHaveBeenCalled();
    expect(get(ui.element, "[data-picker-plane]").dataset.fieldQuality).toBe("full");
    await selectRepresentation(ui.element, "oklch");
    await clock.flush();
    expect(get(ui.element, "[data-picker-plane]").dataset.fieldQuality).toBe("full");
  });
});
