import { expect, it } from "vitest";
import { isolateRoots } from "../src/spatial/huePolynomial.js";

const run = (p: number[], evaluations = 10000, iterations = 80) =>
  isolateRoots(p, { polynomialEvaluations: 0, rootIterations: 0 }, evaluations, iterations);

it("isolates simple cubic roots across an uncertain stationary cluster", () => {
  for (const offset of [-0.01, 0.01]) {
    const p = [-0.125 + offset, 0.75, -1.5, 1];
    expect(run(p)).toEqual([expect.closeTo(0.5 + Math.cbrt(-offset), 13)]);
    expect(run(p)).toEqual(run(p));
  }
  // The derivative may have a tiny unresolved pair, not necessarily an exact double.
  expect(run([-0.135, 0.75 - 1e-15, -1.5, 1])).toHaveLength(1);
});

it("retains simple and close roots and near-endpoint roots", () => {
  expect(run([-0.08, 0.66, -1.5, 1])).toEqual([
    expect.closeTo(0.2, 12),
    expect.closeTo(0.5, 12),
    expect.closeTo(0.8, 12),
  ]);
  expect(run([0.25 - 1e-8, -1, 1])).toEqual([
    expect.closeTo(0.4999, 10),
    expect.closeTo(0.5001, 10),
  ]);
  for (const root of [0, 1e-12, 1 - 1e-12, 1]) expect(run([-root, 1])).toEqual([root]);
});

it("refuses original tangencies, triple roots, unresolved pairs and coincidences", () => {
  for (const p of [
    [0.25, -1, 1],
    [-0.125, 0.75, -1.5, 1],
    [0.25 - 1e-16, -1, 1],
  ])
    expect(() => run(p)).toThrow(/multiple root/);
  expect(() => run([0, 0, 0, 0])).toThrow(/coincident/);
  expect(() => run([-0.135, 0.75, -1.5, 1], 1)).toThrow(/budget/);
  expect(() => run([-0.135, 0.75, -1.5, 1], 10000, 1)).toThrow(/budget/);
});
