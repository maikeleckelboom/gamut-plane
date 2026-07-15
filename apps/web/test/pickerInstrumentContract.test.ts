import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import {
  OKLAB_AB_PLANE,
  parseUserColor,
  serializeColor,
  type ChromavertColor,
  type PickerPlaneId,
} from "@chromavert/color";
import OklchLinearControl from "@/components/chromavert/OklchLinearControl.vue";
import OklchPlanarPicker from "@/components/chromavert/OklchPlanarPicker.vue";
import PickerInstrument from "@/components/chromavert/PickerInstrument.vue";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("PickerInstrument edit contract", () => {
  it("forwards linear live and committed values as complete canonical colors", async () => {
    const canonical = parseUserColor("oklch(62% 0.2 210)");
    const wrapper = mount(PickerInstrument, {
      attachTo: document.body,
      props: { modelValue: canonical },
    });
    await flushPromises();
    const hue = wrapper.get('[data-picker-control="h"] input[type="range"]');

    (hue.element as HTMLInputElement).value = "292.7";
    await hue.trigger("input");

    const live = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as ChromavertColor;
    expect(live.l).toBe(canonical.l);
    expect(live.c).toBe(canonical.c);
    expect(live.h).toBeCloseTo(292.7, 12);
    expect(live.alpha).toBe(canonical.alpha);
    expect(wrapper.emitted("commit")).toBeUndefined();

    await hue.trigger("change");

    const committed = wrapper.emitted("commit")?.at(-1)?.[0] as ChromavertColor;
    expect(committed).toEqual(live);

    wrapper.unmount();
  });

  it("forwards planar cancellation after a live color without committing it", async () => {
    const canonical = parseUserColor("oklch(62% 0.2 210)");
    const live = parseUserColor("oklch(74% 0.28 210)");
    const wrapper = mount(PickerInstrument, {
      attachTo: document.body,
      props: { modelValue: canonical },
    });
    await flushPromises();

    const plane = wrapper.getComponent(OklchPlanarPicker);
    plane.vm.$emit("update:modelValue", live);
    plane.vm.$emit("cancel");
    await flushPromises();

    expect(wrapper.emitted("update:modelValue")).toEqual([[live]]);
    expect(wrapper.emitted("cancel")).toEqual([[]]);
    expect(wrapper.emitted("commit")).toBeUndefined();

    wrapper.unmount();
  });

  it("keeps gamut status and methodology in collapsed progressive evidence", async () => {
    const wrapper = mount(PickerInstrument, {
      attachTo: document.body,
      props: { modelValue: parseUserColor("oklch(62% 0.2 210)") },
    });
    await flushPromises();

    const instrument = wrapper.get("[data-picker-instrument]");
    const title = instrument.get("#picker-instrument-title");
    expect(instrument.attributes("aria-labelledby")).toBe("picker-instrument-title");
    expect(title.classes()).toContain("sr-only");
    expect(title.text()).toBe("Planar picker instrument");
    expect(instrument.find(".picker-instrument__header").exists()).toBe(false);

    const evidence = wrapper.get("[data-picker-evidence]");
    expect(evidence.attributes("open")).toBeUndefined();
    expect(evidence.get("summary").text()).toContain("Gamut evidence");
    expect(evidence.get('[data-picker-gamut-status="display-p3"]').exists()).toBe(true);
    expect(evidence.get('[data-picker-gamut-status="srgb"]').exists()).toBe(true);
    expect(evidence.get(".picker-instrument__fallback-readout").exists()).toBe(true);
    expect(evidence.get(".picker-instrument__method").exists()).toBe(true);

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
      const wrapper = mount(PickerInstrument, {
        attachTo: document.body,
        props: { modelValue: parseUserColor("oklch(62% 0.2 210)"), plane: from },
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
      const canonical = parseUserColor(serialized);
      const canonicalSnapshot = structuredClone(canonical);
      const wrapper = mount(PickerInstrument, {
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
        .findAllComponents(OklchLinearControl)
        .find((control) => control.props("id") === "picker-oklab-lightness");
      expect(fixedControl).toBeDefined();
      expect(fixedControl!.props("gradient")).toContain(
        serializeColor(OKLAB_AB_PLANE.editFixedAxis(canonical, 0.5)),
      );

      const fixedLightness = wrapper.get('[data-picker-control="l"] input[type="range"]');
      (fixedLightness.element as HTMLInputElement).value = "0.72";
      await fixedLightness.trigger("input");

      const live = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as ChromavertColor;
      expect(live.l).toBeCloseTo(0.72, 11);
      expect(live.c).toBeCloseTo(canonical.c, 12);
      expect(live.h).toBeCloseTo(canonical.h, 12);
      expect(live.alpha).toBe(canonical.alpha);
      expect(wrapper.emitted("commit")).toBeUndefined();

      await fixedLightness.trigger("change");
      const committed = wrapper.emitted("commit")?.at(-1)?.[0] as ChromavertColor;
      expect(committed.l).toBeCloseTo(live.l, 12);
      expect(committed.c).toBeCloseTo(live.c, 12);
      expect(committed.h).toBeCloseTo(live.h, 12);
      expect(committed.alpha).toBe(live.alpha);

      wrapper.unmount();
    },
  );

  it("edits bounded OKLab a and b values through the plane unprojection contract", async () => {
    const canonical = parseUserColor("oklch(62% 0.2 45 / 0.7)");
    const canonicalSnapshot = structuredClone(canonical);
    const wrapper = mount(PickerInstrument, {
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

    const liveA = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as ChromavertColor;
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

    const liveB = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as ChromavertColor;
    const committedB = wrapper.emitted("commit")?.at(-1)?.[0] as ChromavertColor;
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
    const wrapper = mount(PickerInstrument, {
      attachTo: document.body,
      props: { modelValue: parseUserColor(`oklch(50% 0.5 ${hue})`) },
    });
    await flushPromises();

    const warning = wrapper.get('[data-picker-control="h"] [data-gamut-warning="linear"]');
    expect(warning.attributes("data-visible")).toBe("true");
    expect(warning.attributes("data-warning-side")).toBe(side);

    wrapper.unmount();
  });

  it("identifies marker roles and toggles boundary guides without editing the color", async () => {
    const wrapper = mount(PickerInstrument, {
      attachTo: document.body,
      props: {
        modelValue: parseUserColor("oklch(62% 0.42 30)"),
        plane: "oklab",
      },
    });
    await flushPromises();

    const plane = wrapper.get('[data-picker-plane][data-plane-id="oklab"]');
    expect(plane.find('[data-marker-role="neutral-origin"]').exists()).toBe(false);
    expect(plane.get('[data-marker-role="active-color"]').attributes("aria-label")).toBe(
      "Active canonical color",
    );
    expect(
      plane.get('[data-marker-role="srgb-table-fallback-guide"]').attributes("aria-label"),
    ).toBe("sRGB table fallback guide");

    const boundaryHits = plane.findAll("[data-gamut-boundary-hit]");
    expect(boundaryHits.map((hit) => hit.attributes("aria-label"))).toEqual([
      "Display P3 gamut boundary",
      "sRGB gamut boundary",
      "OKLab editable domain, not a gamut boundary",
    ]);

    const p3BoundaryHit = plane.get('[data-gamut-boundary-hit="display-p3"]');
    expect(p3BoundaryHit.attributes("tabindex")).toBeUndefined();
    expect(p3BoundaryHit.attributes("role")).toBeUndefined();

    const guideControl = plane.get("[data-guide-control]");
    expect(guideControl.get("summary").text()).toBe("Guides");
    const p3GuideToggle = guideControl.get('[data-guide-toggle="display-p3"]');
    const srgbGuideToggle = guideControl.get('[data-guide-toggle="srgb"]');
    const domainGuideToggle = guideControl.get('[data-guide-toggle="instrument-domain"]');
    const neutralGuideToggle = guideControl.get('[data-guide-toggle="neutral-origin"]');
    expect((p3GuideToggle.element as HTMLInputElement).checked).toBe(true);
    expect((srgbGuideToggle.element as HTMLInputElement).checked).toBe(true);
    expect((domainGuideToggle.element as HTMLInputElement).checked).toBe(true);
    expect((neutralGuideToggle.element as HTMLInputElement).checked).toBe(false);

    await neutralGuideToggle.setValue(true);
    expect(plane.get('[data-marker-role="neutral-origin"]').attributes("aria-label")).toBe(
      "Neutral origin, a 0, b 0",
    );

    await srgbGuideToggle.setValue(false);
    expect(plane.find('[data-gamut-boundary="srgb"]').exists()).toBe(false);
    expect(plane.find('[data-gamut-boundary-hit="srgb"]').exists()).toBe(false);
    expect(plane.get('[data-gamut-boundary="display-p3"]').exists()).toBe(true);

    const surface = plane.get("[data-render-color-space]");
    await surface.trigger("contextmenu", { button: 2, clientX: 120, clientY: 160 });
    await flushPromises();

    const menu = document.body.querySelector('[data-slot="context-menu-content"]');
    expect(menu?.textContent).toContain("Boundary visibility");
    expect(menu?.textContent).toContain("Display P3 gamut");
    expect(menu?.textContent).toContain("sRGB gamut");
    expect(menu?.textContent).toContain("OKLab editable domain");
    expect(menu?.textContent).toContain("Neutral origin");

    const srgbToggle = document.body.querySelector('[data-boundary-toggle="srgb"]') as HTMLElement;
    srgbToggle.click();
    await flushPromises();

    expect(plane.get('[data-gamut-boundary="srgb"]').exists()).toBe(true);
    expect(plane.get('[data-gamut-boundary-hit="srgb"]').exists()).toBe(true);
    expect(plane.get('[data-gamut-boundary="display-p3"]').exists()).toBe(true);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.emitted("commit")).toBeUndefined();

    wrapper.unmount();
  });

  it("never draws an interpolated fallback guide beyond the active canonical point", async () => {
    const wrapper = mount(PickerInstrument, {
      attachTo: document.body,
      props: { modelValue: parseUserColor("oklch(48% 0.225 262)"), plane: "oklch" },
    });
    await flushPromises();

    const active = wrapper.get('[data-marker-role="active-color"]');
    const fallback = wrapper.get('[data-marker-role="srgb-table-fallback-guide"]');
    expect(fallback.attributes("style")).toContain(
      active.attributes("style").match(/left: [^;]+/)![0],
    );
    expect(wrapper.get(".picker-instrument__fallback-readout").text()).toContain(
      "table fallback guide overlaps active",
    );

    wrapper.unmount();
  });
});
