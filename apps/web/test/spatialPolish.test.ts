// @vitest-environment node
import { describe, expect, it } from "vitest";
import { OrthographicCamera, Vector2, Vector3, type RawShaderMaterial } from "three";
import { createColorValue, definitionOf } from "@gamut-plane/core";
import { createMarkerLayer, createSectionCap } from "../src/spatial/sectionLayers";
import {
  createSectionStore,
  observeSelected,
  selectedMembership,
} from "../src/spatial/sectionModel";
import { homeCamera } from "../src/spatial/spatialCamera";

describe("endpoint presentation retains scientific authority", () => {
  it.each(["srgb", "display-p3"] as const)("bounds the cap by the genuine %s section", (space) => {
    const store = createSectionStore();
    const cap = createSectionCap();
    for (const l of [0, 0.000001, 0.0001, 0.001, 0.01, 0.5, 0.9999, 1]) {
      const outcome = store.get(space, l);
      expect(outcome.status).toBe("ready");
      if (outcome.status !== "ready") throw new Error(outcome.detail);
      const section = outcome.section;
      expect(section.kind).toBe(l === 0 || l === 1 ? "point" : "region");
      cap.setLightness(section);
      const p = cap.mesh.geometry.getAttribute("position");
      if (section.kind === "point") {
        expect(section.loops).toHaveLength(0);
        expect(Array.from(section.points)).toEqual([0, l, 0]);
        expect(p.getX(2) - p.getX(0)).toBe(0);
        expect(p.getZ(2) - p.getZ(0)).toBe(0);
      } else {
        const bounds = section.bounds!;
        expect(p.getX(0)).toBe(Math.fround(bounds.min[0]));
        expect(p.getZ(0)).toBe(Math.fround(bounds.min[1]));
        expect(p.getX(2)).toBe(Math.fround(bounds.max[0]));
        expect(p.getZ(2)).toBe(Math.fround(bounds.max[1]));
        expect(section.loops[0]!.signedArea).toBeGreaterThan(0);
      }
    }
    cap.dispose();
  });
  it.each([0, 1])("does not collapse authored chromatic coordinates at L=%s", (l) => {
    for (const channels of [
      [l, 0, 0],
      [l, 0.0033, 0.0458],
    ] as const) {
      const result = createColorValue({ space: "oklab", channels, alpha: 1 });
      if (!result.ok) throw new Error(result.error.code);
      const value = result.value;
      expect(observeSelected(value)).toEqual({ status: "ok", l, a: channels[1], b: channels[2] });
      for (const space of ["srgb", "display-p3"] as const) {
        const membership = selectedMembership(value, space);
        if (channels[2]) expect(membership).toBe("outside");
        else expect(membership).not.toBe("outside");
      }
      expect(definitionOf(value).channels).toEqual(channels);
    }
  });
});

describe("section-coincident marker depth", () => {
  it("locates the entire screen disc on the supporting plane, with the same center and depth testing", () => {
    const camera = new OrthographicCamera(-1, 1, 0.71, -0.71, 0.01, 20);
    homeCamera(camera, new Vector3());
    camera.updateMatrixWorld(true);
    const marker = createMarkerLayer();
    const center = new Vector3(0.03, 0.6, -0.08);
    marker.set([center.x, center.y, center.z]);
    for (const normal of [new Vector3(0, 1, 0), new Vector3(1, 0, 0)]) {
      marker.setDepthPlane(camera, [normal.x, normal.y, normal.z]);
      const material = marker.objects[0]!.material as RawShaderMaterial;
      const slope = material.uniforms.depthSlope!.value as Vector2;
      const projected = center.clone().project(camera);
      for (const offset of [new Vector2(0.01, -0.01), new Vector2(-0.02, 0.02)]) {
        const corner = new Vector3(
          projected.x + offset.x,
          projected.y + offset.y,
          projected.z + slope.dot(offset),
        ).unproject(camera);
        expect(corner.clone().sub(center).dot(normal)).toBeCloseTo(0, 12);
      }
      for (const object of marker.objects) {
        const m = object.material as RawShaderMaterial;
        expect(m.depthTest).toBe(true);
        expect(m.depthWrite).toBe(false);
      }
      expect(marker.position).toEqual([center.x, center.y, center.z]);
    }
    marker.setDepthPlane(camera, null);
    expect(
      (marker.objects[0]!.material as RawShaderMaterial).uniforms.depthSlope!.value.toArray(),
    ).toEqual([0, 0]);
    marker.dispose();
  });
});
