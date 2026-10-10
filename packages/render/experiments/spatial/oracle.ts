// Experiment-only truth for spatial geometry qualification. Not shipped, not exported.
//
// Independent CSS Color 4 linear RGB -> XYZ D65 -> LMS -> OKLab route, transcribed from
// https://www.w3.org/TR/2026/CRD-css-color-4-20261009/#color-conversion-code and kept separate from
// the production conversion kernel (@texel/color through core). It also supplies analytic Jacobians,
// which the production kernel does not expose. Scene coordinates are [a, L, b], equal OKLab units.

export type Space = "srgb" | "display-p3";
export type Vec3 = [number, number, number];
type Matrix = readonly (readonly number[])[];

const rgbToXyz: Record<Space, Matrix> = {
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
};
const xyzToLms: Matrix = [
  [0.819022437996703, 0.3619062600528904, -0.1288737815209879],
  [0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
  [0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
];
const lmsToLab: Matrix = [
  [0.210454268309314, 0.7936177747023054, -0.0040720430116193],
  [1.9779985324311684, -2.4285922420485799, 0.450593709617411],
  [0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];

const multiplyMatrix = (a: Matrix, b: Matrix): number[][] =>
  a.map((row) => b[0]!.map((_, column) => row.reduce((sum, v, k) => sum + v * b[k]![column]!, 0)));
function inverse(m: Matrix): number[][] {
  const [[a, b, c], [d, e, f], [g, h, i]] = m as [number[], number[], number[]] as [
    [number, number, number],
    [number, number, number],
    [number, number, number],
  ];
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  return [
    [e * i - f * h, c * h - b * i, b * f - c * e],
    [f * g - d * i, a * i - c * g, c * d - a * f],
    [d * h - e * g, b * g - a * h, a * e - b * d],
  ].map((row) => row.map((v) => v / det));
}
const apply = (m: Matrix, v: readonly number[]): Vec3 =>
  m.map((row) => row[0]! * v[0]! + row[1]! * v[1]! + row[2]! * v[2]!) as Vec3;

/** Linear RGB -> LMS for each space, and its inverse. */
const toLms = {
  srgb: multiplyMatrix(xyzToLms, rgbToXyz.srgb),
  "display-p3": multiplyMatrix(xyzToLms, rgbToXyz["display-p3"]),
};
const fromLms = { srgb: inverse(toLms.srgb), "display-p3": inverse(toLms["display-p3"]) };
const labToLms = inverse(lmsToLab);

/** Linear RGB to scene [a, L, b]. Extended and negative inputs follow the sign-preserving cube root. */
export function scene(q: readonly number[], space: Space): Vec3 {
  const lab = apply(lmsToLab, apply(toLms[space], q).map(Math.cbrt));
  return [lab[1], lab[0], lab[2]];
}

/** Scene [a, L, b] to linear RGB. */
export function inverseScene(x: readonly number[], space: Space): Vec3 {
  const cone = apply(labToLms, [x[1]!, x[0]!, x[2]!]).map((v) => v ** 3);
  return apply(fromLms[space], cone);
}

/** Scene point and its three columns d(scene)/d(q_k). Singular where an LMS component is zero. */
export function sceneWithJacobian(
  q: readonly number[],
  space: Space,
): { point: Vec3; columns: [Vec3, Vec3, Vec3] } {
  const lms = apply(toLms[space], q);
  const cone = lms.map(Math.cbrt) as Vec3;
  const lab = apply(lmsToLab, cone);
  const columns = [0, 1, 2].map((k) => {
    const dCone = [0, 1, 2].map((i) => toLms[space][i]![k]! / (3 * cone[i]! * cone[i]!));
    const dLab = apply(lmsToLab, dCone);
    return [dLab[1], dLab[0], dLab[2]] as Vec3;
  }) as [Vec3, Vec3, Vec3];
  return { point: [lab[1], lab[0], lab[2]], columns };
}

/** The free (u, v) axes of the cube face whose fixed axis is `axis`. Matches the production layout. */
export const FACE_FREE_AXES = [
  [1, 2],
  [0, 2],
  [0, 1],
] as const;

/** Face byte: 2 * fixed axis + fixed value, as the production mesh stores per triangle. */
export function faceRgb(face: number, u: number, v: number): Vec3 {
  const axis = face >> 1;
  const q: Vec3 = [0, 0, 0];
  q[axis] = face & 1;
  q[FACE_FREE_AXES[axis]![0]] = u;
  q[FACE_FREE_AXES[axis]![1]] = v;
  return q;
}

/** True surface point and tangent columns d/du, d/dv on a face. */
export function faceSurface(
  face: number,
  u: number,
  v: number,
  space: Space,
): { point: Vec3; du: Vec3; dv: Vec3 } {
  const axis = face >> 1;
  const { point, columns } = sceneWithJacobian(faceRgb(face, u, v), space);
  return {
    point,
    du: columns[FACE_FREE_AXES[axis]![0]],
    dv: columns[FACE_FREE_AXES[axis]![1]],
  };
}

export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const unit = (a: Vec3): Vec3 => scale(a, 1 / (norm(a) || 1));

/**
 * Outward unit normal of the true face surface at (u, v). The orientation is fixed by a local
 * displacement test (inward in RGB maps to inward in the scene), never by a convexity assumption.
 */
export function faceOutwardNormal(face: number, u: number, v: number, space: Space): Vec3 | null {
  const { point, du, dv } = faceSurface(face, u, v, space);
  const raw = cross(du, dv);
  if (!(norm(raw) > 0) || !Number.isFinite(norm(raw))) return null;
  const axis = face >> 1;
  const q = faceRgb(face, u, v);
  // Move 1e-4 of the cube edge inward; clamp so extended coordinates are never needed here.
  q[axis] = q[axis]! + (face & 1 ? -1 : 1) * 1e-4;
  const inward = sub(scene(q, space), point);
  return dot(raw, inward) > 0 ? unit(scale(raw, -1)) : unit(raw);
}

/** sRGB electro-optical transfer: encoded -> linear, for [0, 1]. */
export const decodeEncoded = (t: number) =>
  t <= 0.04045 ? t / 12.92 : ((t + 0.055) / 1.055) ** 2.4;

/** Deterministic low-discrepancy sequence (radical inverse), base b, 1-indexed. */
export function halton(index: number, base: number): number {
  let f = 1,
    r = 0,
    i = index;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r;
}
