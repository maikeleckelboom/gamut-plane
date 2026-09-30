import { act, Suspense } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createColorValue, definitionOf } from "@gamut-plane/core";
import { GamutPlane, type GamutPlaneProps, type GamutPlaneState } from "../src/index.js";
import { get, initial, mount, selectRepresentation as select } from "./helpers.js";

const observed: GamutPlaneState = {
  selection: { representationId: "srgb", editorId: null },
  checkedGamuts: [],
  referenceGamutId: null,
  visibleGuides: [],
};

describe("React public generalized instrument", () => {
  it("starts with both statuses, both boundaries and sRGB Reference when state is omitted", () => {
    const html = renderToString(<GamutPlane value={initial} onValueChange={vi.fn()} />);
    expect(html).toContain('data-gamut-boundary="srgb"');
    expect(html).toContain('data-gamut-boundary="display-p3"');
    expect(html.match(/data-gp-part="exact-result"/g)).toHaveLength(2);
    expect(html).toContain('data-gp-marker="reference"');
  });

  it("renders observation on the server and requests state without authoring or accepting rejection", async () => {
    const requests = vi.fn<(state: GamutPlaneState) => void>();
    const colors = vi.fn();
    const props = {
      value: initial,
      onValueChange: colors,
      state: observed,
      onStateChange: requests,
    };
    const html = renderToString(<GamutPlane {...props} />);
    expect(html).toContain('aria-label="sRGB coordinates"');
    expect(html).toContain("Alpha");
    expect(html).not.toContain("data-picker-plane");
    const before = definitionOf(initial);
    const ui = await mount(<GamutPlane {...props} />);
    expect(ui.element.querySelector("[data-picker-plane]")).toBeNull();
    await select(ui.element, "oklch");
    expect(requests).toHaveBeenCalledOnce();
    expect(requests.mock.calls[0]?.[0].selection).toEqual({
      representationId: "oklch",
      editorId: "oklch-lc",
    });
    expect(Object.isFrozen(requests.mock.calls[0]?.[0])).toBe(true);
    expect(ui.element.querySelector("[data-picker-plane]")).toBeNull();
    await ui.render(<GamutPlane {...props} />);
    expect(get<HTMLButtonElement>(ui.element, '[role="combobox"]').textContent).toBe("sRGB▾");
    expect(definitionOf(initial)).toEqual(before);
    expect(colors).not.toHaveBeenCalled();
  });

  it("initializes local state once, preserves empty sets and restores a requested guide", async () => {
    const requests = vi.fn<(state: GamutPlaneState) => void>();
    const ui = await mount(
      <GamutPlane
        value={initial}
        onValueChange={vi.fn()}
        defaultState={observed}
        onStateChange={requests}
      />,
    );
    expect(ui.element.querySelector("[data-picker-plane]")).toBeNull();
    await act(async () =>
      get<HTMLButtonElement>(ui.element, "[data-gp-part='gamut-trigger']").click(),
    );
    const guide = get<HTMLInputElement>(ui.element, "[data-gp-part='guide-preference'] input");
    await act(async () => guide.click());
    expect(requests.mock.lastCall?.[0].visibleGuides).toEqual(["srgb-boundary"]);
    expect(ui.element.querySelector("[data-picker-plane]")).toBeNull();
    expect(
      get(ui.element, "[data-gp-part='guide-preference'] [data-gp-visually-hidden]").textContent,
    ).toBe("Paused: Requested boundary appears when editing a color space.");
    await select(ui.element, "oklch");
    expect(get(ui.element, "[data-picker-plane]")).toBeTruthy();
    expect(ui.element.querySelector("[data-gamut-boundary='srgb']")).not.toBeNull();
    expect(requests.mock.lastCall?.[0].checkedGamuts).toEqual([]);
    expect(ui.element.querySelector("[data-boundary-target-result]")).toBeNull();
    await ui.render(
      <GamutPlane
        value={initial}
        onValueChange={vi.fn()}
        defaultState={observed}
        onStateChange={requests}
      />,
    );
    expect(get(ui.element, "[data-picker-plane]")).toBeTruthy();
  });

  it("keeps controlled state read-only and rejects invalid state", async () => {
    const ui = await mount(<GamutPlane value={initial} onValueChange={vi.fn()} state={observed} />);
    expect(get<HTMLButtonElement>(ui.element, '[role="combobox"]').disabled).toBe(true);
    expect(get<HTMLButtonElement>(ui.element, "[data-gp-part='gamut-trigger']").disabled).toBe(
      false,
    );
    const inputs = [
      ...ui.element.querySelectorAll<HTMLInputElement>("[data-gp-part='gamut-popup'] input"),
    ];
    expect(inputs).toHaveLength(7);
    expect(inputs.every((input) => input.disabled)).toBe(true);
    const invalid: GamutPlaneProps = {
      value: initial,
      onValueChange: vi.fn(),
      // @ts-expect-error the public checked gamut union rejects unknown IDs
      state: { ...observed, checkedGamuts: ["unknown"] },
    };
    expect(() => renderToString(<GamutPlane {...invalid} />)).toThrow("unknown-gamut");
  });

  it.each(["oklch", "oklab", "srgb", "display-p3"] as const)(
    "renders %s observation without a fake editor",
    async (representationId) => {
      const ui = await mount(
        <GamutPlane
          value={initial}
          onValueChange={vi.fn()}
          state={{
            selection: { representationId, editorId: null },
            checkedGamuts: [],
            referenceGamutId: null,
            visibleGuides: [],
          }}
        />,
      );
      expect(ui.element.querySelector("[data-picker-plane]")).toBeNull();
      expect(ui.element.querySelectorAll("[data-gp-part='inspection-readout'] dt")).toHaveLength(4);
      expect(ui.element.querySelector("[data-boundary-target-result]")).toBeNull();
    },
  );

  it("toggles OKLCH editing and inspection without authoring", async () => {
    const colors = vi.fn();
    const state: GamutPlaneState = {
      selection: { representationId: "oklch", editorId: "oklch-lc" },
      checkedGamuts: [],
      referenceGamutId: null,
      visibleGuides: [],
    };
    const ui = await mount(
      <GamutPlane value={initial} onValueChange={colors} defaultState={state} />,
    );
    const toggle = get<HTMLInputElement>(ui.element, '.gp-mode input[value="inspect"]');
    await act(async () => toggle.click());
    expect(ui.element.querySelector("[data-picker-plane]")).toBeNull();
    await act(async () =>
      get<HTMLInputElement>(ui.element, '.gp-mode input[value="edit"]').click(),
    );
    expect(ui.element.querySelector("[data-picker-plane]")).not.toBeNull();
    expect(colors).not.toHaveBeenCalled();
  });

  it("preserves an active draft on rejected and comparison-only state, then disposes it on accepted inspection", async () => {
    const requests = vi.fn<(state: GamutPlaneState) => void>();
    const colors = vi.fn();
    const state: GamutPlaneState = {
      selection: { representationId: "oklch", editorId: "oklch-lc" },
      checkedGamuts: [],
      referenceGamutId: null,
      visibleGuides: [],
    };
    const render = (accepted: GamutPlaneState) => (
      <GamutPlane
        value={initial}
        onValueChange={colors}
        state={accepted}
        onStateChange={requests}
      />
    );
    const ui = await mount(render(state));
    const number = get<HTMLInputElement>(ui.element, '[aria-label="Lightness numeric value"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        number,
        "0.8",
      );
      number.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await select(ui.element, "srgb");
    expect(requests.mock.lastCall?.[0].selection).toEqual({
      representationId: "srgb",
      editorId: null,
    });
    await ui.render(render(state));
    expect(get(ui.element, '[aria-label="Lightness numeric value"]')).toBe(number);
    expect(number.value).toBe("0.8");
    const comparison = {
      ...state,
      checkedGamuts: ["srgb-gamut"] as const,
      referenceGamutId: "display-p3-gamut" as const,
      visibleGuides: ["srgb-boundary"] as const,
    };
    await ui.render(render(comparison));
    expect(get(ui.element, '[aria-label="Lightness numeric value"]')).toBe(number);
    expect(number.value).toBe("0.8");
    await ui.render(
      render({ ...comparison, selection: { representationId: "oklch", editorId: null } }),
    );
    expect(number.isConnected).toBe(false);
    expect(ui.element.querySelector("[data-picker-plane]")).toBeNull();
    await ui.render(render(comparison));
    expect(get(ui.element, '[aria-label="Lightness numeric value"]')).not.toBe(number);
    expect(colors).not.toHaveBeenCalled();
  });

  it("keeps accepted state authoritative across a suspended inspection request and rejection", async () => {
    const state: GamutPlaneState = {
      selection: { representationId: "oklch", editorId: "oklch-lc" },
      checkedGamuts: [],
      referenceGamutId: null,
      visibleGuides: [],
    };
    const inspection: GamutPlaneState = {
      ...state,
      selection: { representationId: "oklch", editorId: null },
    };
    const requests = vi.fn<(next: GamutPlaneState) => void>();
    const colors = vi.fn();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let ready = false;
    function SuspendedInspection() {
      if (!ready) throw pending;
      return (
        <GamutPlane
          value={initial}
          onValueChange={colors}
          state={inspection}
          onStateChange={requests}
        />
      );
    }
    const editable = (
      <GamutPlane value={initial} onValueChange={colors} state={state} onStateChange={requests} />
    );
    const ui = await mount(<Suspense fallback={<p>Preparing inspection</p>}>{editable}</Suspense>);
    const originalPlane = get(ui.element, "[data-picker-plane]");
    await act(async () =>
      get<HTMLInputElement>(ui.element, '.gp-mode input[value="inspect"]').click(),
    );
    expect(requests.mock.lastCall?.[0].selection.editorId).toBeNull();
    expect(get(ui.element, "[data-picker-plane]")).toBe(originalPlane);

    await ui.render(
      <Suspense fallback={<p>Preparing inspection</p>}>
        <SuspendedInspection />
      </Suspense>,
    );
    expect(ui.element.textContent).toContain("Preparing inspection");
    await ui.render(<Suspense fallback={<p>Preparing inspection</p>}>{editable}</Suspense>);
    expect(get(ui.element, "[data-picker-plane]")).toBeTruthy();
    await ui.render(
      <Suspense fallback={<p>Preparing inspection</p>}>
        <SuspendedInspection />
      </Suspense>,
    );
    await act(async () => {
      ready = true;
      release();
      await pending;
    });
    expect(ui.element.querySelector("[data-picker-plane]")).toBeNull();
    expect(get<HTMLInputElement>(ui.element, '.gp-mode input[value="inspect"]').checked).toBe(true);
    await ui.render(<Suspense fallback={<p>Preparing inspection</p>}>{editable}</Suspense>);
    expect(get(ui.element, "[data-picker-plane]")).toBeTruthy();
    expect(colors).not.toHaveBeenCalled();
  });

  it("keeps null Hue, tolerance and scoped failures visible", async () => {
    const neutral = createColorValue({ space: "oklch", channels: [0.5, -0, null], alpha: 0.4 });
    const tolerance = createColorValue({ space: "srgb", channels: [-1e-10, 0.5, 0.5], alpha: 1 });
    const huge = createColorValue({ space: "srgb", channels: [1e308, 0, 0], alpha: 0.4 });
    if (!neutral.ok || !tolerance.ok || !huge.ok) throw new Error("Invalid fixtures");
    const state: GamutPlaneState = {
      selection: { representationId: "oklch", editorId: null },
      checkedGamuts: [],
      referenceGamutId: null,
      visibleGuides: [],
    };
    const ui = await mount(
      <GamutPlane value={neutral.value} onValueChange={vi.fn()} state={state} />,
    );
    expect(ui.element.textContent).toContain("missing");
    expect(ui.element.textContent).toContain("-0");
    await ui.render(
      <GamutPlane
        value={tolerance.value}
        onValueChange={vi.fn()}
        state={{
          ...state,
          selection: { representationId: "srgb", editorId: null },
          checkedGamuts: ["srgb-gamut"],
        }}
      />,
    );
    expect(ui.element.textContent).toContain("Within tolerance");
    await ui.render(
      <GamutPlane
        value={huge.value}
        onValueChange={vi.fn()}
        state={{
          ...state,
          selection: { representationId: "srgb", editorId: null },
          checkedGamuts: ["srgb-gamut", "display-p3-gamut"],
        }}
      />,
    );
    expect(
      ui.element.querySelectorAll("[data-gp-part='exact-result'][data-gp-status='unavailable']"),
    ).toHaveLength(2);
    expect(ui.element.textContent).toContain("Alpha");
    await ui.render(
      <GamutPlane
        value={huge.value}
        onValueChange={vi.fn()}
        state={{ ...state, selection: { representationId: "display-p3", editorId: null } }}
      />,
    );
    expect(ui.element.textContent).toContain("Coordinates unavailable");
    expect(ui.element.textContent).toContain("Alpha");
    const outOfField = createColorValue({ space: "oklch", channels: [1.2, 0.1, 40], alpha: 0.4 });
    if (!outOfField.ok) throw new Error("Invalid field fixture");
    await ui.render(
      <GamutPlane
        value={outOfField.value}
        onValueChange={vi.fn()}
        state={{
          ...state,
          selection: { representationId: "oklab", editorId: "oklab-ab" },
          checkedGamuts: ["srgb-gamut"],
          referenceGamutId: null,
          visibleGuides: ["srgb-boundary"],
        }}
      />,
    );
    expect(ui.element.querySelector("[data-picker-plane]")).toBeNull();
    expect(ui.element.textContent).toContain("Editing plane unavailable");
    expect(get<HTMLInputElement>(ui.element, 'input[value="edit"]').checked).toBe(true);
    expect(get(ui.element, "[data-gp-part='inspection-readout']").textContent).toContain("Alpha");
    expect(ui.element.querySelectorAll("[data-gp-part='exact-result']")).toHaveLength(1);
    expect(
      get(ui.element, "[data-gp-part='guide-preference'] [data-gp-visually-hidden]").textContent,
    ).toBe("Paused: Requested boundary cannot be drawn here.");
  });
});
