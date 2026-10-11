// Test-only framebuffer fixtures using the production marker, with controlled opaque backgrounds.
import {
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { createMarkerLayer } from "../src/spatial/sectionLayers";

export function markerProbe(dpr: number) {
  const canvas = document.createElement("canvas");
  const renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(400 * dpr, 300 * dpr, false);
  const camera = new OrthographicCamera(-1, 1, 0.75, -0.75, 0.01, 20);
  camera.position.set(0, 0, 3);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const scene = new Scene(),
    marker = createMarkerLayer();
  marker.setViewport(400 * dpr, 300 * dpr, dpr);
  scene.add(...marker.objects);
  const geometry = new PlaneGeometry(4, 4),
    material = new MeshBasicMaterial({ color: 0xd9dfe5 });
  const wall = new Mesh(geometry, material);
  scene.add(wall);
  const gl = renderer.getContext();
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext("2d")!;
  const rows = [0xffffff, 0xf8f9fa, 0x191d22, 0x000000, 0xff2200, 0x0044ff].map((background) => {
    wall.visible = false;
    marker.set([0.2, 0.1, 0]);
    renderer.setClearColor(background, 1);
    renderer.render(scene, camera);
    context.drawImage(canvas, 0, 0);
    const spot = new Vector3(0.2, 0.1, 0).project(camera);
    const x = (spot.x + 1) * 200,
      y = (1 - spot.y) * 150;
    const read = (x: number, y: number) =>
      Array.from(context.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data).slice(
        0,
        3,
      );
    return {
      background,
      x,
      y,
      center: read(x, y),
      ring: Array.from({ length: 16 }, (_, i) =>
        read(x + 5.3 * Math.cos((i * Math.PI) / 8), y + 5.3 * Math.sin((i * Math.PI) / 8)),
      ),
      // Measure real device-pixel coverage, including the two contrasting bands.
      whiteWidth: Array.from({ length: 30 * dpr }, (_, k) => read(x - 15 + k / dpr, y)).filter(
        (rgb) => Math.min(...rgb) > 235,
      ).length,
      png: copy.toDataURL(),
    };
  });
  wall.visible = true;
  marker.set([0.2, 0.1, -0.2]);
  renderer.render(scene, camera);
  const hidden = new Uint8Array(4),
    ring = new Uint8Array(4),
    halo = new Uint8Array(4);
  gl.readPixels(240 * dpr, 170 * dpr, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, hidden);
  gl.readPixels(244 * dpr, 170 * dpr, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, ring);
  gl.readPixels(245 * dpr, 170 * dpr, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, halo);
  marker.dispose();
  geometry.dispose();
  material.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return {
    rows,
    hidden: Array.from(hidden).slice(0, 3),
    hiddenRing: Array.from(ring).slice(0, 3),
    hiddenHalo: Array.from(halo).slice(0, 3),
  };
}
