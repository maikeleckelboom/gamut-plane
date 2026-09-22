import { describe, expect, it, vi } from "vitest";
import { GamutPlane } from "../src/index.js";
import { event, frames, get, host, initial, input, mount } from "./helpers.js";
import { canvasContext } from "./setup.js";

describe("instrument presentation contracts", () => {
  it.each(["oklch", "oklab"] as const)(
    "keeps %s guide details collapsed and distinguishes sampled data from exact warnings",
    async (view) => {
      const ui = await mount(
        <GamutPlane value={{ ...initial, c: 0.52 }} onValueChange={vi.fn()} defaultView={view} />,
      );
      const details = get<HTMLDetailsElement>(ui.element, "details");
      expect(details.open).toBe(false);
      expect(
        [...details.querySelectorAll<HTMLElement>("[data-boundary-guide]")].map(
          (guide) => guide.dataset.boundaryGuide,
        ),
      ).toEqual(["srgb", "display-p3"]);
      expect(details.querySelector(".gpr-plane-instrument-active-readout")).not.toBeNull();
      expect(details.querySelector(".gpr-plane-instrument-projection-readout")).not.toBeNull();
      expect(details.textContent).not.toContain("Outside Display P3");
      for (const control of ui.element.querySelectorAll("[data-picker-control] input")) {
        const description = control.getAttribute("aria-describedby");
        expect(description).toBeTruthy();
        expect(
          description
            ?.split(" ")
            .map((id) => document.getElementById(id)?.textContent)
            .join(" "),
        ).toContain("Outside Display P3");
      }
      for (const warning of ui.element.querySelectorAll("[data-gamut-warning]")) {
        expect(warning.getAttribute("aria-hidden")).toBe("true");
        expect(warning.querySelector("svg")).not.toBeNull();
      }
    },
  );
  it("updates exact warnings without losing sampled intervals or clamping overflow", async () => {
    const ui = await host({ value: { ...initial, c: 0.52 } });
    expect(get(ui.element, '[data-picker-control="c"]').dataset.instrumentOverflow).toBe("true");
    expect(
      get<HTMLInputElement>(ui.element, '[data-picker-control="c"] [type="number"]').value,
    ).toBe("0.5200");
    expect(
      get<HTMLInputElement>(ui.element, '[data-picker-control="c"] [type="range"]').value,
    ).toBe("0.4");
    expect(ui.element.querySelectorAll("[data-gamut-range]").length).toBeGreaterThan(0);
    await ui.replace({ ...initial, c: 0 });
    expect(get(ui.element, "[data-gamut-warning]").style.display).toBe("none");
    expect(ui.element.querySelectorAll('[aria-describedby*="gamut-warning"]')).toHaveLength(0);
    expect(ui.changes).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    "reports actual full quality when preview cannot reduce rendering (unavailable buffer: %s)",
    async (unavailable) => {
      const clock = frames();
      if (!unavailable)
        vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue(
          new DOMRect(0, 0, 192, 240),
        );
      const ui = await host();
      await clock.flush();
      const context = canvasContext(get<HTMLCanvasElement>(ui.element, "canvas"));
      context.fillRect.mockClear();
      if (unavailable)
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null);
      const range = get<HTMLInputElement>(ui.element, '[data-picker-control="h"] [type="range"]');
      await event(range, "pointerdown");
      await input(range, "180");
      await clock.flush();
      await clock.flush();
      expect(get(ui.element, "[data-picker-plane]").dataset.fieldQuality).toBe("full");
      expect(context.drawImage).not.toHaveBeenCalled();
      expect(context.fillRect).toHaveBeenCalled();
      expect(get(ui.element, '[role="application"]').dataset.renderColorSpace).toBe("srgb");
    },
  );
});
