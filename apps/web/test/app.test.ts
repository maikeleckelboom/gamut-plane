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
    expect(wrapper.findAll("[data-gamut-boundary]")).toHaveLength(2);
    expect(wrapper.get('[data-plane-id="oklch"]').exists()).toBe(true);

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

    const button = wrapper.get("button");
    const copyButton = wrapper
      .findAll("button")
      .find((candidate) => candidate.text() === "Copy OKLCH");
    expect(copyButton).toBeDefined();
    expect(button.exists()).toBe(true);
    await copyButton!.trigger("click");
    await flushPromises();

    const nativeCopyCalls = vi.mocked(navigator.clipboard.writeText).mock.calls.length;
    const legacyCopyCalls = vi.mocked(document.execCommand).mock.calls.length;
    expect(nativeCopyCalls + legacyCopyCalls).toBe(1);
    expect(wrapper.get('[role="status"]').text()).toMatch(/^Copied OKLCH: oklch\(/);

    wrapper.unmount();
  });
});
