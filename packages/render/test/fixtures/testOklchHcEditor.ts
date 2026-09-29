import { represent, type ColorValue, type PlanePoint } from "@gamut-plane/core";
import type { EditorContract, GeometryContract } from "@gamut-plane/core/internal/capabilities";

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const toPoint = (hue: number, chroma: number): PlanePoint => ({
  x: clamp(hue / 360),
  y: 1 - clamp(chroma / 0.4),
});
const fromPoint = (point: PlanePoint) => ({ hue: point.x * 360, chroma: (1 - point.y) * 0.4 });

/** Test-only second OKLCH editor: H/C axes and fixed L, never registered for production. */
export const testOklchHcGeometry = {
  id: "test-oklch-hc-rectangle",
  representationId: "oklch",
  x: "oklch.h",
  y: "oklch.c",
  fixed: "oklch.l",
  xDirection: "increasing",
  yDirection: "decreasing",
  domain: { kind: "rectangle", hue: [0, 360], maximumChroma: 0.4 },
  toPoint,
  fromPoint,
  project(value: ColorValue) {
    const observed = represent(value, "oklch");
    if (!observed.ok) return observed;
    const [l, c, h] = observed.value.channels;
    return {
      ok: true,
      value: {
        representationId: "oklch",
        geometryId: "test-oklch-hc-rectangle",
        representation: observed.value,
        point: toPoint(h ?? 0, c),
        coordinates: { x: h, y: c, fixed: l },
        channels: { x: "oklch.h", y: "oklch.c", fixed: "oklch.l" },
      },
    } as const;
  },
  keyboard(projection, action, coarse) {
    const step = coarse ? 0.05 : 0.01;
    const point = projection.point;
    if (action === "minimum-x") return { ...point, x: 0 };
    if (action === "maximum-x") return { ...point, x: 1 };
    if (action === "increase-x") return { ...point, x: clamp(point.x + step) };
    if (action === "decrease-x") return { ...point, x: clamp(point.x - step) };
    if (action === "increase-y") return { ...point, y: clamp(point.y - step) };
    return { ...point, y: clamp(point.y + step) };
  },
  constrain(point: PlanePoint) {
    return { x: clamp(point.x), y: clamp(point.y) };
  },
  contains(point: PlanePoint) {
    return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
  },
  samplingFixed(fixed: number | null) {
    return fixed !== null && fixed >= 0 && fixed <= 1 ? fixed : null;
  },
} satisfies GeometryContract<
  "oklch",
  "test-oklch-hc-rectangle",
  "oklch.h",
  "oklch.c",
  "oklch.l",
  Readonly<{ kind: "rectangle"; hue: readonly number[]; maximumChroma: number }>,
  typeof toPoint,
  typeof fromPoint
>;

export const testOklchHcEditor = {
  id: "test-oklch-hc",
  representationId: "oklch",
  geometryId: testOklchHcGeometry.id,
  pointOperationId: "test-oklch-hc-point",
} as const satisfies EditorContract<
  "oklch",
  "test-oklch-hc",
  "test-oklch-hc-rectangle",
  "test-oklch-hc-point"
>;
