import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createColorValue } from "@gamut-plane/core";
import { GamutPlane } from "@gamut-plane/vue";

import App from "@/App.vue";

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("standalone application", () => {
  it.each(["native", "legacy"])(
    "reports %s clipboard failure without claiming success",
    async (method) => {
      const original = navigator.clipboard;
      if (method === "native")
        vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("Denied"));
      else {
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
        vi.mocked(document.execCommand).mockReturnValueOnce(false);
      }
      const wrapper = mount(App, { attachTo: document.body });
      await flushPromises();
      const button = wrapper.get('[data-copy-representation="oklch"]');
      await button.trigger("click");
      await flushPromises();
      expect(wrapper.get('[role="status"]').text()).toContain("Could not copy OKLCH");
      expect(button.text()).toBe("Copy");
      expect(document.querySelector("textarea")).toBeNull();
      wrapper.unmount();
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: original });
    },
  );
  it("presents one compact instrument with sampled boundaries and truthful capability copy", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.get("h1").text()).toBe("Gamut Plane");
    expect(wrapper.get('[data-canvas-capability="srgb"]').text()).toBe("sRGB");
    expect(wrapper.findAll("[data-gamut-boundary]")).toHaveLength(2);
    expect(wrapper.get('[data-plane-id="oklch"]').exists()).toBe(true);
    expect(wrapper.get(".project-header").attributes("aria-describedby")).toBe(
      "project-description",
    );
    expect(wrapper.get("#project-description").text()).toContain("Pick a color in OKLCH");
    expect(wrapper.get(".output-demo h2").text()).toBe("Output examples");
    expect(
      wrapper
        .findAll("[data-gp-part='representation-control'] [role='option']")
        .map((option) => option.attributes("data-value")),
    ).toEqual(["oklch", "oklab", "srgb", "display-p3"]);
    expect(wrapper.get("[data-gp-part='exact-results']").text()).toContain("Gamuts");
    expect(wrapper.findAll("[data-gp-part='exact-result']")).toHaveLength(2);
    expect(
      wrapper
        .findAll("[data-css-representation]")
        .map((representation) => representation.attributes("data-css-representation")),
    ).toEqual(["oklch", "hex", "srgb", "display-p3"]);
    wrapper.unmount();
  });

  it("accepts generalized selection, checks and guides without changing the selected color", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    const originalOklch = wrapper.get('[data-css-representation="oklch"] code').text();

    await wrapper.get('[role="combobox"]').trigger("click");
    await wrapper.get('[role="option"][data-value="srgb"]').trigger("click");
    expect(wrapper.find("[data-picker-plane]").exists()).toBe(false);
    expect(wrapper.get("[data-gp-part='inspection-readout']").text()).toContain("Red (R)");
    expect(wrapper.get('[data-css-representation="oklch"] code').text()).toBe(originalOklch);
    await wrapper.get("[data-gp-part='gamut-disclosure'] summary").trigger("click");
    await wrapper.get('[aria-label="Display P3 Status"]').setValue(false);
    expect(wrapper.findAll("[data-gp-part='exact-result']")).toHaveLength(1);
    await wrapper.get('[aria-label="sRGB Boundary"]').setValue(false);
    await wrapper.get('[aria-label="sRGB Boundary"]').setValue(true);
    expect(wrapper.find("[data-gamut-boundary='srgb']").exists()).toBe(false);
    await wrapper.get('[role="combobox"]').trigger("click");
    await wrapper.get('[role="option"][data-value="oklab"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-plane-id="oklab"]').exists()).toBe(true);
    expect(wrapper.get(".output-demo").attributes("aria-labelledby")).toBe("output-demo-title");
    expect(wrapper.get("#output-demo-title").text()).toBe("Output examples");
    expect(wrapper.find("[data-gp-part='coordinate-readout']").exists()).toBe(false);
    expect(wrapper.findAll("[data-gp-part='channel-symbol']").map((node) => node.text())).toEqual([
      "L",
      "a",
      "b",
    ]);
    expect(wrapper.find('[data-gamut-boundary="srgb"]').exists()).toBe(true);
    expect(wrapper.get('[data-css-representation="oklch"] code').text()).toBe(originalOklch);

    wrapper.unmount();
  });

  it("copies the labeled OKLCH representation and announces the exact value", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    const copyButton = wrapper.get('[data-copy-representation="oklch"]');
    expect(copyButton.attributes("aria-label")).toBe("Copy OKLCH CSS value");
    await copyButton.trigger("click");
    await flushPromises();

    const nativeCopyCalls = vi.mocked(navigator.clipboard.writeText).mock.calls.length;
    const legacyCopyCalls = vi.mocked(document.execCommand).mock.calls.length;
    expect(nativeCopyCalls + legacyCopyCalls).toBe(1);
    expect(wrapper.get('[role="status"]').text()).toMatch(/^Copied OKLCH: oklch\(/);
    expect(copyButton.text()).toBe("Copied");
    expect(copyButton.attributes("data-copied")).toBe("true");
    expect(copyButton.attributes("aria-label")).toBe("Copied OKLCH CSS value");

    wrapper.unmount();
  });

  it("displays bounded P3 precision while copying the full output value", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    const representation = wrapper.get('[data-css-representation="display-p3"]');
    const displayed = representation.get("code").text();
    expect(displayed).toBe("color(display-p3 0.316504 0.597325 0.983548)");

    const copyButton = representation.get('[data-copy-representation="display-p3"]');
    await copyButton.trigger("click");
    await flushPromises();

    const announcement = wrapper.get('[role="status"]').text();
    const copiedValue = announcement.replace("Copied Display P3: ", "");
    expect(copiedValue).toMatch(
      /^color\(display-p3 0\.31650380404936257 0\.5973245576847196 0\.9835484146109986 \/ 1\)$/,
    );
    expect(copiedValue).not.toBe(displayed);
    expect(announcement).toContain(copiedValue);

    wrapper.unmount();
  });

  it("uses one value/status slot per row and concise unavailable output without clipping", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    const outputRow = (name: "oklch" | "hex" | "srgb" | "display-p3") =>
      wrapper.get(`[data-css-representation="${name}"]`);

    for (const representation of wrapper.findAll("[data-css-representation]")) {
      expect(representation.findAll(".css-representation__value")).toHaveLength(1);
      expect(representation.findAll(".css-representation__swatch")).toHaveLength(1);
    }
    const originalColor = outputRow("oklch").get("code").text();
    const hex = outputRow("hex");
    const srgb = outputRow("srgb");
    const hexSwatch = hex.get(".css-representation__swatch");
    expect(hexSwatch.attributes("data-preview-kind")).toBe("boundary");
    expect(hexSwatch.attributes("style")).toContain("color(srgb ");
    expect(srgb.get(".css-representation__swatch").attributes("style")).toBe(
      hexSwatch.attributes("style"),
    );
    expect(hexSwatch.attributes("aria-label")).toBe("sRGB boundary color preview");
    expect(outputRow("oklch").get("code").text()).toBe(originalColor);
    for (const row of [hex, srgb]) {
      expect(row.attributes("data-output-error")).toBe("out-of-gamut");
      expect(row.get(".css-representation__value").text()).toContain("Unavailable");
      expect(row.get("button").attributes("disabled")).toBeDefined();
    }
    expect(srgb.get("button").attributes("aria-describedby")).toBe("srgb-copy-reason");
    expect(wrapper.get("#srgb-copy-reason").exists()).toBe(true);

    await srgb.get("button").trigger("click");
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(document.execCommand).not.toHaveBeenCalled();

    await wrapper.get('[data-picker-control="c"] input[type="number"]').setValue("0.52");
    await flushPromises();
    const p3 = outputRow("display-p3");
    const p3Swatch = p3.get(".css-representation__swatch");
    expect(p3Swatch.attributes("data-preview-kind")).toBe("boundary");
    expect(p3Swatch.attributes("style")).toContain("color(display-p3 ");
    expect(p3Swatch.attributes("aria-label")).toBe("Display P3 boundary color preview");
    expect(p3.attributes("data-output-error")).toBe("out-of-gamut");
    expect(p3.get("button").attributes("disabled")).toBeDefined();
    expect(p3.get("button").attributes("aria-describedby")).toBe("display-p3-copy-reason");
    expect(outputRow("oklch").get("code").text()).toContain("0.52");

    await wrapper.get('[data-picker-control="c"] input[type="number"]').setValue("0");
    await flushPromises();
    expect(hex.get("code").text()).toMatch(/^#[0-9A-F]{6}$/);
    expect(srgb.get("code").text()).toMatch(/^color\(srgb /);
    expect(hex.get("button").attributes("disabled")).toBeUndefined();
    const normalizedPreview = document.createElement("span");
    normalizedPreview.style.backgroundColor = hex.get("code").text();
    expect(hexSwatch.attributes("style")).toContain(normalizedPreview.style.backgroundColor);
    expect(srgb.get(".css-representation__swatch").attributes("data-preview-kind")).toBe("output");
    expect(p3Swatch.attributes("data-preview-kind")).toBe("output");
    expect(wrapper.find("#srgb-copy-reason").exists()).toBe(false);

    wrapper.unmount();
  });

  it("shows exact tolerance status while strict output stays unavailable", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    const fringe = createColorValue({
      space: "srgb",
      channels: [-1e-10, 0.5, 0.5],
      alpha: 1,
    });
    if (!fringe.ok) throw new Error("Invalid tolerance fixture");
    wrapper.findComponent(GamutPlane).vm.$emit("update:modelValue", fringe.value);
    await flushPromises();

    const status = wrapper.get('[data-gp-part="exact-result"][data-gp-gamut="srgb-gamut"]');
    expect(status.attributes("data-gp-status")).toBe("within-tolerance");
    expect(status.text()).toBe("Within tolerance");
    expect(wrapper.find('[data-gamut-warning="planar"]').exists()).toBe(false);
    for (const name of ["hex", "srgb"] as const) {
      const row = wrapper.get(`[data-css-representation="${name}"]`);
      expect(row.attributes("data-output-error")).toBe("boundary-tolerance");
      expect(row.get(".css-representation__value").text()).toContain("Unavailable");
      expect(row.get("button").attributes("disabled")).toBeDefined();
      expect(row.get(".css-representation__swatch").attributes("data-preview-kind")).toBe(
        "boundary",
      );
    }
    expect(wrapper.get("#srgb-copy-reason").exists()).toBe(true);
    const p3Status = wrapper.get('[data-gp-part="exact-result"][data-gp-gamut="display-p3-gamut"]');
    expect(p3Status.attributes("data-gp-status")).toBe("inside");
    expect(p3Status.text()).toBe("Inside");
    wrapper.unmount();
  });
});
