import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import GamutWarningGlyph from "@/components/GamutWarningGlyph.vue";
import { PICKER_WARNING_GLYPH_SIZE } from "@/components/planeInstrumentStyle";

const appStyles = readFileSync(resolve(process.cwd(), "src/app.css"), "utf8");
const warningGlyphSource = readFileSync(
  resolve(process.cwd(), "src/components/GamutWarningGlyph.vue"),
  "utf8",
);

describe("instrument interaction affordances", () => {
  it("renders the warning as the configured decorative diamond status badge", () => {
    const wrapper = mount(GamutWarningGlyph);
    const svg = wrapper.get("[data-gamut-warning-glyph]");
    const paths = svg.findAll("path");

    expect(svg.attributes("width")).toBe(String(PICKER_WARNING_GLYPH_SIZE));
    expect(svg.attributes("height")).toBe(String(PICKER_WARNING_GLYPH_SIZE));
    expect(svg.attributes("viewBox")).toBe("0 0 16 16");
    expect(svg.attributes("aria-hidden")).toBe("true");
    expect(svg.attributes("focusable")).toBe("false");
    expect(paths).toHaveLength(2);
    expect(paths[0]?.attributes("d")).toBe("M8 1.75 14.25 8 8 14.25 1.75 8Z");
    expect(paths[1]?.attributes("d")).toBe("M8 5.15v4.15m0 2.15v.05");
    expect(warningGlyphSource).not.toContain("M8 1.7 14.2 14H1.8L8 1.7Z");
    expect(warningGlyphSource).not.toMatch(/\.gamut-warning-glyph path \{[^}]*fill:/);
    expect(warningGlyphSource).toContain("fill: oklch(0.08 0 0 / 0.96)");
    expect(warningGlyphSource).toContain("stroke: var(--status-outside)");

    wrapper.unmount();
  });

  it("uses pointer, grab, and grabbing cursors without a resize cursor", () => {
    expect(appStyles).not.toContain("cursor: ew-resize");
    expect(appStyles).toMatch(/\.channel-control__range \{[\s\S]*?cursor: pointer;/);
    expect(appStyles).toMatch(
      /\.channel-control__range::-webkit-slider-thumb \{[\s\S]*?cursor: grab;/,
    );
    expect(appStyles).toMatch(/\.channel-control__range::-moz-range-thumb \{[\s\S]*?cursor: grab;/);
    expect(appStyles).toMatch(/\.channel-control__range:active[\s\S]*?cursor: grabbing;/);
  });
});
