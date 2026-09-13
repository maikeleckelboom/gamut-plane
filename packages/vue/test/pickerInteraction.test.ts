import { installAnimationFrameController, dispatchPointer } from "./interactionHelpers";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OKLAB_AB_PLANE,
  OKLCH_LIGHTNESS_CHROMA_PLANE,
  OKLCH_PICKER_MAX_CHROMA,
  getCachedGamutBoundaryTable,
  getPickerGamutStatus,
  type OklchColor,
  type PickerGamutBoundaryTables,
} from "@gamut-plane/core";
import ColorPlane from "../src/components/ColorPlane.vue";
import {
  PICKER_ACTIVE_MARKER_RADIUS,
  PICKER_WARNING_GLYPH_SIZE,
  PICKER_WARNING_MARKER_CLEARANCE,
  PICKER_WARNING_PREFERRED_OFFSET,
  PICKER_WARNING_SURFACE_INSET,
} from "@gamut-plane/render";
import { placePlanarWarning } from "@gamut-plane/render";

const TABLE_OPTIONS = { hueSteps: 6, lightnessSteps: 5, searchIterations: 6 } as const;
const tables: PickerGamutBoundaryTables = {
  srgb: getCachedGamutBoundaryTable("srgb", TABLE_OPTIONS),
  displayP3: getCachedGamutBoundaryTable("display-p3", TABLE_OPTIONS),
};

function mockSurfaceContentBox(
  element: HTMLElement,
  {
    left,
    top,
    width,
    height,
    border = 2,
  }: { left: number; top: number; width: number; height: number; border?: number },
): void {
  const borderWidth = border * 2;
  Object.defineProperties(element, {
    clientLeft: { configurable: true, value: border },
    clientTop: { configurable: true, value: border },
    clientWidth: { configurable: true, value: width },
    clientHeight: { configurable: true, value: height },
    offsetWidth: { configurable: true, value: width + borderWidth },
    offsetHeight: { configurable: true, value: height + borderWidth },
  });
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    x: left,
    y: top,
    left,
    top,
    right: left + width + borderWidth,
    bottom: top + height + borderWidth,
    width: width + borderWidth,
    height: height + borderWidth,
    toJSON: () => ({}),
  });
}

function emittedColors(wrapper: VueWrapper): OklchColor[] {
  return (wrapper.emitted("update:modelValue") ?? []).map(([color]) => color as OklchColor);
}

function committedColors(wrapper: VueWrapper): OklchColor[] {
  return (wrapper.emitted("commit") ?? []).map(([color]) => color as OklchColor);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("ColorPlane pointer interaction", () => {
  it("coalesces rectangular drags, commits pointerup, and cancels after live movement", async () => {
    const animationFrames = installAnimationFrameController();
    const canonical: OklchColor = { l: 0.6, c: 0.12, h: 210, alpha: 1 };
    const wrapper = mount(ColorPlane, {
      attachTo: document.body,
      props: {
        modelValue: canonical,
        plane: OKLCH_LIGHTNESS_CHROMA_PLANE,
        srgbTable: tables.srgb,
        displayP3Table: tables.displayP3,
        srgbBoundaryGuideColor: null,
        warningVisible: true,
        warningLabel: "Outside primary Display P3. Canonical OKLCH is preserved.",
      },
    });
    await flushPromises();
    animationFrames.flush();

    const surface = wrapper.get("[data-picker-plane] > div").element as HTMLElement;
    const marker = wrapper.get("[data-active-marker]").element as HTMLElement;
    const warning = wrapper.get('[data-gamut-warning="planar"]').element as HTMLElement;
    mockSurfaceContentBox(surface, { left: 10, top: 20, width: 200, height: 100 });

    const capturedPointers = new Set<number>();
    const setPointerCapture = vi.fn((pointerId: number) => capturedPointers.add(pointerId));
    const hasPointerCapture = vi.fn((pointerId: number) => capturedPointers.has(pointerId));
    const releasePointerCapture = vi.fn((pointerId: number) => capturedPointers.delete(pointerId));
    Object.defineProperties(surface, {
      setPointerCapture: { configurable: true, value: setPointerCapture },
      hasPointerCapture: { configurable: true, value: hasPointerCapture },
      releasePointerCapture: { configurable: true, value: releasePointerCapture },
    });

    const displayP3Boundary = wrapper.get('[data-gamut-boundary-hit="display-p3"]').element;
    dispatchPointer(displayP3Boundary, "pointerdown", {
      pointerId: 7,
      clientX: 72,
      clientY: 62,
    });
    const warningAtCanonical = { left: warning.style.left, top: warning.style.top };
    expect(warning.style.visibility).toBe("visible");
    expect(warning.style.display).not.toBe("none");
    dispatchPointer(surface, "pointermove", { pointerId: 7, clientX: -100, clientY: 300 });
    dispatchPointer(surface, "pointermove", { pointerId: 7, clientX: 500, clientY: -100 });

    expect(emittedColors(wrapper)).toHaveLength(0);
    expect(committedColors(wrapper)).toHaveLength(0);
    expect(marker.style.left).toBe("100%");
    expect(marker.style.top).toBe("0%");
    const edgePlacement = placePlanarWarning({
      activeCenter: { x: 200, y: 0 },
      surfaceSize: { width: 200, height: 100 },
      activeRadius: PICKER_ACTIVE_MARKER_RADIUS,
      warningSize: { width: PICKER_WARNING_GLYPH_SIZE, height: PICKER_WARNING_GLYPH_SIZE },
      preferredOffset: PICKER_WARNING_PREFERRED_OFFSET,
      surfaceInset: PICKER_WARNING_SURFACE_INSET,
      markerClearance: PICKER_WARNING_MARKER_CLEARANCE,
    });
    expect(warning.style.left).toBe(`${edgePlacement.left}px`);
    expect(warning.style.top).toBe(`${edgePlacement.top}px`);
    expect({ left: warning.style.left, top: warning.style.top }).not.toEqual(warningAtCanonical);
    animationFrames.flush();

    const [latestDrag] = emittedColors(wrapper);
    expect(emittedColors(wrapper)).toHaveLength(1);
    expect(latestDrag?.l).toBe(1);
    expect(latestDrag?.c).toBe(OKLCH_PICKER_MAX_CHROMA);
    expect(latestDrag?.h).toBe(canonical.h);
    const latestStatus = getPickerGamutStatus(latestDrag!, tables);
    expect(latestStatus.srgb.inGamut).toBe(false);
    expect(latestStatus.displayP3.inGamut).toBe(false);
    expect(committedColors(wrapper)).toHaveLength(0);

    dispatchPointer(surface, "pointerup", { pointerId: 7, clientX: 92, clientY: 72 });

    const pointerUpColors = emittedColors(wrapper);
    expect(pointerUpColors).toHaveLength(2);
    expect(pointerUpColors[1]?.l).toBeCloseTo(0.5, 12);
    expect(pointerUpColors[1]?.c).toBeCloseTo(OKLCH_PICKER_MAX_CHROMA * 0.4, 12);
    expect(committedColors(wrapper)).toEqual([pointerUpColors[1]]);
    expect(releasePointerCapture).toHaveBeenCalledWith(7);

    dispatchPointer(surface, "pointerdown", { pointerId: 8, clientX: 72, clientY: 62 });
    dispatchPointer(surface, "pointermove", { pointerId: 8, clientX: 212, clientY: 122 });
    expect(marker.style.left).toBe("100%");
    expect(marker.style.top).toBe("100%");
    expect({ left: warning.style.left, top: warning.style.top }).not.toEqual(warningAtCanonical);
    animationFrames.flush();
    expect(emittedColors(wrapper)).toHaveLength(3);
    expect(wrapper.emitted("cancel")).toBeUndefined();

    dispatchPointer(surface, "pointercancel", { pointerId: 8 });
    expect(marker.style.left).toBe("30%");
    expect(marker.style.top).toBe("40%");
    expect({ left: warning.style.left, top: warning.style.top }).toEqual(warningAtCanonical);
    animationFrames.flush();
    expect(emittedColors(wrapper)).toHaveLength(4);
    expect(emittedColors(wrapper).at(-1)).toEqual(canonical);
    expect(committedColors(wrapper)).toHaveLength(1);
    expect(wrapper.emitted("cancel")).toEqual([[]]);

    dispatchPointer(surface, "pointerdown", { pointerId: 9, clientX: 72, clientY: 62 });
    dispatchPointer(surface, "pointermove", { pointerId: 9, clientX: 150, clientY: 80 });
    animationFrames.flush();
    dispatchPointer(surface, "lostpointercapture", { pointerId: 9 });
    expect(emittedColors(wrapper).at(-1)).toEqual(canonical);
    expect(committedColors(wrapper)).toHaveLength(1);

    await wrapper.get("[data-render-color-space]").trigger("keydown", { key: "ArrowRight" });
    const keyboardColor = emittedColors(wrapper).at(-1)!;
    expect(keyboardColor.c).toBeCloseTo(0.125, 12);
    expect(committedColors(wrapper).at(-1)).toEqual(keyboardColor);
    await wrapper.setProps({ modelValue: keyboardColor });
    expect(marker.style.left).toBe("31.25%");
    expect(marker.style.top).toBe("40%");
    expect({ left: warning.style.left, top: warning.style.top }).not.toEqual(warningAtCanonical);

    wrapper.unmount();
  });

  it("keeps OKLab pointer live/commit scheduling, radial bounds, and keyboard commits distinct", async () => {
    const animationFrames = installAnimationFrameController();
    const canonical: OklchColor = { l: 0.6, c: 0.1, h: 0, alpha: 0.7 };
    const wrapper = mount(ColorPlane, {
      attachTo: document.body,
      props: {
        modelValue: canonical,
        plane: OKLAB_AB_PLANE,
        srgbTable: tables.srgb,
        displayP3Table: tables.displayP3,
        srgbBoundaryGuideColor: null,
        warningVisible: false,
        warningLabel: "",
      },
    });
    await flushPromises();
    animationFrames.flush();

    const surface = wrapper.get("[data-picker-plane] > div").element as HTMLElement;
    mockSurfaceContentBox(surface, { left: 10, top: 20, width: 200, height: 200 });
    const capturedPointers = new Set<number>();
    Object.defineProperties(surface, {
      setPointerCapture: {
        configurable: true,
        value: vi.fn((pointerId: number) => capturedPointers.add(pointerId)),
      },
      hasPointerCapture: {
        configurable: true,
        value: vi.fn((pointerId: number) => capturedPointers.has(pointerId)),
      },
      releasePointerCapture: {
        configurable: true,
        value: vi.fn((pointerId: number) => capturedPointers.delete(pointerId)),
      },
    });

    dispatchPointer(surface, "pointerdown", { pointerId: 31, clientX: 112, clientY: 122 });
    dispatchPointer(surface, "pointermove", { pointerId: 31, clientX: 412, clientY: 122 });
    expect(emittedColors(wrapper)).toHaveLength(0);
    animationFrames.flush();

    const radialLive = emittedColors(wrapper).at(-1)!;
    expect(radialLive.l).toBeCloseTo(0.6, 11);
    expect(radialLive.c).toBeCloseTo(0.4, 11);
    expect(radialLive.h).toBeCloseTo(0, 9);
    expect(radialLive.alpha).toBe(0.7);
    expect(committedColors(wrapper)).toHaveLength(0);

    dispatchPointer(surface, "pointerup", { pointerId: 31, clientX: 412, clientY: 122 });
    expect(committedColors(wrapper)).toHaveLength(1);
    expect(committedColors(wrapper)[0]).toEqual(emittedColors(wrapper).at(-1));

    dispatchPointer(surface, "pointerdown", { pointerId: 32, clientX: 112, clientY: 122 });
    dispatchPointer(surface, "pointermove", { pointerId: 32, clientX: 112, clientY: 22 });
    animationFrames.flush();
    const commitsBeforeCaptureLoss = committedColors(wrapper).length;
    dispatchPointer(surface, "lostpointercapture", { pointerId: 32 });
    expect(committedColors(wrapper)).toHaveLength(commitsBeforeCaptureLoss);
    dispatchPointer(surface, "lostpointercapture", { pointerId: 32 });
    expect(committedColors(wrapper)).toHaveLength(commitsBeforeCaptureLoss);

    const updatesBeforeKeyboard = emittedColors(wrapper).length;
    const commitsBeforeKeyboard = committedColors(wrapper).length;
    await wrapper.get("[data-render-color-space]").trigger("keydown", { key: "ArrowRight" });
    expect(emittedColors(wrapper)).toHaveLength(updatesBeforeKeyboard + 1);
    expect(committedColors(wrapper)).toHaveLength(commitsBeforeKeyboard + 1);
    expect(committedColors(wrapper).at(-1)).toEqual(emittedColors(wrapper).at(-1));

    wrapper.unmount();
  });
});
