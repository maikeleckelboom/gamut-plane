import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "@/App.vue";

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = "";
});

describe("standalone application", () => {
  it("presents one neutral instrument surface with exact facts and truthful capability copy", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    expect(wrapper.get("h1").text()).toBe("Gamut Plane");
    expect(wrapper.get('[data-canvas-capability="srgb"]').text()).toContain(
      "P3-only field colors may clip",
    );
    expect(wrapper.findAll("[data-exact-gamut-status]")).toHaveLength(2);
    expect(wrapper.findAll("[data-picker-gamut-status]")).toHaveLength(0);
    expect(wrapper.findAll("[data-gamut-boundary]")).toHaveLength(2);
    expect(wrapper.get('[data-plane-id="oklch"]').exists()).toBe(true);
    expect(wrapper.get(".project-header").attributes("aria-describedby")).toBe(
      "project-description",
    );
    expect(wrapper.get("#project-description").text()).toContain("Interactive OKLab and OKLCH");
    expect(wrapper.text().match(/Membership uses exact linear-light conversion/g)).toHaveLength(1);
    expect(wrapper.text()).not.toContain("Gamut evidence");
    expect(wrapper.text()).not.toContain("Thresholds follow current");
    expect(wrapper.text()).not.toContain("Thresholds show current");

    const visibleCopy = wrapper.text().toLowerCase();
    for (const forbidden of ["project source", "proof", "repair", "delivery", "tokens"]) {
      expect(visibleCopy).not.toContain(forbidden);
    }

    wrapper.unmount();
  });

  it("controls plane and boundary view state without changing the selected color", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    const originalOklch = wrapper.get(".channel-values").text();

    const srgbToggle = wrapper.get('[data-boundary-toggle="srgb"]');
    const field = wrapper.get(".plane-instrument__field");
    expect(field.get("[data-boundary-legend]").exists()).toBe(true);
    await srgbToggle.setValue(false);
    expect(wrapper.find('[data-gamut-boundary="srgb"]').exists()).toBe(false);
    expect(wrapper.get(".channel-values").text()).toBe(originalOklch);

    await wrapper.get('[data-plane-option="oklab"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-plane-id="oklab"]').exists()).toBe(true);
    expect(wrapper.get(".channel-values").attributes("aria-label")).toBe("OKLab channels");
    expect(wrapper.find('[data-gamut-boundary="srgb"]').exists()).toBe(false);

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

  it("displays bounded P3 precision while copying the canonical value", async () => {
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
      /^color\(display-p3 0\.31650380404936257 0\.5973245576847196 0\.9835484146109986\)$/,
    );
    expect(copiedValue).not.toBe(displayed);
    expect(announcement).toContain(copiedValue);

    wrapper.unmount();
  });

  it("uses real disabled semantics and a visible reason for unavailable sRGB copy", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    const representation = wrapper.get('[data-css-representation="srgb"]');
    const copyButton = representation.get('[data-copy-representation="srgb"]');
    expect(copyButton.attributes("disabled")).toBeDefined();
    expect(copyButton.attributes("aria-describedby")).toBe("srgb-copy-reason");
    expect(representation.get("#srgb-copy-reason").text()).toBe(
      "Outside sRGB. No clipped value emitted.",
    );

    await copyButton.trigger("click");
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(document.execCommand).not.toHaveBeenCalled();

    wrapper.unmount();
  });
});
