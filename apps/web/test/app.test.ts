import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

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
    expect(
      wrapper
        .findAll("[data-boundary-target-option]")
        .map((option) => option.attributes("data-boundary-target-option")),
    ).toEqual(["srgb", "display-p3"]);
    expect(
      wrapper
        .findAll("[data-boundary-toggle]")
        .map((option) => option.attributes("data-boundary-toggle")),
    ).toEqual(["srgb", "display-p3"]);
    expect(
      wrapper
        .findAll("[data-exact-gamut-status]")
        .map((status) => status.attributes("data-exact-gamut-status")),
    ).toEqual(["srgb", "display-p3"]);
    expect(
      wrapper
        .findAll("[data-boundary-guide]")
        .map((guide) => guide.attributes("data-boundary-guide")),
    ).toEqual(["srgb", "display-p3"]);
    expect(
      wrapper
        .findAll("[data-css-representation]")
        .map((representation) => representation.attributes("data-css-representation")),
    ).toEqual(["oklch", "hex", "srgb", "display-p3"]);
    wrapper.unmount();
  });

  it("controls plane and boundary view state without changing the selected color", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    const originalOklch = wrapper.get(".channel-values").text();

    const srgbToggle = wrapper.get('[data-boundary-toggle="srgb"]');
    const field = wrapper.get(".plane-instrument__field");
    expect(field.get("[data-gamut-reference]").exists()).toBe(true);
    expect(wrapper.get("[data-boundary-target-result]").attributes("data-boundary-target")).toBe(
      "srgb",
    );
    await srgbToggle.setValue(false);
    expect(wrapper.find('[data-gamut-boundary="srgb"]').exists()).toBe(false);
    expect(wrapper.get("[data-boundary-target-result]").attributes("data-boundary-target")).toBe(
      "srgb",
    );
    expect(wrapper.get(".channel-values").text()).toBe(originalOklch);

    await wrapper.get('[data-boundary-target-option="display-p3"]').setValue(true);
    await flushPromises();
    expect(wrapper.get("[data-boundary-target-result]").attributes("data-boundary-target")).toBe(
      "display-p3",
    );
    expect(wrapper.get("[data-boundary-target-result]").text()).toContain("Target · Display P3");
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

  it("uses one value/status slot per row and concise unavailable output without clipping", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();

    for (const representation of wrapper.findAll("[data-css-representation]")) {
      expect(representation.findAll(".css-representation__value")).toHaveLength(1);
    }
    expect(wrapper.get('[data-css-representation="oklch"] code').text()).toMatch(/^oklch\(/);
    expect(wrapper.get('[data-css-representation="display-p3"] code').text()).toMatch(
      /^color\(display-p3 /,
    );
    expect(wrapper.get('[data-css-representation="hex"] .css-representation__value').text()).toBe(
      "Unavailable · outside sRGB",
    );
    const representation = wrapper.get('[data-css-representation="srgb"]');
    const copyButton = representation.get('[data-copy-representation="srgb"]');
    expect(copyButton.attributes("disabled")).toBeDefined();
    expect(copyButton.attributes("aria-describedby")).toBe("srgb-copy-reason");
    expect(wrapper.get('[data-copy-representation="hex"]').attributes("disabled")).toBeDefined();
    expect(wrapper.get('[data-copy-representation="hex"]').attributes("aria-describedby")).toBe(
      "srgb-copy-reason",
    );
    expect(representation.get(".css-representation__value").text()).toBe(
      "Unavailable · outside sRGB",
    );
    expect(wrapper.get("#srgb-copy-reason").text()).toBe(
      "Selected color is outside sRGB; no clipped Hex or sRGB value is emitted.",
    );
    expect(wrapper.findAll("#srgb-copy-reason")).toHaveLength(1);
    expect(representation.find(".css-representation__value p").exists()).toBe(false);

    await copyButton.trigger("click");
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(document.execCommand).not.toHaveBeenCalled();

    await wrapper.get('[data-picker-control="c"] input[type="number"]').setValue("0.52");
    await flushPromises();
    expect(
      wrapper.get('[data-css-representation="display-p3"] .css-representation__value').text(),
    ).toBe("Unavailable · outside Display P3");
    expect(
      wrapper.get('[data-copy-representation="display-p3"]').attributes("disabled"),
    ).toBeDefined();
    expect(wrapper.get("#display-p3-copy-reason").text()).toBe(
      "Selected color is outside Display P3; no clipped value is emitted.",
    );

    await wrapper.get('[data-picker-control="c"] input[type="number"]').setValue("0");
    await flushPromises();
    expect(wrapper.get('[data-css-representation="hex"] code').text()).toMatch(/^#[0-9A-F]{6}$/);
    expect(wrapper.get('[data-css-representation="srgb"] code').text()).toMatch(/^rgb\(/);
    expect(wrapper.get('[data-copy-representation="hex"]').attributes("disabled")).toBeUndefined();
    expect(wrapper.find("#srgb-copy-reason").exists()).toBe(false);

    wrapper.unmount();
  });
});
