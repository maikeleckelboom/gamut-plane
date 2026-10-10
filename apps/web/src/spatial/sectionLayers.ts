import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  GLSL3,
  GreaterDepth,
  LessEqualDepth,
  Matrix3,
  Mesh,
  NoBlending,
  RawShaderMaterial,
  Vector2,
  Vector3,
  type Scene,
} from "three";
import { spatialColorDefinition } from "@gamut-plane/render/internal/spatial";
import type { LightnessSection } from "@gamut-plane/render/internal/spatial";
import { createLineLayer, type LineLayer, type LineStyle } from "./lineLayer";
import { SECTION_FOOTPRINT } from "./spatialCamera";

const matrix = (rows: readonly (readonly number[])[]) =>
  new Matrix3().set(
    rows[0]![0]!,
    rows[0]![1]!,
    rows[0]![2]!,
    rows[1]![0]!,
    rows[1]![1]!,
    rows[1]![2]!,
    rows[2]![0]!,
    rows[2]![1]!,
    rows[2]![2]!,
  );
const srgbVector = (hex: number) =>
  new Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);

/** Section capacity in line segments. The generator's vertex limit is set to fit it. */
export const SECTION_CAPACITY = 4096;
/**
 * Section line identity. sRGB is a solid mint line; Display P3 is a dashed amber line. Color is never
 * the only cue: weight and dash differ, and both differ from the gamut outline (pale blue, 1.75 px).
 */
export const sectionStyles = {
  srgb: {
    visible: { color: 0x6ee7c8, width: 2.5 } satisfies LineStyle,
    hidden: { color: 0x3f9d88, width: 1.5, dash: { on: 3, off: 3 } } satisfies LineStyle,
  },
  "display-p3": {
    visible: { color: 0xf7b955, width: 2.5, dash: { on: 9, off: 5 } } satisfies LineStyle,
    hidden: { color: 0xa87a37, width: 1.5, dash: { on: 3, off: 3 } } satisfies LineStyle,
  },
} as const;
const casing = { color: 0x0b0e12, extra: 2.5 };
const footprintStyle = { color: 0x7e8b97, width: 1.25 } satisfies LineStyle;
const footprintHiddenStyle = {
  color: 0x56626d,
  width: 1,
  dash: { on: 3, off: 5 },
} satisfies LineStyle;
const stemStyle = { color: 0x9aa8b4, width: 1.25, dash: { on: 2, off: 4 } } satisfies LineStyle;
/** The part of the body the cut removed: a faint outline so the whole gamut stays recognizable. */
const ghostStyle = { color: 0x7b8a97, width: 1.25, dash: { on: 5, off: 4 } } satisfies LineStyle;

// --- Section cap -----------------------------------------------------------------------------------
/**
 * A quad on the plane L = level whose fragments exist only where the FOCUSED gamut contains the
 * color (L, a, b). Membership is evaluated per fragment with the same core-owned OKLab to linear RGB
 * definition the surface shader uses, so the fill is the in-gamut region itself (any number of
 * components, notches included), not a polygon built from the contour. The contour lines are drawn
 * from the exact generator and sit over its edge. Color mode shows the real preview color of each
 * fragment, which is the a/b color field of the OKLab editor at this lightness; Shape mode a flat tone.
 */
export function createSectionCap() {
  const display = spatialColorDefinition("srgb");
  const transfer = display.transfer;
  const geometry = new BufferGeometry();
  const half = 0.5;
  geometry.setAttribute(
    "position",
    new BufferAttribute(
      new Float32Array([-half, 0, -half, half, 0, -half, half, 0, half, -half, 0, half]),
      3,
    ),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const material = new RawShaderMaterial({
    glslVersion: GLSL3,
    toneMapped: false,
    blending: NoBlending,
    side: DoubleSide,
    uniforms: {
      level: { value: 0.5 },
      labToLms: { value: matrix(display.oklabToLmsPrime) },
      member: { value: matrix(spatialColorDefinition("srgb").lmsToLinearRgb) },
      display: { value: matrix(display.lmsToLinearRgb) },
      shapeMode: { value: 1 },
      neutral: { value: srgbVector(0xd9dfe5) },
    },
    vertexShader: `precision highp float;
      uniform mat4 modelViewMatrix;
      uniform mat4 projectionMatrix;
      uniform float level;
      in vec3 position;
      out vec3 lab;
      void main() {
        lab = vec3(level, position.x, position.z);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position.x, level, position.z, 1.0);
      }`,
    fragmentShader: `precision highp float;
      uniform mat3 labToLms;
      uniform mat3 member;
      uniform mat3 display;
      uniform float shapeMode;
      uniform vec3 neutral;
      in vec3 lab;
      out vec4 outputColor;
      vec3 encode(vec3 linearRgb) {
        vec3 magnitude = abs(linearRgb);
        vec3 power = ${transfer.scale} * pow(magnitude, vec3(${transfer.exponent})) - ${transfer.offset};
        vec3 low = ${transfer.slope} * magnitude;
        return sign(linearRgb) * mix(power, low, lessThanEqual(magnitude, vec3(${transfer.threshold})));
      }
      void main() {
        vec3 lms = labToLms * lab;
        vec3 cone = lms * lms * lms;
        vec3 inGamut = member * cone;
        float tolerance = 1e-6;
        if (any(lessThan(inGamut, vec3(-tolerance))) || any(greaterThan(inGamut, vec3(1.0 + tolerance)))) discard;
        outputColor = shapeMode > 0.5 ? vec4(neutral, 1.0) : vec4(encode(display * cone), 1.0);
      }`,
  });
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 1;
  return {
    mesh,
    setLevel(level: number) {
      material.uniforms.level!.value = level;
    },
    /** The gamut whose membership defines the filled region (the focused surface's gamut). */
    setGamut(space: "srgb" | "display-p3") {
      material.uniforms.member!.value = matrix(spatialColorDefinition(space).lmsToLinearRgb);
    },
    setColor(color: boolean) {
      material.uniforms.shapeMode!.value = color ? 0 : 1;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
export type SectionCap = ReturnType<typeof createSectionCap>;

// --- Selected-color marker ---------------------------------------------------------------------------
const MARKER_CORE = 4.5;
const MARKER_HALO = 2;
/**
 * A constant-screen-size marker at the color's true scene position. It is depth tested like the
 * surfaces, never drawn always on top: where nothing hides it, a light disc with a dark halo; where a
 * surface hides it, only a dim hollow ring, the same "dashed means behind" convention as the outlines.
 * The depth pull toward the viewer is larger than a line's so a marker lying on a section is not cut
 * in two by the plane it sits on.
 */
export function createMarkerLayer() {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "corner",
    new BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const resolution = new Vector2(1, 1);
  const center = new Vector3();
  const vertexShader = `precision highp float;
    uniform mat4 modelViewMatrix;
    uniform mat4 projectionMatrix;
    uniform vec2 resolution;
    uniform float extent;
    uniform float ratio;
    uniform vec3 center;
    in vec2 corner;
    out vec2 local;
    void main() {
      vec4 clip = projectionMatrix * modelViewMatrix * vec4(center, 1.0);
      clip.z -= 1.2e-3 * clip.w;
      // Offset in drawing-buffer pixels, then express the offset in CSS pixels for the fragment.
      clip.xy += corner * extent * ratio / (0.5 * resolution) * clip.w;
      gl_Position = clip;
      local = corner * extent;
    }`;
  const make = (fragmentShader: string, depthFunc: typeof LessEqualDepth | typeof GreaterDepth) => {
    const material = new RawShaderMaterial({
      glslVersion: GLSL3,
      vertexShader,
      fragmentShader,
      blending: NoBlending,
      side: DoubleSide,
      depthTest: true,
      depthWrite: false,
      depthFunc,
      toneMapped: false,
      uniforms: {
        resolution: { value: resolution },
        ratio: { value: 1 },
        extent: { value: MARKER_CORE + MARKER_HALO + 1 },
        center: { value: center },
      },
    });
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    return { mesh, material };
  };
  const front = make(
    `precision highp float;
    in vec2 local;
    out vec4 outputColor;
    void main() {
      float r = length(local);
      if (r <= ${MARKER_CORE.toFixed(2)}) outputColor = vec4(0.96, 0.97, 0.98, 1.0);
      else if (r <= ${(MARKER_CORE + MARKER_HALO).toFixed(2)}) outputColor = vec4(0.043, 0.055, 0.07, 1.0);
      else discard;
    }`,
    LessEqualDepth,
  );
  const behind = make(
    `precision highp float;
    in vec2 local;
    out vec4 outputColor;
    void main() {
      float r = length(local);
      if (abs(r - ${MARKER_CORE.toFixed(2)}) > 0.9) discard;
      outputColor = vec4(0.79, 0.84, 0.88, 1.0);
    }`,
    GreaterDepth,
  );
  front.mesh.renderOrder = 6;
  behind.mesh.renderOrder = 7;
  let enabled = false;
  const apply = () => {
    front.mesh.visible = enabled;
    behind.mesh.visible = enabled;
  };
  return {
    objects: [front.mesh, behind.mesh],
    /** Scene coordinates [a, L, b]; null removes the marker. */
    set(point: readonly [number, number, number] | null) {
      enabled = point !== null;
      if (point) center.set(point[0], point[1], point[2]);
      apply();
    },
    setViewport(backingWidth: number, backingHeight: number, ratio: number) {
      resolution.set(backingWidth, backingHeight);
      for (const item of [front, behind]) item.material.uniforms.ratio!.value = ratio;
    },
    get position() {
      return enabled ? ([center.x, center.y, center.z] as const) : null;
    },
    dispose() {
      geometry.dispose();
      front.material.dispose();
      behind.material.dispose();
    },
  };
}
export type MarkerLayer = ReturnType<typeof createMarkerLayer>;

// --- Contours, footprint and ghost -------------------------------------------------------------------
export function createSectionLayers(hooks: { scene: Scene; add: (layer: LineLayer) => LineLayer }) {
  const contours = {
    srgb: hooks.add(
      createLineLayer({
        capacity: SECTION_CAPACITY,
        ...sectionStyles.srgb,
        casing,
        renderOrder: 4,
      }),
    ),
    "display-p3": hooks.add(
      createLineLayer({
        capacity: SECTION_CAPACITY,
        ...sectionStyles["display-p3"],
        casing,
        renderOrder: 4,
      }),
    ),
  } as const;
  const footprint = hooks.add(
    createLineLayer({
      capacity: 8,
      visible: footprintStyle,
      hidden: footprintHiddenStyle,
      renderOrder: 2,
    }),
  );
  const ghost = hooks.add(
    createLineLayer({ capacity: 16384, visible: ghostStyle, hidden: null, renderOrder: 2 }),
  );
  const stem = hooks.add(
    createLineLayer({ capacity: 1, visible: stemStyle, hidden: null, renderOrder: 2 }),
  );
  return { contours, footprint, ghost, stem };
}

/**
 * A faint drop line from the selected color to the section plane when they differ in lightness, so
 * a marker above or below an inspected section reads as "this color, at another lightness". It is a
 * guide, not a second marker: the color itself is never drawn anywhere but its true position.
 */
export function writeStem(
  layer: LineLayer,
  marker: readonly [number, number, number] | null,
  level: number | null,
) {
  if (!marker || level === null || Math.abs(marker[1] - level) < 1e-3) {
    layer.commit(0);
    return;
  }
  layer.buffer.set([marker[0], marker[1], marker[2], marker[0], level, marker[2]]);
  layer.commit(1);
}

/** Write a section's loops as line segments. Zero-length segments (planes through a cube vertex) are skipped. */
export function writeContour(layer: LineLayer, section: LightnessSection | null): number {
  let count = 0;
  if (section && section.kind === "region") {
    const buffer = layer.buffer;
    const capacity = Math.floor(buffer.length / 6);
    for (const loop of section.loops) {
      const n = loop.edges.length;
      for (let k = 0; k < n && count < capacity; k++) {
        const j = (k + 1) % n;
        const o = 6 * count;
        const x0 = loop.positions[3 * k]!,
          z0 = loop.positions[3 * k + 2]!,
          x1 = loop.positions[3 * j]!,
          z1 = loop.positions[3 * j + 2]!;
        if (x0 === x1 && z0 === z1) continue;
        buffer[o] = x0;
        buffer[o + 1] = section.lightness;
        buffer[o + 2] = z0;
        buffer[o + 3] = x1;
        buffer[o + 4] = section.lightness;
        buffer[o + 5] = z1;
        count++;
      }
    }
  }
  layer.commit(count);
  return count;
}

/** The viewing plane: the footprint rectangle at the section lightness. */
export function writeFootprint(layer: LineLayer, level: number | null) {
  if (level === null) {
    layer.commit(0);
    return;
  }
  const h = SECTION_FOOTPRINT;
  const corners = [
    [-h, -h],
    [h, -h],
    [h, h],
    [-h, h],
  ] as const;
  corners.forEach(([x0, z0], k) => {
    const [x1, z1] = corners[(k + 1) % 4]!;
    layer.buffer.set([x0, level, z0, x1, level, z1], 6 * k);
  });
  layer.commit(4);
}
