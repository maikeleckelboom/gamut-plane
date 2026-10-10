/** Bounded polynomial isolation on [0,1]. Internal numerical primitive, not a package entry. */
export type Polynomial = readonly number[];
export type HueFailureCode = "invalid-options" | "resource-budget" | "numerical-failure";
export class HueFailure extends Error {
  readonly code: HueFailureCode;
  constructor(code: HueFailureCode, message: string) {
    super(message);
    this.code = code;
  }
}
export interface PolynomialWork {
  polynomialEvaluations: number;
  rootIterations: number;
}
export function evaluate(p: Polynomial, x: number): number {
  let y = 0;
  for (let i = p.length - 1; i >= 0; i--) y = y * x + p[i]!;
  return y;
}

/** Derivative partitioning finds every simple root, including close pairs. Ambiguous multiple
 * roots fail closed: rounding-scale extrema cannot certify either a tangent or a missing pair. */
export function isolateRoots(
  polynomial: Polynomial,
  work: PolynomialWork,
  maxEvaluations: number,
  maxIterations: number,
): number[] {
  const p = [...polynomial];
  while (p.length > 1 && p.at(-1) === 0) p.pop();
  const at = (x: number) => {
    if (++work.polynomialEvaluations > maxEvaluations)
      throw new HueFailure("resource-budget", "polynomial evaluation budget");
    return evaluate(p, x);
  };
  if (p.length === 1) {
    if (p[0] === 0) throw new HueFailure("numerical-failure", "identically coincident polynomial");
    return [];
  }
  if (p.length === 2) {
    const x = -p[0]! / p[1]!;
    return x >= 0 && x <= 1 ? [x] : [];
  }
  const critical = isolateRoots(
    p.slice(1).map((v, i) => v * (i + 1)),
    work,
    maxEvaluations,
    maxIterations,
  ).filter((x) => x > 0 && x < 1);
  const cuts = [0, ...critical, 1];
  // Conservative diagnostic envelope, not interval arithmetic certification.
  const uncertainty = 64 * Number.EPSILON * p.reduce((sum, v) => sum + Math.abs(v), 0);
  for (const x of critical)
    if (Math.abs(at(x)) <= uncertainty)
      throw new HueFailure("numerical-failure", `unresolved multiple root near u=${x}`);
  const roots: number[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    let lo = cuts[i]!,
      hi = cuts[i + 1]!;
    let a = at(lo);
    const b = at(hi);
    if (a === 0) roots.push(lo);
    if (i + 2 === cuts.length && b === 0) roots.push(hi);
    if (a === 0 || b === 0 || a > 0 === b > 0) continue;
    let resolved = false;
    for (let j = 0; j < maxIterations; j++) {
      work.rootIterations++;
      const mid = (lo + hi) / 2;
      const v = at(mid);
      if (v === 0 || hi - lo <= 4 * Number.EPSILON) {
        roots.push(mid);
        resolved = true;
        break;
      }
      if (a > 0 === v > 0) {
        lo = mid;
        a = v;
      } else hi = mid;
    }
    if (!resolved) throw new HueFailure("resource-budget", "root iteration budget");
  }
  return roots.sort((a, b) => a - b);
}
