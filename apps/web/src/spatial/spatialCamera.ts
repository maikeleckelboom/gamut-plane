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
