import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import GamutWarningGlyph from "../src/components/GamutWarningGlyph.vue";
import { PICKER_WARNING_GLYPH_SIZE } from "../src/components/planeInstrumentStyle";

describe("instrument interaction affordances", () => {
  it("renders the warning as the configured decorative diamond status badge", () => {
    const wrapper = mount(GamutWarningGlyph);
    const svg = wrapper.get("[data-gamut-warning-glyph]");

    expect(svg.attributes("width")).toBe(String(PICKER_WARNING_GLYPH_SIZE));
    expect(svg.attributes("height")).toBe(String(PICKER_WARNING_GLYPH_SIZE));
    expect(svg.attributes("viewBox")).toBe("0 0 16 16");
    expect(svg.attributes("aria-hidden")).toBe("true");
    expect(svg.attributes("focusable")).toBe("false");
    wrapper.unmount();
  });
});
