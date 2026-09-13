import { describe, expect, it, vi } from "vitest";
import { ColorChannelControl } from "../src/components/ColorChannelControl.js";
import { event, frames, get, host, input, mount } from "./helpers.js";

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
      warningVisible={false}
      warningPosition={0}
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
    expect(ui.commits.mock.calls[0]![0].h).toBe(180);
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
  it.each(["h", "l", "c", "oklab"])("%s has the correct field preview policy", async (channel) => {
    const clock = frames(),
      ui = await host({ defaultView: channel === "oklab" ? "oklab" : "oklch" });
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
  it("view change ends Hue preview and queued range publications", async () => {
    const clock = frames(),
      ui = await host();
    await clock.flush();
    const range = get<HTMLInputElement>(ui.element, '[data-picker-control="h"] [type="range"]');
    await event(range, "pointerdown");
    await input(range, "180");
    await event(get(ui.element, '[data-plane-option="oklab"]'), "click");
    await clock.flush();
    expect(ui.changes).not.toHaveBeenCalled();
    expect(get(ui.element, "[data-picker-plane]").dataset.fieldQuality).toBe("full");
    await event(get(ui.element, '[data-plane-option="oklch"]'), "click");
    await clock.flush();
    expect(get(ui.element, "[data-picker-plane]").dataset.fieldQuality).toBe("full");
  });
});
