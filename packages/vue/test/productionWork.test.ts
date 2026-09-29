import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, vi } from "vitest";
import GamutPlane from "../src/components/GamutPlane.vue";
import { productionWorkContract } from "../../react/test/productionWorkContract.js";
import { generalizedWorkContract } from "../../react/test/generalizedWorkContract.js";
import { installAnimationFrameController } from "./interactionHelpers.js";

vi.mock("@gamut-plane/core", { spy: true });
vi.mock("@gamut-plane/core/internal/capabilities", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@gamut-plane/core/internal/capabilities")>();
  return {
    ...actual,
    analyzeRequestedGamuts: vi.fn(actual.analyzeRequestedGamuts),
    geometryDefinitions: {
      "oklch-lc-rectangle": {
        ...actual.geometryDefinitions["oklch-lc-rectangle"],
        project: vi.fn(actual.geometryDefinitions["oklch-lc-rectangle"].project),
      },
      "oklab-ab-disc": {
        ...actual.geometryDefinitions["oklab-ab-disc"],
        project: vi.fn(actual.geometryDefinitions["oklab-ab-disc"].project),
      },
    },
  };
});
vi.mock("@gamut-plane/render", { spy: true });
vi.mock("@gamut-plane/render/internal/capabilities", { spy: true });
vi.mock("@gamut-plane/render/internal/current", { spy: true });
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

productionWorkContract(async ({ value, view, ...props }) => {
  const clock = installAnimationFrameController();
  const host = mount(GamutPlane, {
    props: { modelValue: value, plane: view, ...props },
    attachTo: document.body,
  });
  await flushPromises();
  return {
    element: host.element,
    flush: async () => {
      clock.flush();
      await flushPromises();
    },
    dispose: async () => {
      host.unmount();
      await flushPromises();
    },
  };
});

generalizedWorkContract(async (value, state) => {
  const host = mount(GamutPlane, {
    props: { modelValue: value, state },
    attachTo: document.body,
  });
  await flushPromises();
  return {
    element: host.element,
    dispose: async () => {
      host.unmount();
      await flushPromises();
    },
  };
});
