import { vi } from "vitest";
import { GamutPlane } from "../src/index.js";
import { productionWorkContract } from "./productionWorkContract.js";
import { frames, mount } from "./helpers.js";

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

productionWorkContract(async (input) => {
  const clock = frames();
  const host = await mount(<GamutPlane {...input} onValueChange={vi.fn()} />);
  return { element: host.element, flush: clock.flush, dispose: host.unmount };
});
