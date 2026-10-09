import { GLSL3, Matrix3, NoBlending, RawShaderMaterial } from "three";
import { spatialColorDefinition } from "@gamut-plane/render/internal/spatial";

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

/** Raw output writes encoded sRGB once. No Three lighting, tone mapping or color chunks. */
export function createColorMaterial(output: "srgb" | "display-p3" = "srgb") {
  const definition = spatialColorDefinition(output);
  const transfer = definition.transfer;
  return new RawShaderMaterial({
    glslVersion: GLSL3,
    toneMapped: false,
    blending: NoBlending,
    uniforms: {
      labToLms: { value: matrix(definition.oklabToLmsPrime) },
      lmsToRgb: { value: matrix(definition.lmsToLinearRgb) },
    },
    vertexShader: `precision highp float;
      uniform mat4 modelViewMatrix;
      uniform mat4 projectionMatrix;
      in vec3 position;
      out vec3 lab;
      void main() {
        lab = position.yxz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `precision highp float;
      uniform mat3 labToLms;
      uniform mat3 lmsToRgb;
      in vec3 lab;
      out vec4 outputColor;
      vec3 encode(vec3 linearRgb) {
        vec3 magnitude = abs(linearRgb);
        vec3 power = ${transfer.scale} * pow(magnitude, vec3(${transfer.exponent})) - ${transfer.offset};
        vec3 low = ${transfer.slope} * magnitude;
        return sign(linearRgb) * mix(power, low, lessThanEqual(magnitude, vec3(${transfer.threshold})));
      }
      void main() {
        vec3 lmsPrime = labToLms * lab;
        vec3 linearRgb = lmsToRgb * (lmsPrime * lmsPrime * lmsPrime);
        // Output attachment saturation only. No clipping of coordinates or intermediate LMS/RGB.
        outputColor = vec4(encode(linearRgb), 1.0);
      }`,
  });
}
