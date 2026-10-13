// @vitest-environment node
import { expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import {
  createHueTracking,
  homeCamera,
  hueSectionCamera,
  orbitCamera,
} from "../src/spatial/spatialCamera";
import { hueBasis } from "../src/spatial/hueModel";

function fixture(hue = 0) {
  const camera = new OrthographicCamera(-1, 1, 0.71, -0.71, 0.01, 20);
  const target = new Vector3();
  hueSectionCamera(camera, target, hue);
  const track = createHueTracking(camera, target);
  track(hue);
  return { camera, target, track };
}
function relative(camera: OrthographicCamera, target: Vector3, hue: number) {
  const { radial, normal } = hueBasis(hue);
  const offset = camera.position.clone().sub(target);
  return [
    offset.dot(new Vector3(...radial)),
    offset.y,
    offset.dot(new Vector3(...normal)),
    target.dot(new Vector3(...radial)),
    target.y,
    target.dot(new Vector3(...normal)),
    camera.zoom,
  ];
}
function close(actual: number[], expected: number[]) {
  actual.forEach((v, i) => expect(v).toBeCloseTo(expected[i]!, 10));
}
it("increasing hue rotates camera in the correct world direction and keeps C right", () => {
  const { camera, target, track } = fixture();
  expect(track(90)).toBeCloseTo(-Math.PI / 2);
  close(camera.position.clone().sub(target).toArray(), [-3, 0, 0]);
  close(target.toArray(), [0, 0.5, 0.225]);
  const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  expect(right.dot(new Vector3(...hueBasis(90).radial))).toBeCloseTo(1);
});
it("wraps both directions by one degree, never a full revolution", () => {
  const { track } = fixture(359);
  expect(track(0)).toBeCloseTo(-Math.PI / 180);
  expect(track(359)).toBeCloseTo(Math.PI / 180);
  expect(track(719)).toBe(0);
});
it("retains manual orbit, pitch, zoom, distance and section-relative pan through repeated sweeps", () => {
  const { camera, target, track } = fixture(15);
  orbitCamera(camera, target, 3, -2);
  const pan = new Vector3(0.02, -0.06, 0.04);
  target.add(pan);
  camera.position.add(pan);
  camera.zoom = 2.5;
  const before = relative(camera, target, 15);
  const distance = camera.position.distanceTo(target);
  for (let turn = 0; turn < 8; turn++) {
    for (let h = 15; h <= 375; h += 5) {
      track(h);
      close(relative(camera, target, h), before);
    }
    for (let h = 375; h >= 15; h -= 5) {
      track(h);
      close(relative(camera, target, h), before);
    }
  }
  expect(camera.position.distanceTo(target)).toBeCloseTo(distance, 10);
});
it("binds entry and re-entry without a pose jump; invalid values cannot corrupt tracking", () => {
  const { camera, target, track } = fixture(20);
  const before = camera.position.toArray();
  track(null);
  homeCamera(camera, target);
  const home = camera.position.toArray();
  expect(track(300)).toBe(0);
  expect(camera.position.toArray()).toEqual(home);
  expect(track(NaN)).toBe(0);
  expect(track(Infinity)).toBe(0);
  expect(camera.position.toArray()).toEqual(home);
  expect(track(301)).toBeCloseTo(-Math.PI / 180);
  expect(camera.position.toArray()).not.toEqual(before);
});
it("View section replaces the offset; duplicate pending/ready updates never double-rotate", () => {
  const { camera, target, track } = fixture(30);
  orbitCamera(camera, target, 4, 3);
  hueSectionCamera(camera, target, 30);
  const before = relative(camera, target, 30);
  track(240);
  const position = camera.position.toArray();
  expect(track(240)).toBe(0);
  expect(camera.position.toArray()).toEqual(position);
  close(relative(camera, target, 240), before);
});
