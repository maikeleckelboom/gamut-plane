import { Box3, OrthographicCamera, Vector3 } from "three";

export const HOME_DIRECTION = [1.35, 0.8, 1.65] as const;
export const HOME_TARGET = [0, 0.5, 0] as const;
export const HOME_HEIGHT = 1.42;
export const MAX_BACKING_PIXELS = 3_000_000;

/** Keep the scientific ruler readable across the full zoom range without clipping its length. */
export function screenRuler(tenthUnitPixels: number) {
  const unit = 10 ** Math.floor(Math.log10(7 / tenthUnitPixels));
  const units = [unit, 2 * unit, 5 * unit, 10 * unit].reduce((best, candidate) =>
    Math.abs(candidate * tenthUnitPixels * 10 - 70) < Math.abs(best * tenthUnitPixels * 10 - 70)
      ? candidate
      : best,
  );
  return { units, pixels: units * tenthUnitPixels * 10 };
}

export function backingSize(width: number, height: number, dpr: number) {
  if (!(width > 0 && height > 0)) return { width: 0, height: 0, ratio: 0 };
  const ratio = Math.min(Math.max(dpr, 1), 2, Math.sqrt(MAX_BACKING_PIXELS / (width * height)));
  return {
    width: Math.max(1, Math.floor(width * ratio)),
    height: Math.max(1, Math.floor(height * ratio)),
    ratio,
  };
}

export function setCameraAspect(camera: OrthographicCamera, aspect: number) {
  camera.top = HOME_HEIGHT / 2;
  camera.bottom = -camera.top;
  camera.right = camera.top * aspect;
  camera.left = -camera.right;
  camera.updateProjectionMatrix();
}

export function homeCamera(camera: OrthographicCamera, target: Vector3) {
  target.fromArray(HOME_TARGET);
  camera.position.copy(target).add(new Vector3(...HOME_DIRECTION).normalize().multiplyScalar(3));
  camera.up.set(0, 1, 0);
  camera.zoom = 1;
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

/**
 * Tilt, in radians, of the section view away from the exact section normal. OrbitControls keeps the
 * polar angle strictly inside (0, pi) and takes its azimuth from the camera position, so the exact
 * pole would leave the screen up-vector undefined. This makes the up direction explicit and well
 * conditioned; at 1e-4 rad the foreshortening of the plane is below 1e-8.
 */
export const SECTION_VIEW_TILT = 1e-4;
export const SECTION_VIEW_DISTANCE = 3;
export const SECTION_FOOTPRINT = 0.45;

/**
 * Scene coordinates are X = a, Y = L, Z = b, a left-handed arrangement of the right-handed OKLab
 * (L, a, b) frame. Seen from above (+Y) with a to the right, +b points toward the viewer, which is
 * down the screen: the a/b picture of the existing OKLab editor, with +a right and +b up, is the
 * view from BELOW the plane, looking along +Y with the camera's up vector along +Z. Looking from
 * above would mirror either axis.
 *
 * The camera sits on the -Y side with a vanishing azimuthal offset toward +Z. With the shared
 * Y-up OrbitControls frame, three's lookAt then gives screen-right = +X and screen-up = +Z.
 */
export function sectionCamera(
  camera: OrthographicCamera,
  target: Vector3,
  level: number,
  extent: Readonly<{ min: readonly [number, number]; max: readonly [number, number] }> | null,
) {
  const half = SECTION_FOOTPRINT;
  const [minA, minB] = extent?.min ?? [-half, -half];
  const [maxA, maxB] = extent?.max ?? [half, half];
  target.set((minA + maxA) / 2, level, (minB + maxB) / 2);
  camera.position
    .copy(target)
    .add(
      new Vector3(0, -Math.cos(SECTION_VIEW_TILT), Math.sin(SECTION_VIEW_TILT)).multiplyScalar(
        SECTION_VIEW_DISTANCE,
      ),
    );
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  // Frame the extent (at least the footprint's smallest useful size) with 12% breathing room.
  const halfWidth = Math.max((maxA - minA) / 2, 0.05);
  const halfHeight = Math.max((maxB - minB) / 2, 0.05);
  camera.zoom = Math.min(
    12,
    Math.max(0.25, Math.min(camera.right / halfWidth, camera.top / halfHeight) / 1.25),
  );
  camera.updateProjectionMatrix();
}

/** Fit the visible sampled bounds in the existing orientation, with 12% breathing room. */
export function fitCamera(camera: OrthographicCamera, target: Vector3, bounds: Box3) {
  if (bounds.isEmpty()) return;
  const offset = camera.position.clone().sub(target);
  bounds.getCenter(target);
  camera.position.copy(target).add(offset);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  let halfWidth = 0,
    halfHeight = 0;
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const p = new Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
        halfWidth = Math.max(halfWidth, Math.abs(p.x));
        halfHeight = Math.max(halfHeight, Math.abs(p.y));
      }
  camera.zoom = Math.min(
    12,
    Math.max(0.25, Math.min(camera.right / halfWidth, camera.top / halfHeight) / 1.12),
  );
  camera.updateProjectionMatrix();
}
