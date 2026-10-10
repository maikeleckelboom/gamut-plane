import {
  Float32BufferAttribute,
  GLSL3,
  DoubleSide,
  GreaterDepth,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  LessEqualDepth,
  Mesh,
  NoBlending,
  RawShaderMaterial,
  Vector2,
  Vector3,
} from "three";

/** Widths and dash lengths are CSS pixels; the layer converts them to drawing-buffer pixels. */
export interface LineStyle {
  /** sRGB hex. The scene's drawing buffer is sRGB, so the value is written as given. */
  readonly color: number;
  readonly width: number;
  /** Screen-space stipple (CSS px on, CSS px off). Omitted for a solid line. */
  readonly dash?: { readonly on: number; readonly off: number };
}

const vertexShader = `precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform vec2 resolution;
uniform float halfWidth;
uniform float depthBias;
in vec2 corner;
in vec3 instanceStart;
in vec3 instanceEnd;
out vec2 vLocal;
flat out float vHalfLength;
void main() {
  vec4 a = projectionMatrix * modelViewMatrix * vec4(instanceStart, 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(instanceEnd, 1.0);
  vec2 halfRes = 0.5 * resolution;
  vec2 pa = a.xy / a.w * halfRes;
  vec2 pb = b.xy / b.w * halfRes;
  vec2 delta = pb - pa;
  float length2 = length(delta);
  vec2 along = length2 > 1e-6 ? delta / length2 : vec2(1.0, 0.0);
  vec2 across = vec2(-along.y, along.x);
  float mixing = 0.5 * corner.x + 0.5;
  vec4 clip = mix(a, b, mixing);
  // A small pull toward the camera makes lines that coincide with a surface read as in front,
  // instead of z-fighting between solid and stippled.
  clip.z -= depthBias * clip.w;
  // Extend each end by the half width (round cap) and offset across the line, in pixels.
  vec2 pixels = along * corner.x * halfWidth + across * corner.y * halfWidth;
  clip.xy += pixels / halfRes * clip.w;
  gl_Position = clip;
  vHalfLength = 0.5 * length2;
  vLocal = vec2(corner.x * (0.5 * length2 + halfWidth), corner.y * halfWidth);
}`;
const fragmentShader = `precision highp float;
uniform vec3 color;
uniform float halfWidth;
uniform vec2 dash; // on, off in drawing-buffer pixels; period 0 means solid
in vec2 vLocal;
flat in float vHalfLength;
out vec4 outputColor;
void main() {
  float overshoot = max(abs(vLocal.x) - vHalfLength, 0.0);
  if (overshoot * overshoot + vLocal.y * vLocal.y > halfWidth * halfWidth) discard;
  // A pattern fixed to the screen is continuous across segments and independent of zoom.
  float period = dash.x + dash.y;
  if (period > 0.0 && mod(gl_FragCoord.x + gl_FragCoord.y, period) > dash.x) discard;
  outputColor = vec4(color, 1.0);
}`;

function srgb(hex: number) {
  return new Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

/**
 * Screen-space-width line segments in one preallocated GPU buffer. Native WebGL lines are always one
 * device pixel and cannot be relied on for thickness, so segments are instanced quads with round
 * caps. The same buffer is drawn up to twice: depth-tested in front (`visible`) and where the scene
 * surface occludes it (`hidden`, conventionally stippled). Solid fills; there is no blending and no
 * order-dependent transparency. Updating is an in-place write: no buffer is created after
 * construction, so nothing can leak while the camera moves.
 */
export function createLineLayer(options: {
  capacity: number;
  visible: LineStyle | null;
  hidden: LineStyle | null;
  renderOrder: number;
  /** Optional solid backing drawn under the visible line, `extra` CSS px wider, for legibility over color. */
  casing?: { readonly color: number; readonly extra: number };
}) {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute("corner", new Float32BufferAttribute([-1, -1, 1, -1, 1, 1, -1, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const buffer = new Float32Array(options.capacity * 6);
  const instances = new InstancedInterleavedBuffer(buffer, 6, 1);
  geometry.setAttribute("instanceStart", new InterleavedBufferAttribute(instances, 3, 0));
  geometry.setAttribute("instanceEnd", new InterleavedBufferAttribute(instances, 3, 3));
  geometry.instanceCount = 0;
  const resolution = new Vector2(1, 1);
  const make = (style: LineStyle, depthFunc: typeof LessEqualDepth | typeof GreaterDepth) => {
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
        halfWidth: { value: style.width / 2 },
        // NDC units; about 0.003 scene units for the orthographic near/far range.
        depthBias: { value: 3e-4 },
        color: { value: srgb(style.color) },
        dash: { value: new Vector2(style.dash?.on ?? 0, style.dash?.off ?? 0) },
      },
    });
    const line = new Mesh(geometry, material);
    line.frustumCulled = false;
    line.visible = false;
    return { line, material, style };
  };
  const front = options.visible ? make(options.visible, LessEqualDepth) : null;
  const back = options.hidden ? make(options.hidden, GreaterDepth) : null;
  const casing =
    front && options.visible && options.casing
      ? make(
          { color: options.casing.color, width: options.visible.width + options.casing.extra },
          LessEqualDepth,
        )
      : null;
  if (casing) casing.line.renderOrder = options.renderOrder - 0.5;
  if (front) front.line.renderOrder = options.renderOrder;
  if (back) back.line.renderOrder = options.renderOrder + 1;
  const objects: Mesh[] = [];
  if (casing) objects.push(casing.line);
  if (front) objects.push(front.line);
  if (back) objects.push(back.line);
  let count = 0;
  let enabled = false;
  const apply = () => {
    const shown = enabled && count > 0;
    if (casing) casing.line.visible = shown;
    if (front) front.line.visible = shown;
    if (back) back.line.visible = shown;
  };
  return {
    objects,
    /** The writable segment buffer, six floats per segment. */
    buffer,
    /** Publish `segments` written into `buffer`. */
    commit(segments: number) {
      count = Math.min(segments, options.capacity);
      geometry.instanceCount = count;
      instances.needsUpdate = true;
      apply();
    },
    setEnabled(value: boolean) {
      enabled = value;
      apply();
    },
    /** `backingWidth`/`backingHeight` are drawing-buffer pixels; `ratio` is buffer px per CSS px. */
    setViewport(backingWidth: number, backingHeight: number, ratio: number) {
      resolution.set(backingWidth, backingHeight);
      for (const item of [casing, front, back]) {
        if (!item) continue;
        item.material.uniforms.halfWidth!.value = (item.style.width * ratio) / 2;
        (item.material.uniforms.dash!.value as Vector2).set(
          (item.style.dash?.on ?? 0) * ratio,
          (item.style.dash?.off ?? 0) * ratio,
        );
      }
    },
    get segments() {
      return count;
    },
    dispose() {
      geometry.dispose();
      casing?.material.dispose();
      front?.material.dispose();
      back?.material.dispose();
    },
  };
}
export type LineLayer = ReturnType<typeof createLineLayer>;
