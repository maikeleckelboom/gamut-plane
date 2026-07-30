import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import {
  OKLAB_AB_PLANE,
  parseCssColor,
  serializeColor,
  type OklchColor,
  type PickerPlaneId,
} from "@gamut-plane/core";
import ColorChannelControl from "@/components/ColorChannelControl.vue";
import ColorPlane from "@/components/ColorPlane.vue";
import PlaneInstrument from "@/components/PlaneInstrument.vue";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("PlaneInstrument edit contract", () => {
  it("forwards linear live and committed values as complete canonical colors", async () => {
    const canonical = parseCssColor("oklch(62% 0.2 210)");
    const wrapper = mount(PlaneInstrument, {
      attachTo: document.body,
      props: { modelValue: canonical },
    });
    await flushPromises();
    const hue = wrapper.get('[data-picker-control="h"] input[type="range"]');

    (hue.element as HTMLInputElement).value = "292.7";
    await hue.trigger("input");

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

  it("forwards planar cancellation after a live color without committing it", async () => {
    const canonical = parseCssColor("oklch(62% 0.2 210)");
    const live = parseCssColor("oklch(74% 0.28 210)");
    const wrapper = mount(PlaneInstrument, {
      attachTo: document.body,
      props: { modelValue: canonical },
    });
    await flushPromises();

    const plane = wrapper.getComponent(ColorPlane);
    plane.vm.$emit("update:modelValue", live);
    plane.vm.$emit("cancel");
    await flushPromises();

    expect(wrapper.emitted("update:modelValue")).toEqual([[live]]);
    expect(wrapper.emitted("cancel")).toEqual([[]]);
    expect(wrapper.emitted("commit")).toBeUndefined();

    wrapper.unmount();
  });

  it("keeps unique geometry facts in collapsed boundary details without duplicating exact status", async () => {
    const wrapper = mount(PlaneInstrument, {
      attachTo: document.body,
      props: { modelValue: parseCssColor("oklch(62% 0.2 210)") },
    });
    await flushPromises();

    const instrument = wrapper.get("[data-plane-instrument]");
    const title = instrument.get("#plane-instrument-title");
    expect(instrument.attributes("aria-labelledby")).toBe("plane-instrument-title");
    expect(title.classes()).toContain("sr-only");
    expect(title.text()).toBe("Color plane instrument");
    expect(instrument.find(".plane-instrument__header").exists()).toBe(false);

    const details = wrapper.get("[data-boundary-details]");
    expect(details.attributes("open")).toBeUndefined();
    expect(details.get("summary").text()).toContain("Boundary details");
    expect(details.get("summary").text()).toContain("Table guides / projection");
    expect(details.findAll("[data-picker-gamut-status]")).toHaveLength(0);
    expect(details.get('[data-boundary-guide="display-p3"]').exists()).toBe(true);
    expect(details.get('[data-boundary-guide="srgb"]').exists()).toBe(true);
    expect(details.get(".plane-instrument__projection-readout").exists()).toBe(true);
    expect(details.get(".plane-instrument__method").exists()).toBe(true);
    expect(details.text()).not.toMatch(/\binside\b|\boutside\b/i);

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

  it.each([
    ["inside", "oklch(62% 0.2 210 / 0.7)"],
    ["outside", "oklch(62% 0.52 210 / 0.7)"],
  ])(
    "switches coordinate view without a color edit and preserves fixed-L axes %s the domain",
    async (_domain, serialized) => {
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
      expect(plane.find("[data-neutral-center]").exists()).toBe(false);
      expect(plane.attributes("data-field-resolution")).toBe("80x24");
      for (const boundary of plane.findAll("[data-gamut-boundary]")) {
        expect(boundary.attributes("d")).toMatch(/ Z$/);
      }

      const fixedControl = wrapper
        .findAllComponents(ColorChannelControl)
        .find((control) => control.props("id") === "picker-oklab-lightness");
      expect(fixedControl).toBeDefined();
      expect(fixedControl!.props("gradient")).toContain(
        serializeColor(OKLAB_AB_PLANE.editFixedAxis(canonical, 0.5)),
      );

      const fixedLightness = wrapper.get('[data-picker-control="l"] input[type="range"]');
      (fixedLightness.element as HTMLInputElement).value = "0.72";
      await fixedLightness.trigger("input");

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

    const liveA = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as OklchColor;
    expect(liveA).toEqual(expectedA);
    expect(liveA.c).toBeCloseTo(0.4, 12);
    expect(liveA.alpha).toBe(canonical.alpha);

    await wrapper.setProps({ modelValue: liveA });
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
        modelValue: parseCssColor("oklch(62% 0.42 30)"),
        plane: "oklab",
      },
    });
    await flushPromises();

    const plane = wrapper.get('[data-picker-plane][data-plane-id="oklab"]');
    expect(plane.find('[data-marker-role="neutral-origin"]').exists()).toBe(false);
    expect(plane.get('[data-marker-role="active-color"]').attributes("aria-label")).toBe(
      "Selected color",
    );
    expect(
      plane.get('[data-marker-role="srgb-boundary-projection"]').attributes("aria-label"),
    ).toBe("sRGB boundary projection");

    const boundaryHits = plane.findAll("[data-gamut-boundary-hit]");
    expect(boundaryHits.map((hit) => hit.attributes("aria-label"))).toEqual([
      "Display P3 gamut boundary",
      "sRGB gamut boundary",
      "OKLab editable domain, not a gamut boundary",
    ]);

    const p3BoundaryHit = plane.get('[data-gamut-boundary-hit="display-p3"]');
    expect(p3BoundaryHit.attributes("tabindex")).toBeUndefined();
    expect(p3BoundaryHit.attributes("role")).toBeUndefined();
    expect(plane.find("[data-guide-control]").exists()).toBe(false);

    const surface = plane.get("[data-render-color-space]");
    expect(surface.attributes("aria-label")).not.toContain("Right-click");
    await wrapper.setProps({ showSrgbBoundary: false });
    await flushPromises();

    expect(plane.find('[data-gamut-boundary="srgb"]').exists()).toBe(false);
    expect(plane.find('[data-gamut-boundary-hit="srgb"]').exists()).toBe(false);
    expect(plane.get('[data-gamut-boundary="display-p3"]').exists()).toBe(true);
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
    const boundaryProjection = wrapper.get('[data-marker-role="srgb-boundary-projection"]');
    expect(boundaryProjection.attributes("style")).toContain(
      active.attributes("style").match(/left: [^;]+/)![0],
    );
    expect(wrapper.get(".plane-instrument__projection-readout").text()).toContain(
      "boundary projection overlaps active",
    );

    wrapper.unmount();
  });
});
