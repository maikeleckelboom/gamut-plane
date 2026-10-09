// Test/evidence-only CSS Color 4 XYZ D65 route, independent of production fused LMS matrices.
// https://www.w3.org/TR/2026/CRD-css-color-4-20261009/#color-conversion-code
export type Triple = [number, number, number];
type Matrix = readonly (readonly number[])[];
export const rgbToXyz = {
  srgb: [
    [506752 / 1228815, 87881 / 245763, 12673 / 70218],
    [87098 / 409605, 175762 / 245763, 12673 / 175545],
    [7918 / 409605, 87881 / 737289, 1001167 / 1053270],
  ],
  "display-p3": [
    [608311 / 1250200, 189793 / 714400, 198249 / 1000160],
    [35783 / 156275, 247089 / 357200, 198249 / 2500400],
    [0, 32229 / 714400, 5220557 / 5000800],
  ],
} as const;
const xyzToLms = [
  [0.819022437996703, 0.3619062600528904, -0.1288737815209879],
  [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
  [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
];
const lmsToLab = [
  [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
  [1.9779985324311684, -2.4285922420485799, 0.450593709617411],
  [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];
export const multiply = (m: Matrix, v: readonly number[]): Triple =>
  m.map((row) => row.reduce((sum, value, i) => sum + value * v[i]!, 0)) as Triple;
function inverse(m: Matrix): Matrix {
  const [a, b, c] = m[0]!,
    [d, e, f] = m[1]!,
    [g, h, i] = m[2]!;
  const det = a! * (e! * i! - f! * h!) - b! * (d! * i! - f! * g!) + c! * (d! * h! - e! * g!);
  return [
    [e! * i! - f! * h!, c! * h! - b! * i!, b! * f! - c! * e!],
    [f! * g! - d! * i!, a! * i! - c! * g!, c! * d! - a! * f!],
    [d! * h! - e! * g!, b! * g! - a! * h!, a! * e! - b! * d!],
  ].map((row) => row.map((v) => v / det));
}
const labToLms = inverse(lmsToLab),
  lmsToXyz = inverse(xyzToLms);
const xyzToRgb = { srgb: inverse(rgbToXyz.srgb), "display-p3": inverse(rgbToXyz["display-p3"]) };
export function referenceLab(rgb: readonly number[], space: "srgb" | "display-p3"): Triple {
  return multiply(lmsToLab, multiply(xyzToLms, multiply(rgbToXyz[space], rgb)).map(Math.cbrt));
}
export function referenceLinear(
  lab: readonly number[],
  space: "srgb" | "display-p3" = "srgb",
): Triple {
  return multiply(
    xyzToRgb[space],
    multiply(
      lmsToXyz,
      multiply(labToLms, lab).map((v) => v ** 3),
    ),
  );
}
export const referenceEncode = (v: number) =>
  Math.sign(v) *
  (Math.abs(v) <= 0.0031308 ? Math.abs(v) * 12.92 : 1.055 * Math.abs(v) ** (1 / 2.4) - 0.055);
export const referenceBytes = (lab: readonly number[], space: "srgb" | "display-p3" = "srgb") =>
  referenceLinear(lab, space).map((v) =>
    Math.round(Math.max(0, Math.min(1, referenceEncode(v))) * 255),
  );
