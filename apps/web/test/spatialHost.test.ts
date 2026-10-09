import { mount } from "@vue/test-utils";
import { createSSRApp } from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, expect, it, vi } from "vitest";
import SpatialApp from "../src/spatial/spatialApp.vue";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  controller: { resize: vi.fn(), setVisible: vi.fn(), dispose: vi.fn(), update: vi.fn() },
}));
vi.mock("../src/spatial/spatialScene", () => ({ createSpatialScene: mocks.create }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it("server-renders the experiment without allocating a renderer", async () => {
  const html = await renderToString(createSSRApp(SpatialApp));
  expect(html).toContain("Orthographic gamut scene");
  expect(mocks.create).not.toHaveBeenCalled();
});

it("measures the canvas content, updates on resize, and disposes on unmount", async () => {
  mocks.create.mockReturnValue(mocks.controller);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
    return new DOMRect(
      0,
      0,
      this instanceof HTMLCanvasElement ? 898 : 900,
      this instanceof HTMLCanvasElement ? 698 : 700,
    );
  });
  const wrapper = mount(SpatialApp);
  expect(mocks.controller.resize).toHaveBeenLastCalledWith(898, 698, window.devicePixelRatio);
  const before = mocks.controller.resize.mock.calls.length;
  window.dispatchEvent(new Event("resize"));
  expect(mocks.controller.resize.mock.calls.length).toBeGreaterThan(before);
  wrapper.unmount();
  expect(mocks.controller.dispose).toHaveBeenCalledTimes(1);
  const after = mocks.controller.resize.mock.calls.length;
  window.dispatchEvent(new Event("resize"));
  expect(mocks.controller.resize.mock.calls.length).toBe(after);
});
