import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";

import {
  OKLAB_AB_PLANE,
  parseUserColor,
  serializeColor,
  type ChromavertColor,
} from "@chromavert/color";
import OklchLinearControl from "@/components/chromavert/OklchLinearControl.vue";
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
    expect(plane.get('[data-marker-role="srgb-fallback"]').attributes("aria-label")).toBe(
      "Derived sRGB fallback",
    );

    const boundaryHits = plane.findAll("[data-gamut-boundary-hit]");
    expect(boundaryHits.map((hit) => hit.attributes("aria-label"))).toEqual([
      "Display P3 gamut boundary",
      "sRGB gamut boundary",
      "OKLab editable domain, not a gamut boundary",
    ]);

    const p3BoundaryHit = plane.get('[data-gamut-boundary-hit="display-p3"]');
    expect(p3BoundaryHit.attributes("tabindex")).toBeUndefined();
    expect(p3BoundaryHit.attributes("role")).toBeUndefined();

    const surface = plane.get("[data-render-color-space]");
    await surface.trigger("contextmenu", { button: 2, clientX: 120, clientY: 160 });
    await flushPromises();

    const menu = document.body.querySelector('[data-slot="context-menu-content"]');
    expect(menu?.textContent).toContain("Boundary visibility");
    expect(menu?.textContent).toContain("Display P3 gamut");
    expect(menu?.textContent).toContain("sRGB gamut");
    expect(menu?.textContent).toContain("OKLab editable domain");
    expect(menu?.textContent).toContain("Neutral origin");

    const neutralToggle = document.body.querySelector(
      '[data-boundary-toggle="neutral-origin"]',
    ) as HTMLElement;
    neutralToggle.click();
    await flushPromises();
    expect(plane.get('[data-marker-role="neutral-origin"]').attributes("aria-label")).toBe(
      "Neutral origin, a 0, b 0",
    );

    await surface.trigger("contextmenu", { button: 2, clientX: 120, clientY: 160 });
    await flushPromises();

    const srgbToggle = document.body.querySelector('[data-boundary-toggle="srgb"]') as HTMLElement;
    srgbToggle.click();
    await flushPromises();

    expect(plane.find('[data-gamut-boundary="srgb"]').exists()).toBe(false);
    expect(plane.find('[data-gamut-boundary-hit="srgb"]').exists()).toBe(false);
    expect(plane.get('[data-gamut-boundary="display-p3"]').exists()).toBe(true);
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.emitted("commit")).toBeUndefined();

    wrapper.unmount();
  });
});
