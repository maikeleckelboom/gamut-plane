import { expect, it } from "vitest";
import { createColorValue, definitionOf } from "@gamut-plane/core";
import { generateHueSection } from "@gamut-plane/render/internal/spatial";
import { linearRgbToOklabBatch } from "@gamut-plane/core/internal/capabilities";
import {
  acceptHue,
  createHueStore,
  hueBasis,
  hueRelationship,
  initialHueSelection,
  inspectHue,
  observeHue,
  viewedHue,
} from "../src/spatial/hueModel";
import { hueTriangles } from "../src/spatial/sectionLayers";
import { clipSegmentsToRemoved, isKept, isHiddenByCap } from "../src/spatial/sectionPolicy";
import { hueSectionCamera, setCameraAspect } from "../src/spatial/spatialCamera";
import { OrthographicCamera, Vector3 } from "three";

it("retains explicit viewing direction without authoring missing or powerless hue", () => {
  for (const h of [null, 80]) {
    const color = createColorValue({ space: "oklch", channels: [0.6, 0, h], alpha: 0.3 });
    if (!color.ok) throw new Error("fixture");
    const before = definitionOf(color.value);
    expect(observeHue(color.value)).toBe(null);
    expect(viewedHue(initialHueSelection, null)).toBe(0);
    const followed = acceptHue(initialHueSelection, 120);
    expect(viewedHue(acceptHue(followed, null), null)).toBe(120);
    const inspected = inspectHue(followed, -1);
    expect(viewedHue(acceptHue(inspected, 42), 42)).toBe(359);
    expect(viewedHue({ ...inspected, mode: "follow" }, null)).toBe(359);
    expect(definitionOf(color.value)).toEqual(before);
  }
});

it("uses exact hue keys, caches failures and preserves multi-sector/contact structure", () => {
  const store = createHueStore();
  const section = store.get("srgb", 264.1);
  expect(section.status).toBe("ready");
  expect(store.get("srgb", 264.1)).toBe(section);
  store.get("srgb", 264.1 + 1e-10);
  expect(store.stats.builds).toBe(2);
  for (let h = 0; h < 30; h++) store.outcomes(h);
  expect(store.size).toBe(24);
});

it("fans each sector separately and never includes a contact vertex in fill", () => {
  const blue = linearRgbToOklabBatch(new Float64Array([0, 0, 1]), "srgb");
  if (!blue.ok) throw new Error("fixture");
  const blueHue = (Math.atan2(blue.value[2]!, blue.value[1]!) * 180) / Math.PI;
  for (const h of [30, 264.1, blueHue]) {
    const generated = generateHueSection({ space: "srgb", hue: h });
    if (!generated.ok) throw new Error(generated.detail);
    const s = generated.value,
      triangles = hueTriangles(s);
    for (let i = 0; i < triangles.length; i += 3) {
      expect(triangles[i]).toBe(0);
      expect(
        s.loops.some((loop) => {
          const vertices = loop.flatMap((id) => s.arcs[id]!.vertices);
          return vertices.includes(triangles[i + 1]!) && vertices.includes(triangles[i + 2]!);
        }),
      ).toBe(true);
    }
    for (const id of s.contacts)
      for (const vertex of s.arcs[id]!.vertices.filter((v) => v !== 0))
        expect(triangles).not.toContain(vertex);
  }
});

it("aligns C right / L up with equal units at opposite and oblique hues", () => {
  for (const h of [0, 30, 90, 180, 264.1, 359]) {
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 20),
      target = new Vector3();
    setCameraAspect(camera, 1);
    hueSectionCamera(camera, target, h);
    const { radial, normal } = hueBasis(h);
    const origin = target.clone().project(camera);
    const c = target
      .clone()
      .add(new Vector3(...radial).multiplyScalar(0.1))
      .project(camera);
    const l = target
      .clone()
      .add(new Vector3(0, 0.1, 0))
      .project(camera);
    expect(c.x - origin.x).toBeGreaterThan(0);
    expect(l.y - origin.y).toBeCloseTo(c.x - origin.x, 12);
    expect(c.y).toBeCloseTo(origin.y, 12);
    const opposite = radial.map((v) => -v * 0.2) as [number, number, number];
    opposite[1] = 0.5;
    expect(hueRelationship(opposite, h)).toMatchObject({ opposite: true, onHalfPlane: false });
    expect(isKept(normal, 1, 0, normal)).toBe(false);
    const out = new Float32Array(6);
    expect(
      clipSegmentsToRemoved(
        Float32Array.from([...normal.map((v) => -v), ...normal]),
        1,
        1,
        0,
        out,
        normal,
      ),
    ).toBe(1);
    expect(Math.hypot(...out.subarray(0, 3))).toBeLessThan(1e-7);
    expect(
      isHiddenByCap(
        () => true,
        normal.map((v) => -v) as [number, number, number],
        normal,
        1,
        0,
        1e-4,
        normal,
      ),
    ).toBe(true);
  }
});
