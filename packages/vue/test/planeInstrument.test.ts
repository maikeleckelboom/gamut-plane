import { installAnimationFrameController, dispatchPointer } from "./interactionHelpers";
import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OKLAB_AB_PLANE,
  parseCssColor,
  serializeColor,
  type OklchColor,
  type PickerPlaneId,
} from "@gamut-plane/core";
import ColorChannelControl from "../src/components/ColorChannelControl.vue";
import ColorPlane from "../src/components/ColorPlane.vue";
import PlaneInstrument from "../src/components/GamutPlane.vue";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("PlaneInstrument edit contract", () => {
  it.each([
    ["display-p3", null],
    ["srgb", "sRGB canvas"],
    ["unavailable", "canvas unavailable"],
  ] as const)(
    "shows a Canvas badge only for the exceptional %s state",
    async (capability, badge) => {
      const getContext = vi.mocked(HTMLCanvasElement.prototype.getContext);
      const original = getContext.getMockImplementation()!;
      const context = document.createElement("canvas").getContext("2d")!;
      if (capability === "display-p3") {
        getContext.mockImplementation(
          () =>
            ({
              ...context,
              getContextAttributes: () => ({ colorSpace: "display-p3" }),
            }) as CanvasRenderingContext2D,
        );
      } else if (capability === "unavailable") {
        getContext.mockImplementation(() => null);
      }
      try {
        const wrapper = mount(PlaneInstrument, {
          attachTo: document.body,
          props: { modelValue: parseCssColor("oklch(62% 0.24 270)") },
        });
        await flushPromises();
        expect(wrapper.get("[data-render-color-space]").attributes("data-render-color-space")).toBe(
          capability,
        );
        expect(wrapper.find(".color-plane__render-mode").exists()).toBe(badge !== null);
        if (badge) expect(wrapper.get(".color-plane__render-mode").text()).toBe(badge);
        wrapper.unmount();
      } finally {
        getContext.mockImplementation(original);
      }
    },
  );

  it("forwards linear live and committed values as complete canonical colors", async () => {
    const frames = installAnimationFrameController();
    const canonical = parseCssColor("oklch(62% 0.2 210)");
    const wrapper = mount(PlaneInstrument, {
      attachTo: document.body,
      props: { modelValue: canonical },
    });
    await flushPromises();
    const hue = wrapper.get('[data-picker-control="h"] input[type="range"]');

    (hue.element as HTMLInputElement).value = "292.7";
    await hue.trigger("input");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    frames.flush();

    const live = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as OklchColor;
    expect(live.l).toBe(canonical.l);
    expect(live.c).toBe(canonical.c);
    expect(live.h).toBeCloseTo(292.7, 12);
    expect(live.alpha).toBe(canonical.alpha);
    expect(wrapper.emitted("commit")).toBeUndefined();

    await hue.trigger("change");

    const committed = wrapper.emitted("commit")?.at(-1)?.[0] as OklchColor;
    expect(committed).toEqual(live);

    wrapper.unmount();
  });

  it("starts Hue preview on first input and reports completed field quality", async () => {
    const frames = installAnimationFrameController();
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 520,
      bottom: 520,
      width: 520,
      height: 520,
      toJSON: () => ({}),
    });
    const context = document.createElement("canvas").getContext("2d")!;
    const createLinearGradient = vi.mocked(context.createLinearGradient);
    const wrapper = mount(PlaneInstrument, {
      attachTo: document.body,
      props: { modelValue: parseCssColor("oklch(62% 0.2 210)") },
    });
    await flushPromises();
    frames.flush();
    await flushPromises();
    const plane = wrapper.getComponent(ColorPlane);
    const hueControl = wrapper
      .findAllComponents(ColorChannelControl)
      .find((control) => control.props("channel") === "H")!;
    const hue = wrapper.get('[data-picker-control="h"] input[type="range"]')
      .element as HTMLInputElement;

    expect(plane.props("interactionPreview")).toBe(false);
    createLinearGradient.mockClear();
    dispatchPointer(hue, "pointerdown", 11);
    await flushPromises();
    expect(plane.props("interactionPreview")).toBe(false);
    expect(hueControl.emitted("range-interaction")).toBeUndefined();
    expect(frames.pendingCount).toBe(0);

    dispatchPointer(hue, "pointerup", 11);
    await flushPromises();
    expect(plane.props("interactionPreview")).toBe(false);
    expect(plane.attributes("data-field-quality")).toBe("full");
    expect(hueControl.emitted("range-interaction")).toBeUndefined();
    expect(frames.pendingCount).toBe(0);
    expect(createLinearGradient).not.toHaveBeenCalled();

    dispatchPointer(hue, "pointerdown", 12);
    hue.value = "240";
    hue.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();
    expect(plane.props("interactionPreview")).toBe(true);
    expect(plane.attributes("data-field-quality")).toBe("full");
    expect(hueControl.emitted("range-interaction")).toEqual([[true]]);

    hue.value = "250";
    hue.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();
    expect(hueControl.emitted("range-interaction")).toEqual([[true]]);

    frames.flush();
    await flushPromises();
    expect(plane.attributes("data-field-quality")).toBe("preview");

    dispatchPointer(hue, "pointerup", 12);
    await flushPromises();
    expect(plane.props("interactionPreview")).toBe(false);
    expect(plane.attributes("data-field-quality")).toBe("preview");
    expect(hueControl.emitted("range-interaction")).toEqual([[true], [false]]);
    expect(frames.pendingCount).toBe(1);

    frames.flush();
    await flushPromises();
    expect(plane.attributes("data-field-quality")).toBe("full");

    wrapper.unmount();
  });

  it("ends activated Hue preview once on cancellation and ignores other edit modes", async () => {
    const frames = installAnimationFrameController();
    const wrapper = mount(PlaneInstrument, {
      attachTo: document.body,
      props: { modelValue: parseCssColor("oklch(62% 0.2 210)") },
    });
    await flushPromises();
    frames.flush();
    await flushPromises();
    const plane = wrapper.getComponent(ColorPlane);
    const hueControl = wrapper
      .findAllComponents(ColorChannelControl)
      .find((control) => control.props("channel") === "H")!;
    const hue = wrapper.get('[data-picker-control="h"] input[type="range"]')
      .element as HTMLInputElement;

    dispatchPointer(hue, "pointerdown", 21);
    hue.value = "260";
    hue.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();
    expect(plane.props("interactionPreview")).toBe(true);

    dispatchPointer(hue, "pointercancel", 21);
    dispatchPointer(hue, "lostpointercapture", 21);
    await flushPromises();
    expect(plane.props("interactionPreview")).toBe(false);
    expect(hueControl.emitted("range-interaction")).toEqual([[true], [false]]);
    frames.flush();
    await flushPromises();

    hue.value = "205";
    hue.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();
    expect(plane.props("interactionPreview")).toBe(false);
    expect(hueControl.emitted("range-interaction")).toEqual([[true], [false]]);
    frames.flush();
    await flushPromises();

    for (const id of ["l", "c"] as const) {
      const range = wrapper.get(`[data-picker-control="${id}"] input[type="range"]`)
        .element as HTMLInputElement;
      dispatchPointer(range, "pointerdown", id === "l" ? 22 : 23);
      range.value = id === "l" ? "0.7" : "0.25";
      range.dispatchEvent(new Event("input", { bubbles: true }));
      await flushPromises();
      expect(plane.props("interactionPreview")).toBe(false);
      dispatchPointer(range, "pointercancel", id === "l" ? 22 : 23);
      frames.flush();
      await flushPromises();
    }

    await wrapper.setProps({ plane: "oklab" });
    await flushPromises();
    frames.flush();
    await flushPromises();
    const fixedLightness = wrapper.get('[data-picker-control="l"] input[type="range"]')
      .element as HTMLInputElement;
    dispatchPointer(fixedLightness, "pointerdown", 24);
    fixedLightness.value = "0.72";
    fixedLightness.dispatchEvent(new Event("input", { bubbles: true }));
    await flushPromises();
    expect(plane.props("interactionPreview")).toBe(false);
    dispatchPointer(fixedLightness, "pointercancel", 24);

    wrapper.unmount();
  });

  it("keeps the target result visible without a details disclosure or duplicate exact status", async () => {
    const wrapper = mount(PlaneInstrument, {
      attachTo: document.body,
      props: { modelValue: parseCssColor("oklch(62% 0.2 210)") },
    });
    await flushPromises();

    const instrument = wrapper.get("[data-plane-instrument]");
    const title = instrument.get("h2");
    expect(instrument.attributes("aria-labelledby")).toBe(title.attributes("id"));
    expect(title.classes()).toContain("sr-only");
    expect(title.text()).toBe("Color plane instrument");

    const target = wrapper.get("[data-boundary-target-result]");
    expect(target.text()).toContain("Guide C");
    expect(target.get("[data-target-status]").exists()).toBe(true);
    expect(target.get("[data-boundary-guide-swatch]").exists()).toBe(true);
    expect(wrapper.find("details").exists()).toBe(false);
    expect(wrapper.findAll("[data-picker-gamut-status]")).toHaveLength(0);

    wrapper.unmount();
  });

  it.each([
    ["oklch", "ArrowRight", "oklab"],
    ["oklch", "ArrowDown", "oklab"],
    ["oklab", "ArrowLeft", "oklch"],
    ["oklab", "ArrowUp", "oklch"],
  ] as const)(
    "moves coordinate focus from %s with %s and selects %s",
    async (from: PickerPlaneId, key: string, to: PickerPlaneId) => {
      const wrapper = mount(PlaneInstrument, {
        attachTo: document.body,
        props: { modelValue: parseCssColor("oklch(62% 0.2 210)"), plane: from },
      });
      await flushPromises();

      const current = wrapper.get(`[data-plane-option="${from}"]`);
      const next = wrapper.get(`[data-plane-option="${to}"]`);
      expect(current.attributes("tabindex")).toBe("0");
      expect(next.attributes("tabindex")).toBe("-1");

      await current.trigger("keydown", { key });

      expect(wrapper.emitted("update:plane")?.at(-1)).toEqual([to]);
      expect(document.activeElement).toBe(next.element);
      expect(wrapper.emitted("update:modelValue")).toBeUndefined();
      expect(wrapper.emitted("commit")).toBeUndefined();

      await wrapper.setProps({ plane: to });
      expect(current.attributes("tabindex")).toBe("-1");
      expect(next.attributes("tabindex")).toBe("0");

      wrapper.unmount();
    },
  );

  it("uses plane-domain membership for exact-edge and genuine-overflow help", async () => {
    const nearEdge: OklchColor = { l: 0.62, c: 0.4000000000000001, h: 210, alpha: 0.7 };
    const wrapper = mount(PlaneInstrument, {
      attachTo: document.body,
      props: { modelValue: nearEdge, plane: "oklch" },
    });
    await flushPromises();

    expect(wrapper.text()).not.toContain("outside the visible editing range");
    await wrapper.setProps({ plane: "oklab" });
    await flushPromises();
    expect(wrapper.text()).not.toContain("outside the OKLab editing disc");

    const outside = { ...nearEdge, c: 0.52 };
    await wrapper.setProps({ modelValue: outside });
    await flushPromises();
    expect(wrapper.text()).toContain(
      "Selected color is outside the OKLab editing disc. The marker is shown at the edge; the color is preserved.",
    );
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.emitted("commit")).toBeUndefined();

    await wrapper.setProps({ plane: "oklch" });
    await flushPromises();
    expect(wrapper.text()).toContain(
      "Selected chroma is outside the visible editing range. Use the numeric field to edit the full value.",
    );
    expect(outside.c).toBe(0.52);
    wrapper.unmount();
  });

  it.each([
    ["inside", "oklch(62% 0.2 210 / 0.7)"],
    ["outside", "oklch(62% 0.52 210 / 0.7)"],
  ])(
    "switches coordinate view without a color edit and preserves fixed-L axes %s the domain",
    async (_domain, serialized) => {
      const frames = installAnimationFrameController();
      const canonical = parseCssColor(serialized);
      const canonicalSnapshot = structuredClone(canonical);
      const wrapper = mount(PlaneInstrument, {
        attachTo: document.body,
        props: { modelValue: canonical, plane: "oklch" },
      });
      await flushPromises();

      await wrapper.get('[data-plane-option="oklab"]').trigger("click");
      expect(wrapper.emitted("update:plane")).toEqual([["oklab"]]);
      expect(wrapper.emitted("update:modelValue")).toBeUndefined();
      expect(wrapper.emitted("commit")).toBeUndefined();
      expect(canonical).toEqual(canonicalSnapshot);

      await wrapper.setProps({ plane: "oklab" });
      await flushPromises();
      const plane = wrapper.get('[data-picker-plane][data-plane-id="oklab"]');
      expect(plane.get('[data-instrument-domain="disc"]').exists()).toBe(true);
      expect(plane.attributes("data-field-resolution")).toBe("80x24");
      for (const boundary of plane.findAll("[data-gamut-boundary]")) {
        expect(boundary.attributes("d")).toMatch(/ Z$/);
      }

      const fixedControl = wrapper
        .findAllComponents(ColorChannelControl)
        .find((control) => control.props("channel") === "L");
      expect(fixedControl).toBeDefined();
      expect(fixedControl!.props("gradient")).toContain(
        serializeColor(OKLAB_AB_PLANE.editFixedAxis(canonical, 0.5)),
      );

      const fixedLightness = wrapper.get('[data-picker-control="l"] input[type="range"]');
      (fixedLightness.element as HTMLInputElement).value = "0.72";
      await fixedLightness.trigger("input");
      frames.flush();

      const live = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as OklchColor;
      expect(live.l).toBeCloseTo(0.72, 11);
      expect(live.c).toBeCloseTo(canonical.c, 12);
      expect(live.h).toBeCloseTo(canonical.h, 12);
      expect(live.alpha).toBe(canonical.alpha);
      expect(wrapper.emitted("commit")).toBeUndefined();

      await fixedLightness.trigger("change");
      const committed = wrapper.emitted("commit")?.at(-1)?.[0] as OklchColor;
      expect(committed.l).toBeCloseTo(live.l, 12);
      expect(committed.c).toBeCloseTo(live.c, 12);
      expect(committed.h).toBeCloseTo(live.h, 12);
      expect(committed.alpha).toBe(live.alpha);

      wrapper.unmount();
    },
  );

  it("edits bounded OKLab a and b values through the plane unprojection contract", async () => {
    const canonical = parseCssColor("oklch(62% 0.2 45 / 0.7)");
    const canonicalSnapshot = structuredClone(canonical);
    const wrapper = mount(PlaneInstrument, {
      attachTo: document.body,
      props: { modelValue: canonical, plane: "oklab" },
    });
    await flushPromises();

    const aInput = wrapper.get('[data-oklab-coordinate="a"]');
    expect(aInput.attributes("min")).toBe(String(OKLAB_AB_PLANE.xAxis.min));
    expect(aInput.attributes("max")).toBe(String(OKLAB_AB_PLANE.xAxis.max));

    const initialProjection = OKLAB_AB_PLANE.project(canonical);
    const expectedA = OKLAB_AB_PLANE.unproject(
      {
        x: 1,
        y:
          1 -
          (initialProjection.y - OKLAB_AB_PLANE.yAxis.min) /
            (OKLAB_AB_PLANE.yAxis.max - OKLAB_AB_PLANE.yAxis.min),
      },
      initialProjection.fixed,
      canonical,
    );
    (aInput.element as HTMLInputElement).value = "0.8";
    await aInput.trigger("input");
    await aInput.trigger("change");

    const liveA = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as OklchColor;
    expect(liveA).toEqual(expectedA);
    expect(liveA.c).toBeCloseTo(0.4, 12);
    expect(liveA.alpha).toBe(canonical.alpha);
    expect(OKLAB_AB_PLANE.isPointInInstrumentDomain(OKLAB_AB_PLANE.project(liveA).point)).toBe(
      true,
    );

    await wrapper.setProps({ modelValue: liveA });
    expect(wrapper.text()).not.toContain("outside the OKLab editing disc");
    const projectionAfterA = OKLAB_AB_PLANE.project(liveA);
    const expectedB = OKLAB_AB_PLANE.unproject(
      {
        x:
          (projectionAfterA.x - OKLAB_AB_PLANE.xAxis.min) /
          (OKLAB_AB_PLANE.xAxis.max - OKLAB_AB_PLANE.xAxis.min),
        y: 1,
      },
      projectionAfterA.fixed,
      liveA,
    );
    const bInput = wrapper.get('[data-oklab-coordinate="b"]');
    expect(bInput.attributes("min")).toBe(String(OKLAB_AB_PLANE.yAxis.min));
    expect(bInput.attributes("max")).toBe(String(OKLAB_AB_PLANE.yAxis.max));
    (bInput.element as HTMLInputElement).value = "-0.8";
    await bInput.trigger("input");
    await bInput.trigger("change");

    const liveB = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as OklchColor;
    const committedB = wrapper.emitted("commit")?.at(-1)?.[0] as OklchColor;
    expect(liveB).toEqual(expectedB);
    expect(committedB).toEqual(expectedB);
    expect(liveB.c).toBeCloseTo(0.4, 12);
    expect(liveB.alpha).toBe(canonical.alpha);
    expect(canonical).toEqual(canonicalSnapshot);

    wrapper.unmount();
  });

  it.each([
    [292.7, "right"],
    [359, "left"],
  ] as const)("preserves the verified Hue %s warning placement", async (hue, side) => {
    const wrapper = mount(PlaneInstrument, {
      attachTo: document.body,
      props: { modelValue: parseCssColor(`oklch(50% 0.5 ${hue})`) },
    });
    await flushPromises();

    const warning = wrapper.get('[data-picker-control="h"] [data-gamut-warning="linear"]');
    expect(warning.attributes("data-visible")).toBe("true");
    expect(warning.attributes("data-warning-side")).toBe(side);

    wrapper.unmount();
  });

  it("identifies marker roles and applies controlled boundary visibility without editing color", async () => {
    const wrapper = mount(PlaneInstrument, {
      attachTo: document.body,
      props: {
        modelValue: parseCssColor("oklch(62% 0.24 270)"),
        plane: "oklch",
      },
    });
    await flushPromises();

    const plane = wrapper.get('[data-picker-plane][data-plane-id="oklch"]');
    expect(plane.get('[data-marker-role="active-color"]').attributes("aria-label")).toBe(
      "Selected color",
    );
    expect(
      plane.get('[data-marker-role="target-boundary-projection"]').attributes("aria-label"),
    ).toBe("sRGB target boundary projection");

    const boundaryHits = plane.findAll("[data-gamut-boundary-hit]");
    expect(boundaryHits.map((hit) => hit.attributes("aria-label"))).toEqual([
      "Display P3 gamut boundary",
      "sRGB gamut boundary",
    ]);

    const p3BoundaryHit = plane.get('[data-gamut-boundary-hit="display-p3"]');
    expect(p3BoundaryHit.attributes("tabindex")).toBeUndefined();
    expect(p3BoundaryHit.attributes("role")).toBe("img");

    await wrapper.setProps({ showSrgbBoundary: false });
    await flushPromises();

    expect(plane.find('[data-gamut-boundary="srgb"]').exists()).toBe(false);
    expect(plane.find('[data-gamut-boundary-hit="srgb"]').exists()).toBe(false);
    expect(plane.get('[data-gamut-boundary="display-p3"]').exists()).toBe(true);
    expect(wrapper.find('[data-gamut-range="srgb"]').exists()).toBe(false);
    expect(wrapper.find('[data-gamut-marker="srgb-boundary-guide"]').exists()).toBe(false);
    expect(wrapper.find('[data-gamut-marker="srgb-boundary-projection"]').exists()).toBe(false);
    expect(plane.find('[data-marker-role="target-boundary-projection"]').exists()).toBe(false);
    expect(plane.find(".color-plane__projection-connector").exists()).toBe(false);
    expect(wrapper.get("[data-boundary-target-result]").attributes("data-boundary-target")).toBe(
      "srgb",
    );
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.emitted("commit")).toBeUndefined();

    await wrapper.setProps({
      boundaryTarget: "display-p3",
      showSrgbBoundary: true,
      showDisplayP3Boundary: false,
    });
    await flushPromises();
    expect(plane.find('[data-gamut-boundary="display-p3"]').exists()).toBe(false);
    expect(plane.get('[data-gamut-boundary="srgb"]').exists()).toBe(true);
    expect(wrapper.find('[data-gamut-range="display-p3"]').exists()).toBe(false);
    expect(wrapper.find('[data-gamut-marker="display-p3-boundary-guide"]').exists()).toBe(false);
    expect(wrapper.find('[data-gamut-marker="display-p3-boundary-projection"]').exists()).toBe(
      false,
    );
    expect(plane.find('[data-marker-role="target-boundary-projection"]').exists()).toBe(false);
    expect(plane.find(".color-plane__projection-connector").exists()).toBe(false);
    expect(wrapper.get("[data-boundary-target-result]").attributes("data-boundary-target")).toBe(
      "display-p3",
    );

    await wrapper.setProps({ showSrgbBoundary: false });
    await flushPromises();
    expect(plane.findAll("[data-gamut-boundary]")).toHaveLength(0);
    expect(wrapper.findAll("[data-gamut-range]")).toHaveLength(0);
    expect(wrapper.findAll('[data-gamut-marker$="boundary-guide"]')).toHaveLength(0);
    expect(wrapper.find("[data-gamut-marker]").exists()).toBe(false);
    expect(plane.find('[data-marker-role="target-boundary-projection"]').exists()).toBe(false);
    expect(plane.find(".color-plane__projection-connector").exists()).toBe(false);
    expect(wrapper.get("[data-boundary-target-result]").text()).toContain("Guide C");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.emitted("commit")).toBeUndefined();

    wrapper.unmount();
  });

  it("never draws an interpolated boundary projection beyond the selected color", async () => {
    const wrapper = mount(PlaneInstrument, {
      attachTo: document.body,
      props: { modelValue: parseCssColor("oklch(48% 0.225 262)"), plane: "oklch" },
    });
    await flushPromises();

    const active = wrapper.get('[data-marker-role="active-color"]');
    const boundaryProjection = wrapper.get('[data-marker-role="target-boundary-projection"]');
    expect(boundaryProjection.attributes("style")).toContain(
      active.attributes("style").match(/left: [^;]+/)![0],
    );
    expect(wrapper.get("[data-boundary-target-result]").text()).not.toContain("ΔC");

    wrapper.unmount();
  });
});
